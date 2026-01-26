import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 10; // حد Vercel الصارم

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح API مفقود' }, { status: 500 });
    }

    // جلب الملفات من المجلدات الفرعية بالتوازي
    const driveFiles = await getDriveFiles(link);

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ 
        error: 'لم نجد ملفات مدعومة (PDF/صور) في المجلد أو مجلداته الفرعية.' 
      }, { status: 404 });
    }

    const promptParts: any[] = [];
    
    // تحويل الملفات لـ Base64 مباشرة وإرسالها لـ Gemini
    for (const file of driveFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: {
          data: base64Data,
          mimeType: file.mimeType!
        }
      });
      promptParts.push({ text: `هذا الملف هو شاهد من المجلد: ${file.name}\n` });
    }

    promptParts.push({ 
      text: "حلل هذه الشواهد التعليمية وقيم أداء المعلم لـ 11 معياراً (0-5). اكتب تبريراً نقدياً مختصراً باللغة العربية. رد بصيغة JSON فقط." 
    });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // استخدام Gemini 3 Flash لسرعته الهائلة في معالجة الملفات
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [{ parts: promptParts }],
      config: {
        systemInstruction: "أنت خبير جودة تعليمية. راجع الملفات المرفقة بدقة واستخرج الدرجات. الرد يجب أن يكون JSON فقط: {suggested_scores: {1:5, 2:4...}, justification: 'نص التبرير'}",
        responseMimeType: 'application/json'
      }
    });

    const resultText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
    return NextResponse.json(JSON.parse(resultText));

  } catch (error: any) {
    console.error("Critical Analysis Error:", error);
    return NextResponse.json({ 
      error: 'فشل التحليل أو تجاوز الوقت المسموح (10 ثوانٍ). يرجى تقليل عدد الملفات في المجلدات الفرعية.', 
      details: error.message 
    }, { status: 500 });
  }
}