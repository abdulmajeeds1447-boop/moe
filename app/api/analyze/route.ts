import { NextResponse } from 'next/server';
import { downloadDriveFile } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { files, mode } = body;

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    if (files && Array.isArray(files)) {
      const parts: any[] = [
        { text: `أنت مقيم تربوي خبير. قم بتحليل الشواهد المرفقة وتقييم المعايير الـ 11 من (0-5).
          المعايير: 1-الواجبات، 2-المجتمع، 3-أولياء الأمور، 4-الاستراتيجيات، 5-النتائج، 6-التخطيط، 7-التقنية، 8-البيئة، 9-الإدارة، 10-التحليل، 11-التقويم.
          - قدم مبرراً قصيراً جداً لكل معيار.
          - إذا لم تجد شواهد لبعض المعايير، أعطها 0.` }
      ];

      // تقليل العدد لـ 6 ملفات فقط لضمان المرور من قيود جوجل المجانية
      const filesToProcess = files.slice(0, 6);
      
      for (const file of filesToProcess) {
        try {
          const buffer = await downloadDriveFile(file.id);
          const base64Data = Buffer.from(buffer).toString('base64');
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType: file.mimeType
            }
          });
        } catch (e) {
          console.error(`Error loading file ${file.name}`);
        }
      }

      const response = await ai.models.generateContent({
        // استخدام موديل Lite لأنه يسمح بطلبات أكثر استقراراً في النسخة المجانية
        model: 'gemini-2.5-flash-lite-latest', 
        contents: [{ parts }],
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

    return NextResponse.json({ error: 'لا توجد ملفات معالجة' }, { status: 400 });

  } catch (error: any) {
    if (error.status === 429) {
      return NextResponse.json({ error: 'RATE_LIMIT' }, { status: 429 });
    }
    return NextResponse.json({ error: 'فشل التحليل الذكي', details: error.message }, { status: 500 });
  }
}
