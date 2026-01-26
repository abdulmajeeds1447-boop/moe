import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف.' }, { status: 500 });
    }

    if (!link) {
      return NextResponse.json({ error: 'رابط المجلد مطلوب.' }, { status: 400 });
    }

    // 1. جلب الملفات
    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ error: 'خطأ في الوصول للمجلد', details: driveError.message }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ من الشواهد المدعومة (PDF/صور).' }, { status: 404 });
    }

    // 2. تجهيز الشواهد (نأخذ أول 10 لضمان السرعة)
    const promptParts: any[] = [];
    const limitedFiles = driveFiles.slice(0, 10);
    
    for (const file of limitedFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: { data: base64Data, mimeType: file.mimeType }
      });
      promptParts.push({ text: `وثيقة شاهد: ${file.name}\n` });
    }

    promptParts.push({ 
      text: "بناءً على الشواهد المرفوعة، قم بإجراء تقييم تربوي دقيق للمعلم وفق المعايير والأوزان المحددة." 
    });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // 3. التعليمات الصارمة (تم التعديل ليتوافق مع نظام الدرجات المباشر)
    const systemInstruction = `
أنت خبير تربوي ومقيم معتمد. مهمتك تقييم أداء المعلم بناءً على الشواهد المرفقة بدقة وموضوعية.

المعايير والأوزان (الدرجة العظمى):
1. أداء الواجبات الوظيفية (10)
2. التفاعل مع المجتمع (10)
3. التفاعل مع أولياء الأمور (10)
4. التنويع في استراتيجيات التدريس (10)
5. تحسين نتائج المتعلمين (10)
6. إعداد وتنفيذ خطة التعلم (10)
7. توظيف تقنيات ووسائل التعلم (10)
8. تهيئة البيئة التعليمية (5)
9. الإدارة الصفية (5)
10. تحليل نتائج المتعلمين (10)
11. تنوع أساليب التقويم (10)

القواعد الصارمة جداً:
- قيّم الدرجة مباشرة من أصل الوزن الكلي (مثلاً 9 من 10، أو 4 من 5).
- المعيارين 8 و 9 حدهما الأقصى 5 درجات. البقية 10.
- إذا لم تجد شاهداً للمعيار، ضع الدرجة 0.
- كن دقيقاً: الشواهد العامة لا تأخذ الدرجة الكاملة.

الرد JSON حصراً:
{
  "suggested_scores": { "1": 9, "2": 10, "3": 0, "8": 4, "9": 5 ... },
  "justification": "رأيك التربوي المختصر والدقيق..."
}
    `;

    // 4. استدعاء الموديل (تم استخدام الاسم الصحيح والمستقر)
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash', // ✅ هذا هو الاسم الصحيح والسريع. gemini-3 غير موجود حالياً ويسبب تعطل النظام.
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

    // استخراج النص وتصحيح طريقة الوصول إليه في المكتبة الجديدة
    const responseText = response.text(); 
    return NextResponse.json(JSON.parse(responseText));

  } catch (error: any) {
    console.error("Critical AI Error:", error);
    
    if (error.status === 429) {
      return NextResponse.json({ 
        error: 'تم تجاوز الحد المسموح للطلبات المجانية', 
        details: 'يرجى المحاولة بعد دقيقة واحدة.' 
      }, { status: 429 });
    }

    return NextResponse.json({ 
      error: 'فشل التحليل الذكي', 
      details: error.message || 'تأكد من إعدادات API Key'
    }, { status: 500 });
  }
}
