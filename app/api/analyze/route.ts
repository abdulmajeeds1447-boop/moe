import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { parseFileContent } from '../../../lib/parser';
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { link } = await req.json();
    
    // التحقق من الرابط
    if (!link) return NextResponse.json({ error: 'الرابط مطلوب' }, { status: 400 });

    // 1. جلب الملفات
    const driveFiles = await getDriveFiles(link);
    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'لم يتم العثور على ملفات' }, { status: 404 });
    }

    // 2. قراءة المحتوى
    const validContents = [];
    for (const file of driveFiles) {
      const content = await parseFileContent(file);
      if (content) validContents.push(content);
    }

    // 3. تحليل الذكاء الاصطناعي
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || process.env.API_KEY || '');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const prompt = `أنت خبير تعليمي. قيم الشواهد التالية بناء على 11 معيار للأداء الوظيفي (من 1 إلى 5). 
    أخرج النتيجة بصيغة JSON فقط تحتوي على: summary, suggested_scores, reasons, recommendations.`;
    
    // تجميع البيانات للإرسال
    const parts = [prompt];
    validContents.forEach(c => {
        parts.push(`ملف: ${c.name}\n${c.content}`);
    });

    const result = await model.generateContent(parts);
    const response = result.response;
    const text = response.text();
    
    // تنظيف الرد من علامات الـ Markdown إذا وجدت
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '');

    return NextResponse.json(JSON.parse(cleanText));

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'فشل التحليل', details: error.message }, { status: 500 });
  }
}
