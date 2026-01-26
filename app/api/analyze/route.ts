import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive'; 
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export const maxDuration = 60; // السماح بمدة معالجة أطول (Vercel Pro)

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف.' }, { status: 500 });
    }

    if (!link) return NextResponse.json({ error: 'رابط المجلد مطلوب.' }, { status: 400 });

    // جلب الملفات
    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ error: 'خطأ في الوصول للمجلد', details: driveError.message }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ من الشواهد المدعومة.' }, { status: 404 });
    }

    // تجهيز الملفات (نأخذ أول 8 لضمان عدم تعليق السيرفر)
    const promptParts: any[] = [];
    const limitedFiles = driveFiles.slice(0, 8);
    
    for (const file of limitedFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: { data: base64Data, mimeType: file.mimeType }
      });
      promptParts.push({ text: `[شاهد: ${file.name}]\n` });
    }

    promptParts.push({ 
      text: "بصفتك المدير الخبير، قيم هذا المعلم بناءً على الشواهد أعلاه بدقة وصرامة." 
    });

    // إعداد النموذج (نستخدم 1.5 Flash لأنه الأسرع والأكثر استقراراً في الباقة المجانية)
    const genAI = new GoogleGenerativeAI(process.env.API_KEY);
    
    const systemInstruction = `
أنت الخبير التربوي ومدير المدرسة "نايف أحمد الشهري". مهمتك تقييم المعلمين بصرامة بناءً على **الأدلة الملموسة فقط**.

**معايير التقييم والأوزان (هام جداً):**
1. الواجبات الوظيفية (10%)
2. التفاعل مع المجتمع (10%)
3. التواصل مع أولياء الأمور (10%)
4. استراتيجيات التدريس (10%)
5. تحسين النتائج (10%)
6. خطة التعلم (10%)
7. توظيف التقنية (10%)
8. تهيئة البيئة (5%) - *وزن منخفض*
9. الإدارة الصفية (5%) - *وزن منخفض*
10. تحليل النتائج (10%)
11. أساليب التقويم (10%)

**قواعد التقييم الصارمة:**
- الدرجة لكل معيار من 1 إلى 5.
- **لا تعطي 5/5 بسهولة:** تمنح فقط إذا كان الشاهد إبداعياً ومكتمل العناصر.
- **خصم الدرجات:** إذا كان الشاهد تقليدياً أو غير واضح، اعطِ 2 أو 3.
- **انعدام الشاهد:** إذا لم تجد ملفاً يدل على المعيار، اعطِ 1 أو 0.

المخرجات المطلوبة JSON فقط:
{
  "suggested_scores": { "1": 4, "2": 3, ... "11": 5 },
  "justification": "نص التبرير..."
}
    `;

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", // ✅ التغيير الجوهري هنا لحل مشكلة التوقف
      systemInstruction: systemInstruction,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            suggested_scores: {
              type: SchemaType.OBJECT,
              properties: {
                "1": { type: SchemaType.NUMBER }, "2": { type: SchemaType.NUMBER }, 
                "3": { type: SchemaType.NUMBER }, "4": { type: SchemaType.NUMBER }, 
                "5": { type: SchemaType.NUMBER }, "6": { type: SchemaType.NUMBER },
                "7": { type: SchemaType.NUMBER }, "8": { type: SchemaType.NUMBER }, 
                "9": { type: SchemaType.NUMBER }, "10": { type: SchemaType.NUMBER }, 
                "11": { type: SchemaType.NUMBER }
              },
              required: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]
            },
            justification: { type: SchemaType.STRING }
          }
        }
      }
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: promptParts }],
    });

    const responseText = result.response.text();
    return NextResponse.json(JSON.parse(responseText));

  } catch (error: any) {
    console.error("AI Error:", error);
    if (error.message?.includes('429') || error.status === 429) {
      return NextResponse.json({ 
        error: 'الموديل مشغول', 
        details: 'يرجى الانتظار دقيقة والمحاولة مرة أخرى (تم تجاوز الحد).' 
      }, { status: 429 });
    }
    return NextResponse.json({ error: 'فشل التحليل', details: error.message }, { status: 500 });
  }
}
