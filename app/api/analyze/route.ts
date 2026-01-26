import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف.' }, { status: 500 });
    }

    // جلب الملفات - سنكتفي بطلب أول 2 ملفات فقط من lib/drive لزيادة السرعة
    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ error: 'فشل الوصول للمجلد. تأكد أنه (عام - أي شخص لديه الرابط).' }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ أو يحتوي على ملفات غير مدعومة.' }, { status: 404 });
    }

    // سنحلل أول ملفين فقط لضمان السرعة القصوى (عادة ما يكون التقرير الشامل أولاً)
    const essentialFiles = driveFiles.slice(0, 2);
    const promptParts: any[] = [];
    
    for (const file of essentialFiles) {
      if (file.buffer) {
        const base64Data = Buffer.from(file.buffer).toString('base64');
        promptParts.push({
          inlineData: { data: base64Data, mimeType: file.mimeType }
        });
        promptParts.push({ text: `وثيقة: ${file.name}\n` });
      }
    }

    promptParts.push({ 
      text: "حلل أداء المعلم لـ 11 معياراً. أعطِ درجة (0-5) وتبريراً مختصراً جداً باللغة العربية. يجب أن تكون الاستجابة JSON." 
    });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // استخدام flash-preview لأنه الأسرع استجابة
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [{ parts: promptParts }],
      config: {
        systemInstruction: "أنت مدقق جودة. رد بصيغة JSON فقط: {suggested_scores: {1:5, 2:4...}, justification: '...'}",
        responseMimeType: 'application/json'
      }
    });

    const resultText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
    return NextResponse.json(JSON.parse(resultText));

  } catch (error: any) {
    console.error("Critical Analysis Error:", error);
    return NextResponse.json({ 
      error: 'تجاوز النظام الوقت المسموح (10 ثوانٍ).', 
      details: 'يرجى محاولة وضع ملفات أقل حجماً في المجلد.' 
    }, { status: 500 });
  }
}