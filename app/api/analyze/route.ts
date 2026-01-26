import { NextResponse } from 'next/server';
import { downloadDriveFile } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 45; // زيادة وقت المعالجة للتقييم العميق

export async function POST(req: Request) {
  try {
    const { fileId, mimeType, fileName, mode, previousFindings } = await req.json();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // المرحلة 1: استخراج الشواهد الخام
    if (mode === 'partial') {
      const buffer = await downloadDriveFile(fileId);
      const base64Data = Buffer.from(buffer).toString('base64');

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: `أنت مساعد مدقق تربوي. مهمتك هي استخراج "نصوص الشواهد" فقط من هذا المستند (${fileName}). 
            ابحث عن أدلة تتعلق بـ: تحضير الدروس، استراتيجيات التدريس، استخدام التقنية، التفاعل مع أولياء الأمور، نتائج الطلاب، البيئة الصفية.
            اكتب الشواهد المكتشفة بشكل نقاط واضحة ومباشرة.` }
          ]
        }],
        config: { temperature: 0.1 }
      });
      return NextResponse.json({ findings: response.text || "" });
    }

    // المرحلة 2: التقييم التربوي الصارم (القرار النهائي)
    if (mode === 'final') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{
          parts: [{ text: `أنت الآن "رئيس لجنة تدقيق الأداء الوظيفي بوزارة التعليم". أمامك كافة الشواهد المجمعة من ملفات المعلم:\n${previousFindings}\n
          المطلوب منك إجراء تقييم تربوي صارم وعادل وفق التعليمات التالية:
          1. تقييم كل معيار من المعايير الـ 11 من (0 إلى 5).
          2. كن صارماً جداً: إذا كان الشاهد ضعيفاً أو غير موجود، امنح درجة (0) أو (1). لا تمنح (5) إلا إذا وجدت دليلاً على الابتكار والتميز الاستثنائي.
          3. مبرر الدرجة: يجب أن يكون مهنياً (مثال: "منحت الدرجة 3 نظراً لوجود خطة علاجية ولكن تفتقر لتحليل النتائج البعدي").
          4. نقاط القوة: استخرج 3 نقاط تميز حقيقية.
          5. نقاط التطوير: حدد فجوات الأداء بدقة.
          6. التوصية: وجه رسالة مهنية للمعلم لتطوير أدائه العام.
          
          المعايير بالترتيب: 1-الواجبات، 2-المجتمع، 3-أولياء الأمور، 4-الاستراتيجيات، 5-تحسين النتائج، 6-التخطيط، 7-التقنية، 8-البيئة، 9-الإدارة، 10-التحليل، 11-التقويم.` }]
        }],
        config: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scores: {
                type: Type.OBJECT,
                properties: {
                  "1": { type: Type.NUMBER }, "2": { type: Type.NUMBER }, "3": { type: Type.NUMBER },
                  "4": { type: Type.NUMBER }, "5": { type: Type.NUMBER }, "6": { type: Type.NUMBER },
                  "7": { type: Type.NUMBER }, "8": { type: Type.NUMBER }, "9": { type: Type.NUMBER },
                  "10": { type: Type.NUMBER }, "11": { type: Type.NUMBER }
                }
              },
              justifications: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "يجب أن يحتوي على 11 نصاً تحليلياً دقيقاً لكل معيار بالترتيب"
              },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendation: { type: Type.STRING }
            },
            required: ["scores", "justifications", "strengths", "weaknesses", "recommendation"]
          }
        }
      });
      
      const result = JSON.parse(response.text.trim());
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'وضع غير مدعوم' }, { status: 400 });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}