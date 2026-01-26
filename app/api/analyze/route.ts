
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
      return NextResponse.json({ error: 'المجلد فارغ تماماً من الشواهد المدعومة.' }, { status: 404 });
    }

    // تقليل عدد الملفات لـ 6 لضمان استقرار الحصة المجانية وسرعة الرد
    const limitedFiles = driveFiles.slice(0, 6);
    const promptParts: any[] = [];
    
    for (const file of limitedFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: { data: base64Data, mimeType: file.mimeType }
      });
      promptParts.push({ text: `[محتوى ملف: ${file.name}]\n` });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `
أنت مدقق تربوي صارم لصالح مدير المدرسة "نايف أحمد الشهري".
مهمتك: فحص الملفات المرفقة وتحديد الدرجة (من 0 إلى 5) لـ 11 معياراً.

القاعدة الذهبية:
- إذا لم تجد شاهداً نصياً أو صورياً صريحاً للمعيار داخل الملفات، فالدرجة هي 0.
- لا تمنح درجات بناءً على التخمين.
- الدرجة 5 تعني وجود شاهد قوي ومكتمل.

المعايير (الأوزان):
- (1-7 و 10-11): وزن 10% لكل منها.
- (8-9): وزن 5% لكل منها.

يجب أن يكون الرد JSON فقط:
{
  "suggested_scores": { "1": 0, "2": 0, ..., "11": 0 },
  "justification": "اذكر هنا أسماء الملفات التي استندت إليها والدرجات الممنوحة بصدق."
}
    `;

    // التحويل لموديل Flash المتاح والمستقر
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: promptParts }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0, // منع العشوائية تماماً
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
    if (!text) throw new Error('Empty response from AI');
    
    return NextResponse.json(JSON.parse(text));

  } catch (error: any) {
    console.error("Analysis Error:", error);
    // معالجة خطأ الحصة لإظهاره بشكل مفهوم للمستخدم
    if (error.message?.includes('429')) {
      return NextResponse.json({ error: 'نفدت حصة الاستخدام المجانية مؤقتاً. يرجى الانتظار دقيقة ثم المحاولة.' }, { status: 429 });
    }
    return NextResponse.json({ error: 'فشل التدقيق', details: error.message }, { status: 500 });
  }
}
