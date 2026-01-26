
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { parseFileContent } from '../../../lib/parser';
import { GoogleGenAI, Type } from "@google/genai";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح API غير متوفر' }, { status: 500 });
    }

    const driveFiles = await getDriveFiles(link);
    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ أو لا يمكن الوصول إليه' }, { status: 404 });
    }

    // تحليل أول 7 ملفات (لتحقيق توازن بين الدقة واستهلاك التوكنز في برو)
    const limitedFiles = driveFiles.slice(0, 7);
    const promptParts: any[] = [];
    
    for (const file of limitedFiles) {
      const processed = await parseFileContent(file);
      if (processed) {
        if (processed.type === 'text') {
          promptParts.push({ text: `--- ملف مستند (${processed.name}) ---\n${processed.content}\n` });
        } else if (processed.type === 'image') {
          promptParts.push({
            inlineData: { data: processed.content, mimeType: processed.mimeType }
          });
          promptParts.push({ text: `[صورة شاهد: ${processed.name}]\n` });
        }
      }
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // استخدام الموديل الأقوى للتحليل الاحترافي
    const modelName = 'gemini-3-pro-preview';
    
    const systemInstruction = `
أنت الآن "خبير تدقيق جودة الأداء التعليمي" بوزارة التعليم. مهمتك فحص ملفات المعلم بصرامة متناهية.

قواعد التدقيق الاحترافي:
1. أي ملف يحتوي فقط على "جدول المعايير" أو "توصيف العناصر" هو (مرجع) وليس (شاهد). امنح درجة 0 فوراً للمعيار الذي لا يوجد له إلا توصيفه.
2. الشاهد المقبول هو: (خطة درس منفذة، صورة فوتوغرافية لحدث صفّي، لقطة شاشة لرسائل مع أولياء الأمور، كشف درجات، تقرير نشاط موقع ومختوم).
3. كن صريحاً ومهنياً: إذا كان المجلد يحتوي على أوراق فارغة أو مكررة، اذكر ذلك في التبرير.
4. التبرير يجب أن يكون تقريراً رسمياً يذكر أسماء الملفات التي أثبتت كل معيار.

المعايير الـ 11:
(1: الواجبات، 2: المجتمع المهني، 3: أولياء الأمور، 4: استراتيجيات، 5: نتائج الطلاب، 6: خطة التعلم، 7: التقنية، 8: البيئة، 9: الإدارة الصفية، 10: تحليل النتائج، 11: التقويم).

يجب أن يكون الرد JSON فقط بهذا الهيكل:
{
  "suggested_scores": {"1": 0, "2": 0, ... "11": 0},
  "justification": "تقرير التدقيق: \n- الملفات المكتشفة: [قائمة الأسماء]\n- الأدلة المثبتة: [اذكر ماذا وجدت ولمن]\n- النواقص: [ما الذي يفتقده المعلم لرفع درجته]\n- النتيجة النهائية: [تحليل احترافي قصير]"
}
    `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: promptParts }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.2, // منخفض لضمان الدقة والاتساق
        thinkingConfig: { thinkingBudget: 4000 }, // تفعيل التفكير لتحليل الروابط المعقدة
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
          }
        }
      }
    });

    return NextResponse.json(JSON.parse(response.text || '{}'));

  } catch (error: any) {
    console.error("Pro Analysis Error:", error);
    return NextResponse.json({ 
      error: 'فشل التدقيق الاحترافي', 
      details: error.message 
    }, { status: 500 });
  }
}
