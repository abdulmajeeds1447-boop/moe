
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 60; // رفع مدة التنفيذ لـ 60 ثانية (مسموح في Vercel Pro/Hobby)

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف في إعدادات السيرفر.' }, { status: 500 });
    }

    if (!link) {
      return NextResponse.json({ error: 'رابط المجلد مطلوب.' }, { status: 400 });
    }

    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      console.error("Drive Access Error:", driveError);
      return NextResponse.json({ error: 'خطأ في الوصول للمجلد', details: driveError.message }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ أو لا يحتوي على ملفات مدعومة (صور/PDF).' }, { status: 404 });
    }

    // إعداد أجزاء الطلب (Multimodal Prompt)
    const promptParts: any[] = [];
    const limitedFiles = driveFiles.slice(0, 10);
    
    for (const file of limitedFiles) {
      if (file.buffer) {
        const base64Data = Buffer.from(file.buffer).toString('base64');
        promptParts.push({
          inlineData: { data: base64Data, mimeType: file.mimeType }
        });
        promptParts.push({ text: `وثيقة من ملف المعلم: ${file.name}\n` });
      }
    }

    promptParts.push({ 
      text: "بناءً على المستندات والصور المرفقة، قم بتحليل أداء المعلم بدقة تربوية وفق المعايير الـ 11. ركز على الأدلة الملموسة (تقارير، صور حصص، كشوفات) واخصم درجات في حال غياب الدليل الواضح." 
    });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `
أنت خبير تدقيق تربوي تعمل كمساعد لمدير المدرسة "نايف أحمد الشهري".
مهمتك: تقييم المعلم من 0 إلى 5 في 11 معياراً فنياً.
يجب أن يكون الرد بصيغة JSON حصراً وتحتوي على suggested_scores و justification.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [{ parts: promptParts }],
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

    const resultText = response.text;
    if (!resultText) throw new Error("لم يتم استلام محتوى نصي من الذكاء الاصطناعي");

    return NextResponse.json(JSON.parse(resultText));

  } catch (error: any) {
    console.error("Critical Analysis Error:", error);
    
    if (error.status === 429 || error.message?.includes('429')) {
      return NextResponse.json({ 
        error: 'تم تجاوز حد الطلبات', 
        details: 'الخطة المجانية مشغولة حالياً، يرجى المحاولة بعد قليل.' 
      }, { status: 429 });
    }

    return NextResponse.json({ 
      error: 'فشل التحليل الذكي', 
      details: error.message 
    }, { status: 500 });
  }
}
