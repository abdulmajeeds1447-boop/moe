import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 10; // حد Vercel Hobby

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح API مفقود' }, { status: 500 });
    }

    // جلب الملفات (البحث الذكي في المجلدات الفرعية)
    const driveFiles = await getDriveFiles(link);

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ 
        error: 'المجلد أو مجلداته الفرعية لا تحتوي على ملفات مدعومة (PDF/صور).' 
      }, { status: 404 });
    }

    const promptParts: any[] = [];
    for (const file of driveFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({ inlineData: { data: base64Data, mimeType: file.mimeType! } });
      promptParts.push({ text: `وثيقة شاهد: ${file.name}\n` });
    }

    promptParts.push({ 
      text: "بناءً على الشواهد المرفقة من المجلدات، قيم المعايير الـ 11 (0-5) واكتب نقدك الفني باللغة العربية. رد بصيغة JSON فقط." 
    });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [{ parts: promptParts }],
      config: {
        systemInstruction: "أنت مدقق جودة تعليمي صارم. حلل الملفات المرفقة (التي قد تكون من مجلدات معايير مختلفة) واستخرج الدرجات المكتسبة. رد بـ JSON حصراً: {suggested_scores: {1:5, 2:4...}, justification: 'نص التبرير'}",
        responseMimeType: 'application/json'
      }
    });

    const resultText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
    return NextResponse.json(JSON.parse(resultText));

  } catch (error: any) {
    console.error("Analysis Error:", error);
    return NextResponse.json({ 
      error: 'فشل التحليل الذكي أو تجاوز الوقت.', 
      details: error.message 
    }, { status: 500 });
  }
}