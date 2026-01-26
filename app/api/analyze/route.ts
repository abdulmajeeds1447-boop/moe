import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
// 1. التغيير الذي طلبته: حذفنا SchemaType وعدنا للاستيراد البسيط
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف.' }, { status: 500 });
    }

    // جلب الملفات
    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ error: 'خطأ في الوصول للمجلد', details: driveError.message }, { status: 403 });
    }

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ.' }, { status: 404 });
    }

    // تجهيز الملفات
    const promptParts: any[] = [];
    for (const file of driveFiles) {
      const base64Data = Buffer.from(file.buffer).toString('base64');
      promptParts.push({
        inlineData: { data: base64Data, mimeType: file.mimeType }
      });
      promptParts.push({ text: `[شاهد: ${file.name}]\n` });
    }

    // 2. التعليمات الصارمة (بدلاً من SchemaType)
    const promptText = `
أنت خبير تربوي. قيم المعلم بناءً على الشواهد المرفقة.
المعايير (من 10%، والبيئة والإدارة 5%):
1.الواجبات 2.المجتمع 3.أولياء الأمور 4.استراتيجيات التدريس 5.النتائج 6.خطة التعلم
7.التقنية 8.البيئة 9.الإدارة 10.التحليل 11.التقويم.

الدرجة من 1-5.
مهم جداً: أخرج النتيجة بصيغة JSON فقط، بدون أي نصوص إضافية في البداية أو النهاية.
الصيغة المطلوبة:
{
  "suggested_scores": { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 0, "10": 0, "11": 0 },
  "justification": "اكتب التبرير هنا"
}
`;
    promptParts.push({ text: promptText });

    const genAI = new GoogleGenerativeAI(process.env.API_KEY);
    
    // 3. العودة للموديل الكلاسيكي الذي يعمل على كل النسخ
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: promptParts }],
    });

    const responseText = result.response.text();

    // 4. تنظيف النص يدوياً لضمان أنه JSON (حل مشاكل التنسيق)
    const cleanJson = responseText.replace(/```json|```/g, '').trim();
    
    return NextResponse.json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error("AI Error:", error);
    return NextResponse.json({ error: 'فشل التحليل', details: error.message }, { status: 500 });
  }
}
