
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف.' }, { status: 500 });
    }

    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ error: 'خطأ في الوصول للمجلد', details: driveError.message }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ من الشواهد.' }, { status: 404 });
    }

    const promptParts: any[] = [];
    const limitedFiles = driveFiles.slice(0, 10); // زيادة العدد لـ 10 شواهد لتحليل أعمق
    
    for (const file of limitedFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: { data: base64Data, mimeType: file.mimeType }
      });
      promptParts.push({ text: `وثيقة شاهد: ${file.name}\n` });
    }

    promptParts.push({ 
      text: "قم بإجراء التحليل التربوي الصارم الآن بناءً على الشواهد المرفقة والتعليمات المحددة لك." 
    });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // التعليمات التربوية الصارمة بناءً على طلب المستخدم
    const systemInstruction = `
أنت مساعد تقني وخبير تربوي تعمل مع مدير المدرسة "نايف أحمد الشهري". مهمتك هي تحليل الأدلة والملفات المقدمة من المعلمين لتقييم أدائهم الوظيفي بناءً على معايير وزارة التعليم السعودية بدقة وموضوعية.

عند تحليل الملفات، يجب عليك التحقق من وجود أدلة تثبت تحقق المهام الفرعية التالية لكل معيار من المعايير الـ 11:

1. أداء الواجبات الوظيفية: التقيد بالدوام، تأدية الحصص، الإشراف، المناوبة، وحصص الانتظار.
2. التفاعل مع المجتمع: مجتمعات التعلم المهنية، تبادل الزيارات، الدروس التطبيقية، بحث الدرس، والدورات.
3. التفاعل مع أولياء الأمور: التواصل الفعال (عبر الموجه الطلابي)، تزويدهم بالمستويات، الخطة الأسبوعية، والجمعية العمومية.
4. التنويع في استراتيجيات التدريس: استراتيجيات متنوعة تناسب المستويات، ومراعاة الفروق الفردية.
5. تحسين نتائج المتعلمين: معالجة الفاقد التعليمي، خطط علاجية للضعاف، خطط إثرائية، وتكريم المتميزين.
6. إعداد وتنفيذ خطة التعلم: توثيق توزيع المنهج وإعداد الدروس والواجبات.
7. توظيف تقنيات ووسائل التعلم: دمج التقنية والتنويع في الوسائل التعليمية.
8. تهيئة البيئة التعليمية: مراعاة حاجات الطلاب، التهيئة النفسية، التحفيز المادي والمعنوي.
9. الإدارة الصفية: ضبط سلوك الطلاب، شد الانتباه، ومتابعة الحضور والغياب.
10. تحليل نتائج المتعلمين: تحليل نتائج الاختبارات (فترية/نهائية)، وتصنيف الطلاب (قوة/ضعف).
11. تنوع أساليب التقويم: اختبارات ورقية/إلكترونية، مشاريع طلابية، مهام أدائية، وملفات إنجاز.

قواعد التقييم الصارمة:
- المعلم الذي لم يدرج أي شاهد لأحد المعايير، يجب وضع الدرجة (0 أو 1) لهذا المعيار حصراً.
- خفض الدرجة في حال قلة عدد الشواهد أو عدم وضوحها.
- لا تضع درجة 5 (كاملة) إلا إذا كان الشاهد استثنائياً وشاملاً لكافة المهام الفرعية للمعيار.

يجب أن يكون الرد JSON حصراً:
{
  "suggested_scores": { "1": number, "2": number, ..., "11": number },
  "justification": "تحليل تربوي دقيق للأدلة المرفوعة مع ذكر النقاط التي أدت لخفض الدرجة إن وجدت"
}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite-latest',
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
    return NextResponse.json({ error: 'فشل التحليل الذكي', details: error.message }, { status: 500 });
  }
}
