import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 10; 

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح API مفقود' }, { status: 500 });
    }

    // جلب عينة صغيرة جداً من الملفات بسرعة البرق
    const driveFiles = await getDriveFiles(link);

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ 
        error: 'لم نجد ملفات (PDF/صور) في المجلد أو أول مجلدين فرعيين.' 
      }, { status: 404 });
    }

    const promptParts: any[] = [];
    for (const file of driveFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({ inlineData: { data: base64Data, mimeType: file.mimeType! } });
      promptParts.push({ text: `وثيقة: ${file.name}\n` });
    }

    promptParts.push({ 
      text: "قيم المعايير الـ 11 (0-5) واكتب نقدك الفني بالعربية. رد JSON فقط." 
    });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [{ parts: promptParts }],
      config: {
        systemInstruction: "أنت مدقق جودة. رد بـ JSON حصراً: {suggested_scores: {1:5, 2:4...}, justification: 'نص التبرير'}",
        responseMimeType: 'application/json',
        temperature: 0.1, // تقليل العشوائية لسرعة الرد
        thinkingConfig: { thinkingBudget: 0 } // تعطيل التفكير العميق لتقليل وقت الاستجابة
      }
    });

    return NextResponse.json(JSON.parse(response.text.trim()));

  } catch (error: any) {
    console.error("Final Attempt Error:", error);
    return NextResponse.json({ 
      error: 'تجاوز الوقت المسموح (10 ثوانٍ).', 
      details: 'يرجى وضع ملف واحد فقط (PDF) في المجلد الرئيسي لضمان السرعة القصوى.' 
    }, { status: 500 });
  }
}