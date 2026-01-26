
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 60; // زيادة وقت التنفيذ لـ 60 ثانية

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
      return NextResponse.json({ error: 'المجلد فارغ من الشواهد المدعومة (PDF/صور).' }, { status: 404 });
    }

    // تقليل عدد الملفات إلى 8 لضمان استقرار الاستجابة وعدم حدوث ضغط على الذاكرة
    const limitedFiles = driveFiles.slice(0, 8);
    const promptParts: any[] = [];
    
    for (const file of limitedFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: { data: base64Data, mimeType: file.mimeType }
      });
      promptParts.push({ text: `وثيقة: ${file.name}\n` });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `
أنت خبير تربوي ومحلل بيانات تعمل لصالح مدير المدرسة "نايف أحمد الشهري". 
مهمتك: تحليل شواهد المعلمين وتقديم تقييم رقمي مئوي دقيق بناءً على المعايير الـ 11.

الأوزان المعتمدة (المجموع 100%):
- المعايير (1، 2، 3، 4، 5، 6، 7، 10، 11): وزن كل معيار منها 10% من الدرجة الإجمالية.
- المعايير (8، 9): وزن كل معيار منها 5% فقط من الدرجة الإجمالية.

امنح درجة من (0 إلى 5) لكل معيار.
يجب أن يكون الرد بصيغة JSON فقط:
{
  "suggested_scores": { "1": 5, "2": 4, ..., "11": 5 },
  "justification": "تحليل تربوي مفصل ومقنع"
}
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

    const text = response.text;
    if (!text) throw new Error('Model returned empty response');
    
    return NextResponse.json(JSON.parse(text));

  } catch (error: any) {
    console.error("Critical AI Error:", error);
    // إرسال كود الحالة الأصلي إذا كان 503 أو 429 ليفهمه نظام المحاولات التلقائية في الواجهة
    const status = (error.message?.includes('503') || error.status === 503) ? 503 : 500;
    return NextResponse.json({ 
      error: 'فشل التحليل الذكي', 
      details: error.message || 'خطأ غير معروف' 
    }, { status });
  }
}
