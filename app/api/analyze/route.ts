
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
      return NextResponse.json({ error: 'المجلد فارغ من الشواهد المدعومة (PDF/صور).' }, { status: 404 });
    }

    // نأخذ أول 10 شواهد لضمان جودة التحليل وعدم تجاوز حدود الذاكرة
    const promptParts: any[] = [];
    const limitedFiles = driveFiles.slice(0, 5);
    
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
    const systemInstruction = `
أنت مساعد تقني وخبير تربوي تعمل مع مدير المدرسة "نايف أحمد الشهري". مهمتك هي تحليل الأدلة والملفات المقدمة من المعلمين لتقييم أدائهم الوظيفي بناءً على معايير وزارة التعليم السعودية بدقة وموضوعية.

المعايير الـ 11 المطلوب تقييمها:
1. أداء الواجبات الوظيفية: التقيد بالدوام، تأدية الحصص، الإشراف، المناوبة، وحصص الانتظار.
2. التفاعل مع المجتمع: مجتمعات التعلم المهنية، تبادل الزيارات، الدروس التطبيقية، بحث الدرس.
3. التفاعل مع أولياء الأمور: التواصل الفعال (الموجه الطلابي)، تزويدهم بالمستويات، الخطة الأسبوعية.
4. التنويع في استراتيجيات التدريس: استراتيجيات متنوعة تناسب المستويات، ومراعاة الفروق الفردية.
5. تحسين نتائج المتعلمين: معالجة الفاقد التعليمي، خطط علاجية، خطط إثرائية.
6. إعداد وتنفيذ خطة التعلم: توثيق توزيع المنهج وإعداد الدروس والواجبات.
7. توظيف تقنيات ووسائل التعلم: دمج التقنية والتنويع في الوسائل التعليمية.
8. تهيئة البيئة التعليمية: مراعاة حاجات الطلاب، التهيئة النفسية، التحفيز.
9. الإدارة الصفية: ضبط سلوك الطلاب، شد الانتباه، ومتابعة الحضور والغياب.
10. تحليل نتائج المتعلمين: تحليل نتائج الاختبارات، وتصنيف الطلاب.
11. تنوع أساليب التقويم: اختبارات ورقية وإلكترونية، مشاريع، مهام أدائية، ملفات إنجاز.

القواعد الصارمة:
- الدرجة من 0 إلى 5 لكل معيار.
- خفض الدرجة لـ (0 أو 1) إذا لم تجد شاهداً صريحاً للمعيار.
- كن دقيقاً جداً ولا تمنح درجة 5 إلا بوجود أدلة كافية وشاملة.

الرد يجب أن يكون JSON فقط:
{
  "suggested_scores": { "1": 5, "2": 3, "11": 4 },
  "justification": "تحليل مفصل بناءً على ما وجد في الشواهد"
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

    return NextResponse.json(JSON.parse(response.text || '{}'));

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
      details: error.message 
    }, { status: 500 });
  }
}
