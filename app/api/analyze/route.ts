import { NextResponse } from 'next/server';
import { downloadDriveFile } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { fileId, mimeType, fileName, mode, previousFindings } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // المرحلة 1: تحليل ملف واحد واستخراج الشواهد (لتوفير التوكنز وتجنب الـ 429)
    if (mode === 'partial') {
      const buffer = await downloadDriveFile(fileId);
      const base64Data = Buffer.from(buffer).toString('base64');

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: `قم بفحص المستند (${fileName}) واستخرج شواهد تربوية للمعايير الـ 11 (الدوام، المجتمع، أولياء الأمور، الاستراتيجيات، النتائج، التخطيط، التقنية، البيئة، الإدارة، التحليل، التقويم). اكتب ما وجدته بوضوح واختصار.` }
          ]
        }],
        config: { temperature: 0.1 }
      });
      return NextResponse.json({ findings: response.text || "" });
    }

    // المرحلة 2: إصدار القرار النهائي بناءً على جميع الشواهد المجموعة
    if (mode === 'final') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{
          parts: [{ text: `بصفتك "رئيس لجنة تدقيق الأداء الوظيفي"، أمامك الشواهد المستخرجة:\n${previousFindings}\n
          المطلوب: تقييم كل معيار من 0 إلى 5 بصرامة مهنية.
          القواعد: 
          1- لا تمنح 5 إلا بشاهد ابتكاري. 
          2- الشاهد الروتيني = 3 أو 4. 
          3- غياب الشاهد = 0.
          
          المعايير: 1-الواجبات، 2-المجتمع، 3-أولياء الأمور، 4-الاستراتيجيات، 5-تحسين النتائج، 6-التخطيط، 7-التقنية، 8-البيئة، 9-الإدارة، 10-التحليل، 11-التقويم.` }]
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
              justifications: { type: Type.ARRAY, items: { type: Type.STRING } },
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
    if (error.status === 429) {
      return NextResponse.json({ error: 'RateLimit', details: 'تجاوز الحد المسموح للطلبات.' }, { status: 429 });
    }
    return NextResponse.json({ error: 'AI Error', details: error.message }, { status: 500 });
  }
}
