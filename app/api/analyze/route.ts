import { NextResponse } from 'next/server';
import { downloadDriveFile } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 30; 

export async function POST(req: Request) {
  try {
    const { fileId, mimeType, fileName, mode, previousFindings } = await req.json();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    if (mode === 'partial') {
      const buffer = await downloadDriveFile(fileId);
      const base64Data = Buffer.from(buffer).toString('base64');

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: `حلل هذا الملف (${fileName}) واستخرج شواهد مباشرة للمعايير الـ 11 (الواجبات، المجتمع، أولياء الأمور، الاستراتيجيات، النتائج، التخطيط، التقنية، البيئة، الإدارة، التحليل، التقويم). اكتب فقط رقم المعيار والشاهد.` }
          ]
        }],
        config: { temperature: 0.1 }
      });
      return NextResponse.json({ findings: response.text || "" });
    }

    if (mode === 'final') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{
          parts: [{ text: `بصفتك رئيس لجنة تقييم الأداء، قيم المعلم بناءً على الشواهد التالية:\n${previousFindings}\n
          يجب أن يتضمن ردك:
          1. درجة لكل معيار من 1 إلى 11 (من 0 إلى 5).
          2. مبرر نصي مقتضب لكل معيار يوضح سبب الدرجة.
          3. 3 نقاط قوة و 2 تطوير وتوصية ختامية.
          ملاحظة: إذا لم تجد شاهداً لمعيار، اعطه الدرجة 0 واكتب في المبرر "لم يتم العثور على شاهد في الملفات المرفقة".` }]
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
                description: "يجب أن يحتوي على 11 نصاً بالضبط، كل نص يقابل المعيار بالترتيب"
              },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendation: { type: Type.STRING }
            },
            required: ["scores", "justifications", "strengths", "weaknesses", "recommendation"]
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