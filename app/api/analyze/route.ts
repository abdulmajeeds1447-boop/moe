
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

    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ error: 'خطأ في الوصول للمجلد', details: driveError.message }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ من الشواهد المدعومة (PDF/صور).' }, { status: 404 });
    }

    // نأخذ أول 10 شواهد لضمان جودة التحليل وعدم تجاوز حدود الذاكرة
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
      text: "بناءً على الشواهد المرفوعة، قم بإجراء تقييم تربوي صارم ( للمعلم صاحب الملف) وفق المعايير الـ 11 المحددة." 
    });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // التعليمات التربوية الصارمة بناءً على طلب المدير نايف الشهري
// التعليمات التربوية الصارمة والمحدثة (نظام الدرجات المباشر)
    const systemInstruction = `
أنت مساعد تقني وخبير تربوي تعمل مع مدير المدرسة "نايف أحمد الشهري". مهمتك هي تحليل الأدلة والملفات المقدمة من المعلمين لتقييم أدائهم الوظيفي بناءً على معايير وزارة التعليم السعودية بدقة وموضوعية.

المعايير والأوزان (الدرجة العظمى لكل معيار):
1. أداء الواجبات الوظيفية (الحد الأقصى: 10 درجات)
2. التفاعل مع المجتمع (الحد الأقصى: 10 درجات)
3. التفاعل مع أولياء الأمور (الحد الأقصى: 10 درجات)
4. التنويع في استراتيجيات التدريس (الحد الأقصى: 10 درجات)
5. تحسين نتائج المتعلمين (الحد الأقصى: 10 درجات)
6. إعداد وتنفيذ خطة التعلم (الحد الأقصى: 10 درجات)
7. توظيف تقنيات ووسائل التعلم (الحد الأقصى: 10 درجات)
8. تهيئة البيئة التعليمية (الحد الأقصى: 5 درجات فقط)
9. الإدارة الصفية (الحد الأقصى: 5 درجات فقط)
10. تحليل نتائج المتعلمين (الحد الأقصى: 10 درجات)
11. تنوع أساليب التقويم (الحد الأقصى: 10 درجات)

القواعد الصارمة جداً للتقييم:
1. **التقدير المباشر:** لا تستخدم مقياس (0-5) للمعايير الكبيرة. إذا كان المعيار وزنه 10، قيم المعلم مباشرة من 10 (مثلاً: امنحه 9 من 10 إذا كان ممتازاً، أو 7 من 10 إذا كان جيداً).
2. **استثناء:** المعيارين رقم (8) و (9) فقط حدهما الأقصى 5 درجات.
3. **الدقة في الشواهد:**
   - إذا لم تجد أي شاهد للمعيار، ضع الدرجة 0.
   - إذا وجدت شواهد ضعيفة أو غير مكتملة، ضع درجة منخفضة (مثلاً 3 من 10).
   - لا تمنح الدرجة الكاملة (10/10 أو 5/5) إلا إذا كانت الشواهد إبداعية ومكتملة تماماً.

شكل الرد المطلوب (JSON فقط):
{
  "suggested_scores": { 
    "1": 9, 
    "2": 10, 
    "3": 0, 
    "8": 4, 
    "9": 5 
    ... وبقية المعايير 
  },
  "justification": "تحليل مفصل وواقعي يذكر نقاط القوة والضعف بناءً على الشواهد الموجودة فقط."
}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // تغيير الموديل للاسم الصحيح والمستقر
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
    console.error("Critical AI Error:", error);
    
    // التعامل مع خطأ الكوتا (Quota)
    if (error.status === 429) {
      return NextResponse.json({ 
        error: 'تم تجاوز الحد المسموح للطلبات المجانية', 
        details: 'يرجى المحاولة بعد دقيقة واحدة.' 
      }, { status: 429 });
    }

    return NextResponse.json({ 
      error: 'فشل التحليل الذكي', 
      details: error.message 
    }, { status: 500 });
  }
}
