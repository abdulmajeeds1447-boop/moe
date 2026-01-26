import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive'; 
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف.' }, { status: 500 });
    }

    // 1. جلب الملفات
    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ error: 'خطأ في الوصول للمجلد', details: driveError.message }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ أو الملفات غير مدعومة.' }, { status: 404 });
    }

    // 2. تجهيز البيانات للذكاء الاصطناعي
    const promptParts: any[] = [];
    for (const file of driveFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: { data: base64Data, mimeType: file.mimeType }
      });
      promptParts.push({ text: `[شاهد: ${file.name}]\n` });
    }

    promptParts.push({ 
      text: "بصفتك الخبير التربوي، قيم هذا المعلم بناءً على الشواهد أعلاه. التزم بـ JSON." 
    });

    // 3. إعداد التعليمات ونوع المخرجات
    const genAI = new GoogleGenerativeAI(process.env.API_KEY);
    const systemInstruction = `
أنت مدير مدرسة خبير. قيّم المعلم بناءً على الشواهد فقط.
المعايير (الوزن %):
1.الواجبات(10) 2.المجتمع(10) 3.أولياء الأمور(10) 4.الاستراتيجيات(10) 5.النتائج(10) 6.الخطة(10) 
7.التقنية(10) 8.البيئة(5) 9.الإدارة(5) 10.التحليل(10) 11.التقويم(10).

الدرجة من 1-5. كن صارماً.
المخرجات JSON حصراً:
{ "suggested_scores": { "1": 0, ... "11": 0 }, "justification": "..." }
    `;

    const modelConfig = {
      systemInstruction,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            suggested_scores: {
              type: SchemaType.OBJECT,
              properties: Object.fromEntries(Array.from({length: 11}, (_, i) => [(i+1).toString(), {type: SchemaType.NUMBER}])),
            },
            justification: { type: SchemaType.STRING }
          }
        }
      }
    };

    // 4. المحاولة الأولى: استخدام الموديل السريع (Flash)
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", ...modelConfig });
      const result = await model.generateContent({ contents: [{ role: 'user', parts: promptParts }] });
      return NextResponse.json(JSON.parse(result.response.text()));
    } catch (flashError: any) {
      console.warn("Flash model failed, trying fallback...", flashError.message);
      
      // 5. المحاولة الثانية (خطة الطوارئ): استخدام الموديل المستقر (Pro)
      // إذا فشل Flash، نستخدم Pro تلقائياً لإنقاذ الموقف
      const fallbackModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro", ...modelConfig });
      const fallbackResult = await fallbackModel.generateContent({ contents: [{ role: 'user', parts: promptParts }] });
      return NextResponse.json(JSON.parse(fallbackResult.response.text()));
    }

  } catch (error: any) {
    console.error("AI Fatal Error:", error);
    return NextResponse.json({ error: 'فشل التحليل', details: error.message }, { status: 500 });
  }
}
