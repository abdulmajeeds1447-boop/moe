
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { parseFileContent } from '../../../lib/parser';
import { GoogleGenAI, Type } from "@google/genai";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح API غير متوفر' }, { status: 500 });
    }

    const driveFiles = await getDriveFiles(link);
    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({ error: 'المجلد فارغ أو لا يمكن الوصول إليه' }, { status: 404 });
    }

    // تحليل ملفات المجلد بعمق (أول 8 ملفات لضمان الجودة)
    const limitedFiles = driveFiles.slice(0, 8);
    const promptParts: any[] = [];
    
    for (const file of limitedFiles) {
      const processed = await parseFileContent(file);
      if (processed) {
        if (processed.type === 'text') {
          promptParts.push({ text: `--- فحص مستند (${processed.name}) ---\n${processed.content}\n` });
        } else if (processed.type === 'image') {
          promptParts.push({
            inlineData: { data: processed.content, mimeType: processed.mimeType }
          });
          promptParts.push({ text: `[صورة شاهد فوتوغرافي: ${processed.name}]\n` });
        }
      }
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // استخدام أقوى موديل متاح للتحليل المنطقي
    const modelName = 'gemini-3-pro-preview';
    
    const systemInstruction = `
أنت الآن "مدقق فني أول" في وزارة التعليم. مهمتك فحص ملفات المعلم بصرامة مهنية تامة.

تحذير هام (Auditor Alert):
- المجلد قد يحتوي على "أطر مرجعية" أو "جداول معايير الوزارة". هذه ليست شواهد! 
- إذا وجدت مستنداً يصف المعيار أو يشرح كيف يتم التقييم (مثل جدول أوزان)، يجب عليك تجاهله تماماً في التقييم ومنح درجة 0 للمعيار المرتبط به ما لم تجد "شاهداً تطبيقياً" (مثل: خطة درس، صور طلاب، كشوفات درجات حقيقية، رسائل أولياء أمور).
- كن صريحاً جداً: إذا لم تجد إلا "توصيف المعايير"، اذكر في التبرير: "لم يتم العثور على شواهد تطبيقية، الملفات المرفقة هي وثائق مرجعية فقط".

المعايير الـ 11 والأوزان المخصصة:
1. الواجبات الوظيفية (10%)
2. التفاعل مع المجتمع المهني (10%)
3. التفاعل مع أولياء الأمور (10%)
4. استراتيجيات التدريس (10%)
5. نتائج المتعلمين (10%)
6. خطة التعلم (10%)
7. تقنيات ووسائل التعلم (10%)
8. البيئة التعليمية (5%)
9. الإدارة الصفية (5%)
10. تحليل النتائج (10%)
11. أساليب التقويم (10%)

يجب أن يكون الرد JSON حصراً:
{
  "suggested_scores": {"1": 0, "2": 0, ... "11": 0},
  "justification": "تقرير التدقيق الفني المعتمد: \n\n1. تقييم الشواهد: [اذكر أسماء الملفات التي اعتبرتها شواهد حقيقية وما الذي تجاهلته كأوراق مرجعية]\n2. الأدلة المفقودة: [ما الذي يحتاجه المعلم لإثبات أدائه]\n3. الخلاصة المهنية: [تحليل نقدي صارم لمحتوى المجلد]"
}
    `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: promptParts }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.1, // دقة متناهية
        thinkingConfig: { thinkingBudget: 4000 }, // تفعيل التفكير لتحليل الفرق بين الشاهد والمرجع
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
          }
        }
      }
    });

    return NextResponse.json(JSON.parse(response.text || '{}'));

  } catch (error: any) {
    console.error("Auditor Pro Error:", error);
    return NextResponse.json({ error: 'فشل نظام التدقيق الاحترافي' }, { status: 500 });
  }
}
