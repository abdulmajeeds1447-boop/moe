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

    if (!link) return NextResponse.json({ error: 'رابط المجلد مطلوب.' }, { status: 400 });

    // جلب الملفات
    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ error: 'خطأ في الوصول للمجلد', details: driveError.message }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ أو لا يحتوي على ملفات مدعومة.' }, { status: 404 });
    }

    // تجهيز الملفات
    const promptParts: any[] = [];
    
    for (const file of driveFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: { data: base64Data, mimeType: file.mimeType }
      });
      // نرسل اسم الملف كاملاً (الذي يتضمن اسم المجلد/المعيار) ليساعد الذكاء الاصطناعي
      promptParts.push({ text: `[شاهد: ${file.name}]\n` });
    }

    promptParts.push({ 
      text: "بصفتك الخبير التربوي، قم بتقييم هذا المعلم بناءً على الشواهد أعلاه بصرامة." 
    });

    const genAI = new GoogleGenerativeAI(process.env.API_KEY);
    
    const systemInstruction = `
أنت الخبير التربوي ومدير المدرسة "نايف أحمد الشهري". مهمتك تقييم المعلمين بصرامة وموضوعية بناءً على الأدلة المرفقة فقط.

**أوزان المعايير (هام جداً):**
1. الواجبات الوظيفية (10%)
2. التفاعل مع المجتمع (10%)
3. التواصل مع أولياء الأمور (10%)
4. استراتيجيات التدريس (10%)
5. تحسين النتائج (10%)
6. خطة التعلم (10%)
7. توظيف التقنية (10%)
8. تهيئة البيئة (5%) - وزن منخفض
9. الإدارة الصفية (5%) - وزن منخفض
10. تحليل النتائج (10%)
11. أساليب التقويم (10%)

**منهجية التقييم:**
- الدرجة من 1 إلى 5 لكل معيار.
- لا تمنح 5/5 إلا للتميز الواضح والمثبت.
- الخصم عند عدم وجود شواهد كافية.

المخرجات JSON فقط:
{
  "suggested_scores": { "1": 0, "2": 0, ... "11": 0 },
  "justification": "تبرير مفصل..."
}
    `;

    // ✅ العودة للاسم القياسي الصحيح
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", 
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
        details: 'تم تجاوز الحد. يرجى الانتظار دقيقة.' 
      }, { status: 429 });
    }
    return NextResponse.json({ error: 'فشل التحليل', details: error.message }, { status: 500 });
  }
}
