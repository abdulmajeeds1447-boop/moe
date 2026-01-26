import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف.' }, { status: 500 });
    }

    if (!link) {
      return NextResponse.json({ error: 'رابط المجلد مطلوب.' }, { status: 400 });
    }

    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ error: 'خطأ في الوصول للمجلد', details: driveError.message }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ أو لا يحتوي على صور/PDF.' }, { status: 404 });
    }

    // تقليص العدد لضمان عدم تجاوز الذاكرة والوقت
    const limitedFiles = driveFiles.slice(0, 4); 
    const promptParts: any[] = [];
    
    for (const file of limitedFiles) {
      if (file.buffer) {
        const base64Data = Buffer.from(file.buffer).toString('base64');
        promptParts.push({
          inlineData: { data: base64Data, mimeType: file.mimeType }
        });
        promptParts.push({ text: `وثيقة من الملف الرقمي باسم: ${file.name}\n` });
      }
    }

    promptParts.push({ 
      text: "قم بتقييم المعايير الـ 11 للمعلم. أعطِ درجة من 0-5 لكل معيار واكتب تبريراً فنياً (نقد الأدلة) باللغة العربية. يجب أن تكون الاستجابة بصيغة JSON حصراً." 
    });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = "أنت مدقق جودة تعليمي خبير. قدم تقييماً صارماً بناءً على الشواهد المرفقة فقط. استجابتك يجب أن تكون كائن JSON يحتوي على الحقول: suggested_scores (كائن بمفاتيح من 1 لـ 11) و justification (نص تبرير).";

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [{ parts: promptParts }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
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
          },
          required: ['suggested_scores', 'justification']
        }
      }
    });

    let resultText = response.text || "";
    
    // تنظيف النص في حال أعاد الذكاء الاصطناعي أكواد Markdown
    resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const parsed = JSON.parse(resultText);
      return NextResponse.json(parsed);
    } catch (parseError) {
      console.error("JSON Parse Error:", resultText);
      return NextResponse.json({ error: 'فشل في قراءة تحليل الذكاء الاصطناعي كـ JSON' }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Analysis Error:", error);
    return NextResponse.json({ 
      error: 'فشل التحليل الذكي', 
      details: error.message 
    }, { status: 500 });
  }
}