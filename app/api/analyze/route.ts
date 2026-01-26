import { NextResponse } from 'next/server';
import { downloadDriveFile } from '../../../lib/drive';
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 10;

export async function POST(req: Request) {
  try {
    const { fileId, mimeType, fileName, mode, previousFindings } = await req.json();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // الوضع الأول: تحليل ملف واحد فقط (سريع وآمن)
    if (mode === 'partial') {
      const buffer = await downloadDriveFile(fileId);
      const base64Data = Buffer.from(buffer).toString('base64');

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: `حلل هذا الملف (${fileName}) واستخرج منه شواهد تعليمية. لخص ما وجدته من أدلة مهنية فقط باختصار شديد.` }
          ]
        }],
        config: { temperature: 0.1 }
      });

      return NextResponse.json({ findings: response.text });
    }

    // الوضع الثاني: التجميع النهائي للنتائج (Synthesis)
    if (mode === 'final') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [{ text: `بناءً على النتائج التالية المستخرجة من عدة ملفات:\n${previousFindings}\n\nقيم المعايير الـ 11 (0-5) واكتب تبريراً نقدياً شاملاً بالعربية. رد بصيغة JSON فقط: {suggested_scores: {1:5, 2:4...}, justification: '...'}` }]
        }],
        config: { 
          responseMimeType: 'application/json',
          systemInstruction: "أنت خبير تقييم أداء. حول الشواهد المجمعة إلى درجات دقيقة."
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