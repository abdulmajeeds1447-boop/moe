
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { parseFileContent } from '../../../lib/parser';
import { GoogleGenAI, Type } from "@google/genai";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح API غير متوفر' }, { status: 500 });
    }

    // 1. جلب الملفات من درايف
    const driveFiles = await getDriveFiles(link);
    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ أو لا يمكن الوصول إليه' }, { status: 404 });
    }

    // 2. معالجة واستخراج النصوص (تقليل الحجم بشكل ضخم)
    // نكتفي بـ 5 ملفات لضمان عدم تجاوز حدود الحصة المجانية
    const limitedFiles = driveFiles.slice(0, 5);
    const promptParts: any[] = [];
    
    for (const file of limitedFiles) {
      const processed = await parseFileContent(file);
      if (processed) {
        if (processed.type === 'text') {
          // إرسال النص فقط يوفر 90% من الحصة
          promptParts.push({ text: `--- محتوى ملف (${processed.name}) ---\n${processed.content}\n` });
        } else if (processed.type === 'image') {
          promptParts.push({
            inlineData: { data: processed.content, mimeType: processed.mimeType }
          });
          promptParts.push({ text: `[صورة شاهد: ${processed.name}]\n` });
        }
      }
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // استخدام gemini-flash-lite-latest لأنه يوفر أعلى معدل طلبات في الدقيقة (RPM) مجاناً
    const modelName = 'gemini-flash-lite-latest';
    
    const systemInstruction = `
أنت مدقق جودة تعليمي صارم.
حلل الشواهد المرفقة (نصوص أو صور) وقارنها بالمعايير الـ 11 للأداء الوظيفي.
القاعدة الصارمة: المعيار الذي لا تظهر له بينة واضحة في الملفات درجته 0.

المعايير:
1. الواجبات الوظيفية (10%)
2. التفاعل مع المجتمع (10%)
3. التفاعل مع أولياء الأمور (10%)
4. استراتيجيات التدريس (10%)
5. نتائج المتعلمين (10%)
6. خطة التعلم (10%)
7. تقنيات التعلم (10%)
8. البيئة التعليمية (5%)
9. الإدارة الصفية (5%)
10. تحليل النتائج (10%)
11. أساليب التقويم (10%)

الرد يجب أن يكون بصيغة JSON حصراً:
{
  "suggested_scores": {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 0, "10": 0, "11": 0},
  "justification": "تقرير مفصل يوضح الشواهد التي تم العثور عليها وتلك المفقودة."
}
    `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: promptParts }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.1,
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

    return NextResponse.json(JSON.parse(response.text || '{}'));

  } catch (error: any) {
    console.error("Critical Analysis Error:", error);
    let errorMessage = 'حدث خطأ غير متوقع في التدقيق الذكي';
    
    if (error.message?.includes('429')) {
      errorMessage = 'تم الوصول للحد الأقصى للطلبات المجانية. يرجى الانتظار دقيقة واحدة والمحاولة مجدداً.';
    } else if (error.message?.includes('503')) {
      errorMessage = 'خادم الذكاء الاصطناعي مشغول حالياً. جرب بعد لحظات.';
    }

    return NextResponse.json({ error: errorMessage, details: error.message }, { status: error.status || 500 });
  }
}
