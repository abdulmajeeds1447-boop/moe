
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    // 1. التحقق من مفاتيح البيئة
    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف في إعدادات السيرفر.' }, { status: 500 });
    }

    if (!link) return NextResponse.json({ error: 'رابط المجلد مطلوب' }, { status: 400 });

    // 2. جلب الملفات من قوقل درايف
    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      console.error("Drive Error:", driveError);
      return NextResponse.json({ 
        error: 'خطأ في الوصول للمجلد', 
        details: driveError.message || 'تأكد من إعدادات المشاركة (أي شخص لديه الرابط).' 
      }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ 
        error: 'المجلد فارغ أو لا يحتوي على ملفات مدعومة (PDF أو صور). تأكد من رفع الشواهد.' 
      }, { status: 404 });
    }

    // 3. تجهيز الأجزاء (Parts) لإرسالها للذكاء الاصطناعي
    // نرسل أول 10 ملفات فقط لضمان عدم تجاوز حدود الذاكرة أو التوكنز
    const promptParts: any[] = [];
    
    for (const file of driveFiles.slice(0, 10)) {
      // تحويل Uint8Array إلى Base64
      const base64Data = Buffer.from(file.buffer).toString('base64');
      
      promptParts.push({
        inlineData: {
          data: base64Data,
          mimeType: file.mimeType
        }
      });
      
      // إضافة اسم الملف كمرجع نصي
      promptParts.push({ text: `اسم الملف المرفق: ${file.name}\n` });
    }

    promptParts.push({ 
      text: "بناءً على الشواهد والوثائق المرفقة أعلاه (سواء كانت شهادات حضور، خطط دروس، أو سجلات)، قم بإجراء التقييم التربوي المطلوب للمعلم نايف أحمد الشهري بناءً على المعايير الـ 11 المذكورة في تعليمات النظام." 
    });

    // 4. استدعاء Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `
أنت خبير تربوي سعودي تعمل مساعداً لمدير مدرسة. مهمتك هي تحليل الوثائق المرفقة (PDF وصور) وتقييم أداء المعلم بناءً على معايير وزارة التعليم.
يجب عليك النظر في الشهادات والوثائق والبحث عن الأدلة لكل معيار من المعايير الـ 11 التالية:
1. أداء الواجبات الوظيفية 2. التفاعل مع المجتمع 3. التفاعل مع أولياء الأمور 4. التنويع في التدريس 5. تحسين نتائج الطلاب 6. إعداد خطة التعلم 7. توظيف التقنية 8. تهيئة البيئة التعليمية 9. الإدارة الصفية 10. تحليل النتائج 11. تنوع أساليب التقويم.

قم بتقدير درجة من 1 إلى 5 لكل معيار. إذا كانت الوثائق لا تغطي معياراً معيناً، ضع درجة تقديرية منخفضة أو متوسطة مع التوضيح.

يجب أن تكون النتيجة JSON حصراً:
{
  "suggested_scores": { "1": 5, "2": 4, "3": 5, "4": 4, "5": 5, "6": 4, "7": 5, "8": 5, "9": 4, "10": 5, "11": 4 },
  "justification": "شرح مختصر ومبني على الوثائق التي رأيتها..."
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp', // استخدام موديل فلاش لسرعة الاستجابة ودعم الملفات
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

    const resultText = response.text;
    if (!resultText) throw new Error("لم يرجع الذكاء الاصطناعي أي نتيجة.");

    return NextResponse.json(JSON.parse(resultText));

  } catch (error: any) {
    console.error("Analysis API Critical Error:", error);
    return NextResponse.json({ 
      error: 'فشل عملية التحليل الذكي', 
      details: error.message || 'خطأ غير معروف' 
    }, { status: 500 });
  }
}
