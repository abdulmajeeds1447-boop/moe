
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
    // تقليل عدد الملفات لضمان عدم تجاوز حدود الذاكرة أو التوقيت
    const limitedFiles = driveFiles.slice(0, 10);
    
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
مهمتك: تحليل شواهد المعلمين وتقديم تقييم رقمي مئوي دقيق بناءً على المعايير الـ 11 المحددة.

الأوزان المعتمدة للدرجة النهائية (المجموع 100%):
- المعايير (1، 2، 3، 4، 5، 6، 7، 10، 11): وزن كل معيار منها 10% من الدرجة الإجمالية.
- المعايير (8، 9): وزن كل معيار منها 5% فقط من الدرجة الإجمالية.

طريقة التقييم المطلوبة:
1. امنح درجة من (0 إلى 5) لكل معيار بناءً على قوة الشواهد المرفقة.
2. الدرجة 5 تعني أن المعلم استحق كامل النسبة (سواء 10% أو 5% حسب المعيار).
3. كن موضوعياً وصارماً في التحليل؛ إذا غاب الشاهد عن المعيار امنحه 0 أو 1.
4. التبرير (justification) يجب أن يكون تربوياً ومركزاً على ما تم العثور عليه فعلياً في الملفات.

يجب أن تكون الاستجابة بصيغة JSON حصراً بهذا الهيكل:
{
  "suggested_scores": { "1": 5, "2": 4, "3": 5, "4": 3, "5": 5, "6": 4, "7": 5, "8": 4, "9": 3, "10": 5, "11": 4 },
  "justification": "اكتب هنا التقرير التحليلي المفصل"
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
    return NextResponse.json({ 
      error: 'فشل التحليل الذكي', 
      details: error.message || 'خطأ غير معروف في معالجة البيانات' 
    }, { status: 500 });
  }
}
