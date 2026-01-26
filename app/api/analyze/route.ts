
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

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

    const promptParts: any[] = [];
    const limitedFiles = driveFiles.slice(0, 15);
    
    for (const file of limitedFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: { data: base64Data, mimeType: file.mimeType }
      });
      promptParts.push({ text: `وثيقة شاهد: ${file.name}\n` });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `
أنت خبير تربوي ومحلل بيانات تعمل لصالح مدير المدرسة "نايف أحمد الشهري". 
مهمتك: تحليل شواهد المعلمين وتقديم تقييم رقمي مئوي دقيق بناءً على المعايير الـ 11.

الأوزان المعتمدة (يجب أن يكون المجموع الكلي 100%):
- المعايير (1، 2، 3، 4، 5، 6، 7، 10، 11): وزن كل معيار 10% من الدرجة النهائية.
- المعايير (8، 9): وزن كل معيار 5% فقط من الدرجة النهائية.

المطلوب منك:
1. تقييم كل معيار من (0 إلى 5) نقاط، حيث:
   - 5 نقاط تعني تحقيق النسبة كاملة (10% أو 5% حسب المعيار).
   - 0 نقاط تعني عدم وجود شاهد إطلاقاً.
2. كن دقيقاً جداً وصارماً في منح الدرجات؛ فالمعلم المتميز هو من تكتمل شواهده فعلياً.
3. قدم تبريراً تربوياً (justification) لكل درجة منحتها بناءً على ما رأيته في الملفات.

يجب أن يكون الرد بصيغة JSON فقط:
{
  "suggested_scores": { "1": 5, "2": 3, ..., "11": 5 },
  "justification": "تحليل تربوي مفصل يوضح نقاط القوة والضعف"
}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
    console.error("AI Error:", error);
    return NextResponse.json({ error: 'فشل التحليل الذكي' }, { status: 500 });
  }
}
