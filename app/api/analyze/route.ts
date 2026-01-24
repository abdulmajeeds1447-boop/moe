
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف في إعدادات السيرفر.' }, { status: 500 });
    }

    if (!link) return NextResponse.json({ error: 'رابط المجلد مطلوب' }, { status: 400 });

    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ 
        error: 'خطأ في الوصول للمجلد', 
        details: driveError.message 
      }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ 
        error: 'المجلد فارغ أو لا يحتوي على ملفات مدعومة (PDF أو صور).' 
      }, { status: 404 });
    }

    // تقليل عدد الملفات المرسلة لـ 5 ملفات فقط لتقليل استهلاك الكوتا (Quota)
    const promptParts: any[] = [];
    const limitedFiles = driveFiles.slice(0, 5); 
    
    for (const file of limitedFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: {
          data: base64Data,
          mimeType: file.mimeType
        }
      });
      promptParts.push({ text: `وثيقة بعنوان: ${file.name}\n` });
    }

    promptParts.push({ 
      text: "بناءً على الشواهد المرفقة، قم بتقييم أداء المعلم نايف أحمد الشهري للأرقام من 1 إلى 11 (الدرجة من 5). أرجع النتيجة بتنسيق JSON حصراً." 
    });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `أنت خبير تربوي سعودي. حلل الوثائق المرفقة لتقييم المعلم.
    المعايير: 1.الواجبات 2.المجتمع 3.أولياء الأمور 4.التنويع 5.النتائج 6.الخطة 7.التقنية 8.البيئة 9.الإدارة 10.التحليل 11.التقويم.
    يجب أن يكون الرد JSON:
    {"suggested_scores": {"1":5, ...}, "justification": "..."}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // استخدام الموديل الأحدث والأكثر توفراً
      contents: { parts: promptParts },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
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

    return NextResponse.json(JSON.parse(response.text || '{}'));

  } catch (error: any) {
    console.error("AI API Error:", error);
    
    // التعامل مع خطأ تجاوز الحد (Quota Exceeded)
    if (error.message?.includes('429') || error.status === 429) {
      return NextResponse.json({ 
        error: 'تم الوصول للحد الأقصى للطلبات المجانية حالياً', 
        details: 'يرجى الانتظار لمدة دقيقة واحدة ثم إعادة المحاولة مرة أخرى.' 
      }, { status: 429 });
    }

    return NextResponse.json({ 
      error: 'فشل عملية التحليل الذكي', 
      details: error.message 
    }, { status: 500 });
  }
}
