import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive'; // تأكد من صحة المسار لديك
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export const maxDuration = 60; // تمديد وقت المعالجة لأن النموذج الخبير يحتاج وقتاً للتفكير

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف.' }, { status: 500 });
    }

    if (!link) return NextResponse.json({ error: 'رابط المجلد مطلوب.' }, { status: 400 });

    // 1. جلب الملفات من جوجل درايف
    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ error: 'خطأ في الوصول للمجلد', details: driveError.message }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ أو لا يحتوي على ملفات مدعومة.' }, { status: 404 });
    }

    // 2. تجهيز الشواهد للنموذج
    // نستخدم gemini-1.5-pro، وهو يتحمل سياقاً كبيراً، لكن نحدد العدد لضمان السرعة المعقولة
    const limitedFiles = driveFiles.slice(0, 10); 
    const promptParts: any[] = [];

    for (const file of limitedFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: { data: base64Data, mimeType: file.mimeType }
      });
      promptParts.push({ text: `[اسم الملف: ${file.name}]\n` });
    }

    promptParts.push({ 
      text: "بصفتك الخبير التربوي للمدرسة، قم بمراجعة هذه الشواهد وإصدار حكمك النهائي الصارم." 
    });

    // 3. إعداد النموذج الخبير (Gemini 1.5 Pro)
    const genAI = new GoogleGenerativeAI(process.env.API_KEY);
    
    // التعليمات الصارمة جداً (Persona: مدير مدرسة خبير ومدقق)
    const systemInstruction = `
أنت "المساعد التربوي الخبير" لمدير المدرسة "نايف أحمد الشهري". دورك هو تقييم أداء المعلمين بصرامة وموضوعية تامة بناءً على الأدلة المرفقة فقط.

**المبدأ الأساسي:** "ما لا يوجد له دليل ملموس، لا يستحق الدرجة الكاملة."

عليك تحليل الملفات المرفقة وتقييم المعلم وفق عناصر تقييم الأداء الوظيفي (الوزن 100%):

1. **الواجبات الوظيفية:** (حصص الانتظار، الإشراف، التحضير). ابحث عن جداول أو خطابات تكليف.
2. **التفاعل مع المجتمع المهني:** (دورات، ورش عمل، بحث درس).
3. **التواصل مع أولياء الأمور:** (رسائل، اجتماعات، تقارير).
4. **استراتيجيات التدريس:** (تنوع الطرق، مراعاة الفروق الفردية).
5. **تحسين النتائج:** (خطط علاجية للضعاف، وإثرائية للموهوبين).
6. **إعداد خطة التعلم:** (توزيع المنهج، جودة التحضير).
7. **توظيف التقنية:** (استخدام السبورة الذكية، منصات تعليمية).
8. **تهيئة البيئة:** (التعزيز، الجو النفسي للفصل).
9. **الإدارة الصفية:** (ضبط الطلاب، رصد الغياب).
10. **تحليل النتائج:** (رسوم بيانية للدرجات، تشخيص مستوى الطلاب).
11. **أساليب التقويم:** (اختبارات متنوعة، ملفات إنجاز).

**نظام الدرجات الصارم (من 1 إلى 5):**
- **5 (متميز):** الشاهد موجود، حديث، مبتكر، ومكتمل العناصر.
- **4 (جيد جداً):** الشاهد موجود ولكنه تقليدي.
- **3 (جيد):** الشاهد موجود ولكنه ناقص أو غير واضح.
- **2 (مقبول):** الشاهد ضعيف جداً.
- **1 (ضعيف):** لا يوجد أي شاهد لهذا المعيار في الملفات المرفقة (كن حازماً هنا).

**المطلوب منك:**
إخراج تقرير JSON دقيق يحتوي على الدرجات المقترحة وتبرير مهني مفصل يوضح لماذا استحق هذه الدرجة، مع ذكر اسم الملف الذي استندت إليه في حكمك إن وجد.
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro", // النموذج الأقوى والأذكى
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

    // 4. تنفيذ التحليل
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: promptParts }],
    });

    const responseText = result.response.text();
    return NextResponse.json(JSON.parse(responseText));

  } catch (error: any) {
    console.error("AI Error:", error);
    
    // التعامل مع الأخطاء الشائعة
    if (error.message?.includes('429') || error.status === 429) {
       return NextResponse.json({ 
        error: 'الموديل مشغول حالياً (Overloaded)', 
        details: 'نستخدم أقوى نموذج للتحليل (Pro). يرجى الانتظار دقيقة والمحاولة، أو ترقية الخطة لسرعة قصوى.' 
      }, { status: 429 });
    }

    return NextResponse.json({ error: 'فشل التحليل', details: error.message }, { status: 500 });
  }
}
