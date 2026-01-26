
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف.' }, { status: 500 });
    }

    if (!link) {
      return NextResponse.json({ error: 'رابط المجلد مطلوب.' }, { status: 400 });
    }

    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ error: 'خطأ في الوصول للمجلد', details: driveError.message }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ تماماً من الشواهد.' }, { status: 404 });
    }

    const limitedFiles = driveFiles.slice(0, 10);
    const promptParts: any[] = [];
    
    for (const file of limitedFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: { data: base64Data, mimeType: file.mimeType }
      });
      promptParts.push({ text: `[اسم الملف: ${file.name}]\n` });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `
أنت "مدقق جودة تعليمي" صارم جداً. مهمتك هي مراجعة شواهد المعلم المرفقة بدقة متناهية.
لا تمنح أي درجة بناءً على التوقعات؛ اعتمد فقط على ما تراه في الملفات المرسلة.

قواعد التقييم الصارمة:
1. أي معيار لا يوجد له ملف "شاهد" واضح يثبت إنجازه، يجب أن تكون درجته (0) من 5.
2. لا تكرر استخدام نفس الملف لجميع المعايير إلا إذا كان الملف يحتوي فعلياً على بيانات متعددة الجوانب.
3. توزيع الأوزان (المجموع 100%):
   - المعايير (1,2,3,4,5,6,7,10,11): وزن المعيار 10%. (الدرجة 5 تعني 10%).
   - المعايير (8,9): وزن المعيار 5%. (الدرجة 5 تعني 5%).

المعايير الـ 11 المطلوب فحصها:
1. أداء الواجبات الوظيفية.
2. التفاعل مع المجتمع.
3. التفاعل مع أولياء الأمور.
4. التنويع في استراتيجيات التدريس.
5. تحسين نتائج المتعلمين.
6. إعداد وتنفيذ خطة التعلم.
7. توظيف تقنيات ووسائل التعلم.
8. تهيئة البيئة التعليمية.
9. الإدارة الصفية.
10. تحليل نتائج المتعلمين.
11. تنوع أساليب التقويم.

في قسم "justification"، يجب أن تذكر صراحة: "لم يتم العثور على شواهد للمعيار X و Y ولذلك تم منحهم صفر"، و"تم العثور على ملف [اسم الملف] كشاهد للمعيار Z".

يجب أن يكون الرد JSON حصراً:
{
  "suggested_scores": { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 0, "10": 0, "11": 0 },
  "justification": "تقرير التدقيق الصارم..."
}
    `;

    // استخدام gemini-3-pro-preview لضمان أعلى دقة في التدقيق
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [{ parts: promptParts }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.1, // تقليل العشوائية لأدنى حد لضمان الصرامة
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
          },
          required: ['suggested_scores', 'justification']
        }
      }
    });

    const text = response.text;
    return NextResponse.json(JSON.parse(text || '{}'));

  } catch (error: any) {
    console.error("Audit Error:", error);
    return NextResponse.json({ error: 'فشل التدقيق الذكي', details: error.message }, { status: 500 });
  }
}
