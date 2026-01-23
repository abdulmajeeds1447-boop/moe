
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

    // 1. جلب الملفات من قوقل درايف
    const driveFiles = await getDriveFiles(link);
    if (driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ أو لا يحتوي على ملفات مدعومة (PDF أو صور)' }, { status: 404 });
    }

    // 2. استخراج محتوى الملفات (نصوص أو صور Base64)
    const validContents = [];
    for (const file of driveFiles) {
      const content = await parseFileContent(file);
      if (content) validContents.push(content);
    }

    // 3. التحليل باستخدام Gemini 3 Pro
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

    const promptParts: any[] = [
      {
        text: `أنت خبير تقييم تعليمي محترف في وزارة التعليم السعودية. مهمتك هي مراجعة شواهد المعلم المرفقة وتقييمه بناءً على 11 معياراً للأداء الوظيفي.
        المعايير هي: (1.أداء الواجبات، 2.التفاعل مع المجتمع، 3.أولياء الأمور، 4.استراتيجيات التدريس، 5.نتائج المتعلمين، 6.خطة التعلم، 7.التقنية، 8.البيئة التعليمية، 9.الإدارة الصفية، 10.تحليل النتائج، 11.أساليب التقويم).
        
        لكل معيار، حدد درجة من 5 بناءً على قوة الشاهد المرفق. إذا لم تجد شاهداً لمعيار معين، امنحه 0 أو درجة منخفضة واذكر السبب.
        يجب أن تكون الدرجات منطقية وصارمة (لا تمنح 5/5 إلا إذا كان الشاهد نموذجياً).
        
        الملفات المرفقة تتبع هذا النص:`
      }
    ];

    // إضافة محتوى الملفات للبرومبت
    validContents.forEach(item => {
      if (item.type === 'text') {
        promptParts.push({ text: `محتوى مستند (${item.name}):\n${item.content}\n---` });
      } else {
        promptParts.push({
          inlineData: {
            data: item.content,
            mimeType: item.mimeType,
          },
        });
        promptParts.push({ text: `صورة شاهد بعنوان: ${item.name}` });
      }
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // استخدام البرو لأداء أعلى في التحليل
      contents: [{ parts: promptParts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: 'ملخص عام لأداء المعلم' },
            suggested_scores: {
              type: Type.OBJECT,
              properties: {
                "1": { type: Type.NUMBER }, "2": { type: Type.NUMBER }, "3": { type: Type.NUMBER },
                "4": { type: Type.NUMBER }, "5": { type: Type.NUMBER }, "6": { type: Type.NUMBER },
                "7": { type: Type.NUMBER }, "8": { type: Type.NUMBER }, "9": { type: Type.NUMBER },
                "10": { type: Type.NUMBER }, "11": { type: Type.NUMBER }
              },
              description: 'الدرجات المقترحة من 5 لكل معيار'
            },
            reasons: { type: Type.STRING, description: 'مبررات تقنية ومهنية للدرجات الممنوحة بناء على الشواهد' },
            recommendations: { type: Type.STRING, description: 'توصيات للتحسين المهني' }
          },
          required: ['summary', 'suggested_scores', 'reasons', 'recommendations']
        }
      }
    });

    const resultText = response.text;
    return NextResponse.json(JSON.parse(resultText || '{}'));

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء معالجة الطلب', details: error.message }, { status: 500 });
  }
}
