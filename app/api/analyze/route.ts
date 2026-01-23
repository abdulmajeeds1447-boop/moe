
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { parseFileContent } from '../../../lib/parser';
import { GoogleGenAI, Type } from "@google/genai";

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!link) {
      return NextResponse.json({ error: 'رابط المجلد مطلوب' }, { status: 400 });
    }

    // 1. جلب الملفات من Google Drive
    const driveFiles = await getDriveFiles(link);
    if (driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ أو لا يحتوي على ملفات مدعومة (PDF/Images)' }, { status: 404 });
    }

    // 2. معالجة محتوى الملفات
    const parsedContents = await Promise.all(
      driveFiles.map(file => parseFileContent(file))
    );

    const validContents = parsedContents.filter((c): c is NonNullable<typeof c> => c !== null);

    // 3. تهيئة Gemini AI
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

    // إعداد التعليمات والبيانات للنموذج
    const promptParts: any[] = [
      {
        text: `أنت مساعد لمدير مدرسة. دورك تقييم المعلم بناءً على الشواهد النصية والمرفقة ومقارنتها ببطاقة الأداء الوظيفي المكونة من 11 عنصر:
        1. أداء الواجبات الوظيفية 2. التفاعل مع المجتمع 3. التفاعل مع أولياء الأمور 4. تنويع الاستراتيجيات 5. تحسين النتائج 6. خطة التعلم 7. توظيف التقنية 8. البيئة التعليمية 9. الإدارة الصفية 10. تحليل النتائج 11. أساليب التقويم.
        
        القاعدة: لا تعطِ الدرجة الكاملة (5 من 5) إلا بوجود دليل نصي أو مرئي واضح وصريح في الملفات المرفقة. في حال غياب الدليل، أعطِ درجة تقديرية منخفضة ووضح ذلك في المبررات.
        
        يجب أن تكون المخرجات بتنسيق JSON حصراً يحتوي على الحقول: summary, suggested_scores, recommendations, reasons.`
      }
    ];

    // إضافة المحتوى المستخرج
    validContents.forEach(item => {
      if (item.type === 'text') {
        promptParts.push({ text: `محتوى من ملف (${item.name}):\n${item.content}\n---` });
      } else if (item.type === 'image') {
        promptParts.push({
          inlineData: {
            data: item.content,
            mimeType: item.mimeType
          }
        });
      }
    });

    // 4. طلب التحليل من Gemini 3 Flash
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: promptParts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            suggested_scores: {
              type: Type.OBJECT,
              properties: {
                "1": { type: Type.NUMBER }, "2": { type: Type.NUMBER }, "3": { type: Type.NUMBER },
                "4": { type: Type.NUMBER }, "5": { type: Type.NUMBER }, "6": { type: Type.NUMBER },
                "7": { type: Type.NUMBER }, "8": { type: Type.NUMBER }, "9": { type: Type.NUMBER },
                "10": { type: Type.NUMBER }, "11": { type: Type.NUMBER }
              }
            },
            recommendations: { type: Type.STRING },
            reasons: { type: Type.STRING }
          },
          required: ['summary', 'suggested_scores', 'recommendations', 'reasons']
        }
      }
    });

    return NextResponse.json(JSON.parse(response.text || '{}'));

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء معالجة الملفات أو تحليلها', details: error.message }, { status: 500 });
  }
}
