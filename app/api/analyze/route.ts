import { NextResponse } from 'next/server';
import { downloadDriveFile } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { files, mode } = await req.json();

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // وضع التحليل الشامل (يعالج كل الملفات في طلب واحد)
    if (mode === 'bulk_analysis') {
      const parts: any[] = [
        { text: `بصفتك خبيراً في تقييم الأداء الوظيفي للمعلمين، قم بفحص كافة الشواهد المرفقة (صور و PDF) وتقييم المعايير الـ 11 التالية من (0 إلى 5):
          1- الواجبات، 2- المجتمع، 3- أولياء الأمور، 4- الاستراتيجيات، 5- تحسين النتائج، 6- التخطيط، 7- التقنية، 8- البيئة، 9- الإدارة، 10- التحليل، 11- التقويم.
          
          القواعد:
          - كن صارماً وموضوعياً.
          - الدرجة 5 تمنح فقط عند وجود ابتكار واضح.
          - غياب الشاهد للمعيار يعني درجة 0.
          - استخرج مبرراً قصيراً لكل معيار بناءً على ما رأيته في الصور/الملفات.` }
      ];

      // تحميل الملفات وتحويلها لـ Base64 لضمها للطلب
      for (const file of files) {
        try {
          const buffer = await downloadDriveFile(file.id);
          const base64Data = Buffer.from(buffer).toString('base64');
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType: file.mimeType
            }
          });
        } catch (e) {
          console.error("Error downloading file for AI:", file.name);
        }
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite-latest', // استخدام موديل لايت لضمان سرعة الاستجابة وتجنب الـ Limits
        contents: [{ parts }],
        config: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scores: {
                type: Type.OBJECT,
                properties: {
                  "1": { type: Type.NUMBER }, "2": { type: Type.NUMBER }, "3": { type: Type.NUMBER },
                  "4": { type: Type.NUMBER }, "5": { type: Type.NUMBER }, "6": { type: Type.NUMBER },
                  "7": { type: Type.NUMBER }, "8": { type: Type.NUMBER }, "9": { type: Type.NUMBER },
                  "10": { type: Type.NUMBER }, "11": { type: Type.NUMBER }
                }
              },
              justifications: { type: Type.ARRAY, items: { type: Type.STRING }, description: "مبرر واحد لكل معيار بالترتيب" },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendation: { type: Type.STRING }
            },
            required: ["scores", "justifications", "strengths", "weaknesses", "recommendation"]
          }
        }
      });
      
      return NextResponse.json(JSON.parse(response.text.trim()));
    }

    return NextResponse.json({ error: 'وضع غير مدعوم' }, { status: 400 });

  } catch (error: any) {
    console.error("AI Error:", error);
    if (error.status === 429) {
      return NextResponse.json({ error: 'عذراً، الخدمة مزدحمة. يرجى الانتظار دقيقة واحدة.' }, { status: 429 });
    }
    return NextResponse.json({ error: 'فشل التحليل الذكي', details: error.message }, { status: 500 });
  }
}
