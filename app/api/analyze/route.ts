import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { parseFileContent } from '../../../lib/parser';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export const maxDuration = 60; // السماح بمهلة 60 ثانية للتحليل لأنه قد يستغرق وقتاً

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

    if (validContents.length === 0) {
        return NextResponse.json({ error: 'لم نتمكن من قراءة محتوى الملفات' }, { status: 400 });
    }

    // 3. إعداد الذكاء الاصطناعي
    const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API Key is missing");
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // إعداد الموديل مع تفعيل وضع JSON
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-pro",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    summary: { type: SchemaType.STRING, description: 'ملخص عام لأداء المعلم' },
                    suggested_scores: {
                        type: SchemaType.OBJECT,
                        properties: {
                            "1": { type: SchemaType.NUMBER }, "2": { type: SchemaType.NUMBER }, "3": { type: SchemaType.NUMBER },
                            "4": { type: SchemaType.NUMBER }, "5": { type: SchemaType.NUMBER }, "6": { type: SchemaType.NUMBER },
                            "7": { type: SchemaType.NUMBER }, "8": { type: SchemaType.NUMBER }, "9": { type: SchemaType.NUMBER },
                            "10": { type: SchemaType.NUMBER }, "11": { type: SchemaType.NUMBER }
                        },
                        required: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]
                    },
                    reasons: { type: SchemaType.STRING, description: 'مبررات مفصلة للدرجات' },
                    recommendations: { type: SchemaType.STRING, description: 'توصيات للتحسين' }
                }
            }
        }
    });

    // 4. بناء البرومبت
    const promptParts: any[] = [
      `أنت خبير تقييم تعليمي محترف في وزارة التعليم السعودية. مهمتك مراجعة الشواهد وتقييمها بناءً على 11 معياراً للأداء الوظيفي:
       (1.أداء الواجبات، 2.التفاعل مع المجتمع، 3.أولياء الأمور، 4.استراتيجيات التدريس، 5.نتائج المتعلمين، 6.خطة التعلم، 7.التقنية، 8.البيئة التعليمية، 9.الإدارة الصفية، 10.تحليل النتائج، 11.أساليب التقويم).
       
       امنح درجة من 5 لكل معيار. إذا لم يوجد شاهد، امنح 0. كن دقيقاً وصارماً.`
    ];

    // إضافة محتوى الملفات
    validContents.forEach(item => {
      if (item.type === 'text') {
        promptParts.push(`\n--- ملف: ${item.name} ---\n${item.content}`);
      } else {
        promptParts.push({
            inlineData: {
                data: item.content, // يجب أن يكون base64 نظيف بدون prefix
                mimeType: item.mimeType
            }
        });
        promptParts.push(`(صورة مرفقة: ${item.name})`);
      }
    });

    // 5. الاستدعاء
    const result = await model.generateContent(promptParts);
    const responseText = result.response.text();

    return NextResponse.json(JSON.parse(responseText));

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء التحليل', details: error.message }, { status: 500 });
  }
}
