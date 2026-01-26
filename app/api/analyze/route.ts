
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { parseFileContent } from '../../../lib/parser';
import { GoogleGenAI, Type } from "@google/genai";

// رفع مدة التنفيذ للمساعدة في معالجة الملفات الكبيرة
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    // 1. التحقق من مفتاح الـ API
    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'خطأ التقني: مفتاح Gemini API غير مضاف في إعدادات السيرفر.' }, { status: 500 });
    }

    // 2. محاولة الوصول لملفات الدرايف
    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveErr: any) {
      return NextResponse.json({ 
        error: 'فشل الوصول للمجلد', 
        details: 'تأكد أن المجلد مشترك (أي شخص لديه الرابط يمكنه العرض) وأن بيانات الوصول للسيرفر صحيحة.' 
      }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ تماماً أو لا يحتوي على ملفات مدعومة (PDF/صور).' }, { status: 404 });
    }

    // 3. معالجة المحتوى لتحويله لبيانات يفهمها الذكاء الاصطناعي
    const promptParts: any[] = [];
    const limitedFiles = driveFiles.slice(0, 8); // فحص أول 8 ملفات لضمان السرعة
    
    for (const file of limitedFiles) {
      const processed = await parseFileContent(file);
      if (processed) {
        if (processed.type === 'text') {
          promptParts.push({ text: `[اسم الملف: ${processed.name}]\nالمحتوى النصي:\n${processed.content}\n---` });
        } else if (processed.type === 'image') {
          promptParts.push({
            inlineData: { data: processed.content, mimeType: processed.mimeType }
          });
          promptParts.push({ text: `صورة شاهد تطبيقية: ${processed.name}` });
        }
      }
    }

    if (promptParts.length === 0) {
      return NextResponse.json({ error: 'لم ينجح النظام في قراءة محتوى الملفات. تأكد من جودة ملفات الـ PDF.' }, { status: 422 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // استخدام الموديل السريع والذكي في نفس الوقت
    const modelName = 'gemini-3-flash-preview';
    
    const systemInstruction = `
أنت الآن "خبير تدقيق جودة تعليمي" صارم جداً. مهمتك هي الحكم على أداء المعلم من خلال الأدلة.

التعليمات المهنية الصارمة:
1. "جدول توزيع الدرجات" أو "أوزان المعايير" أو "توصيف الأداء" (مثل الملف المرفق في الشات) هي وثائق مرجعية وليست شواهد. 
2. إذا وجدت ملفاً يشرح "كيف نقيم المعلم"، لا تعطه أي درجة. ابحث عن (فعل المعلم) مثل: صور حصة، كشف درجات، خطة درس موقعة، رسائل واتساب مع أولياء الأمور.
3. كن مهنياً وقاسياً في الحق: إذا كان المجلد يحتوي فقط على أوراق رسمية عامة، امنح المعلم درجة 0 واذكر في التبرير: "لم يتم العثور على أي شاهد تطبيقي يثبت الأداء الفعلي، الملفات المرفقة هي وثائق إرشادية فقط".
4. الدرجات من (0 إلى 5) لكل معيار.

المعايير الـ 11:
(1:الواجبات، 2:المجتمع المهني، 3:أولياء الأمور، 4:الاستراتيجيات، 5:النتائج، 6:الخطة، 7:التقنية، 8:البيئة، 9:الإدارة، 10:التحليل، 11:التقويم).

الرد JSON حصراً:
{
  "suggested_scores": {"1": 0, "2": 0, ... "11": 0},
  "justification": "تقرير التدقيق المهني: \n- تحليل الملفات: [اذكر ماذا وجدت بالتحديد]\n- النقد: [لماذا استبعدت بعض الملفات]\n- التوصية: [ما الذي يجب على المعلم فعله]"
}
    `;

    const result = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: promptParts }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.1, // لضمان دقة النتائج وعدم الهلوسة
        thinkingConfig: { thinkingBudget: 2000 }, // تفكير مركز وسريع
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggested_scores: {
              type: Type.OBJECT,
              properties: {
                "1": { type: Type.NUMBER }, "2": { type: Type.NUMBER }, "3": { type: Type.NUMBER },
                "4": { type: Type.NUMBER }, "5": { type: Type.NUMBER }, "6": { type: Type.NUMBER },
                "7": { type: Type.NUMBER }, "8": { type: Type.NUMBER }, "9": { type: Type.NUMBER },
                "10": { type: Type.NUMBER }, "11": { type: Type.NUMBER }
              }
            },
            justification: { type: Type.STRING }
          }
        }
      }
    });

    return NextResponse.json(JSON.parse(result.text || '{}'));

  } catch (error: any) {
    console.error("Analysis Error:", error);
    return NextResponse.json({ 
      error: 'حدث خطأ غير متوقع أثناء التدقيق', 
      details: error.message 
    }, { status: 500 });
  }
}
