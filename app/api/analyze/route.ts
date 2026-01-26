import { NextResponse } from 'next/server';
import { downloadDriveFile } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 30; 

export async function POST(req: Request) {
  try {
    const { fileId, mimeType, fileName, mode, previousFindings } = await req.json();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // المرحلة 1: تحليل جزئي (لكل ملف على حدة)
    if (mode === 'partial') {
      const buffer = await downloadDriveFile(fileId);
      const base64Data = Buffer.from(buffer).toString('base64');

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview', // فلاش سريع للمرحلة الجزئية
        contents: [{
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: `أنت مدقق تربوي. استخرج من هذا الملف (${fileName}) أي شواهد تدعم المعايير الـ 11 للأداء الوظيفي. 
            المعايير هي: 1-الواجبات، 2-المجتمع، 3-أولياء الأمور، 4-الاستراتيجيات، 5-تحسين النتائج، 6-التخطيط، 7-التقنية، 8-البيئة، 9-الإدارة الصفية، 10-التحليل، 11-التقويم.
            اكتب فقط: "معيار رقم (X): [الشاهد باختصار]".` }
          ]
        }],
        config: { temperature: 0.1 }
      });

      return NextResponse.json({ findings: response.text || "" });
    }

    // المرحلة 2: التقييم النهائي (تجميع كافة الشواهد وإصدار القرار)
    if (mode === 'final') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', // برو للقرار النهائي لضمان الدقة
        contents: [{
          parts: [{ text: `أنت الآن رئيس لجنة تدقيق الأداء الوظيفي. بناءً على كافة الشواهد المجمعة من ملفات المعلم التالية:\n${previousFindings}\n
          المطلوب إصدار تقرير تقييم نهائي صارم وعادل:
          1. تقييم كل معيار من 0 إلى 5 (0 عند انعدام الشاهد، 5 عند التميز).
          2. كتابة مبرر لكل معيار.
          3. تحديد 3 نقاط قوة و 2 نقطة تطوير.
          4. توصية مهنية ختامية.
          
          يجب أن يكون الرد JSON تماماً.` }]
        }],
        config: { 
          responseMimeType: "application/json",
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
                },
                required: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]
              },
              justifications: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "مبرر لكل معيار بالترتيب من 1 إلى 11"
              },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendation: { type: Type.STRING }
            },
            required: ["suggested_scores", "justifications", "strengths", "weaknesses", "recommendation"]
          }
        }
      });
      
      return NextResponse.json(JSON.parse(response.text.trim()));
    }

    return NextResponse.json({ error: 'وضع غير مدعوم' }, { status: 400 });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}