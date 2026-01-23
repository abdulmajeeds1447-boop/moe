
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

    // تأكد من وجود API KEY
    if (!process.env.API_KEY) {
      console.error("Missing API_KEY environment variable");
      return NextResponse.json({ error: 'إعدادات الذكاء الاصطناعي غير مكتملة على السيرفر' }, { status: 500 });
    }

    // 1. جلب الملفات
    let driveFiles = [];
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveErr: any) {
      return NextResponse.json({ error: driveErr.message }, { status: 400 });
    }

    if (driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ أو لا يحتوي على ملفات مدعومة' }, { status: 404 });
    }

    // 2. استخراج المحتوى
    const validContents = [];
    for (const file of driveFiles) {
      try {
        const content = await parseFileContent(file);
        if (content) validContents.push(content);
      } catch (parseErr) {
        console.error(`Error parsing file ${file.name}:`, parseErr);
      }
    }

    if (validContents.length === 0) {
      return NextResponse.json({ error: 'لم نتمكن من قراءة محتوى الملفات داخل المجلد' }, { status: 400 });
    }

    // 3. التحليل
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const promptParts: any[] = [
      { text: "أنت خبير تقييم تعليمي محترف. قيم المعلم بناءً على الشواهد المرفقة لـ 11 معياراً. الدرجة من 5 لكل معيار." }
    ];

    validContents.forEach(item => {
      if (item.type === 'text') {
        promptParts.push({ text: `ملف (${item.name}):\n${item.content}\n---` });
      } else {
        promptParts.push({ inlineData: { data: item.content, mimeType: item.mimeType } });
      }
    });

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
            reasons: { type: Type.STRING },
            recommendations: { type: Type.STRING }
          },
          required: ['summary', 'suggested_scores', 'reasons', 'recommendations']
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('API Runtime Error:', error);
    return NextResponse.json({ 
      error: 'فشل النظام في معالجة الطلب', 
      details: error.message 
    }, { status: 500 });
  }
}
