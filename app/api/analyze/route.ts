import { NextResponse } from 'next/server';
import { downloadDriveFile } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { files, mode, link } = body;

    if (!process.env.API_KEY) {
      return NextResponse.json({ error: 'مفتاح Gemini API غير معرف في الإعدادات.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // تحديد الوضع: إذا كان هناك ملفات، نعتبره تحليل شامل تلقائياً لتجنب خطأ "وضع غير مدعوم"
    const effectiveMode = mode || (files ? 'bulk_analysis' : 'legacy');

    if (effectiveMode === 'bulk_analysis' && files && Array.isArray(files)) {
      const parts: any[] = [
        { text: `أنت مقيم أداء وظيفي خبير في وزارة التعليم. قم بتحليل كافة الشواهد المرفقة (صور و PDF) وتقييم المعايير الـ 11 التالية بناءً على الأدلة المرئية فقط.
          المعايير هي: 1- الأداء، 2- المجتمع، 3- أولياء الأمور، 4- الاستراتيجيات، 5- تحسين النتائج، 6- التخطيط، 7- التقنية، 8- البيئة، 9- الإدارة، 10- التحليل، 11- التقويم.
          
          القواعد الصارمة:
          - الدرجة من 0 إلى 5 (5 تمنح فقط عند وجود ابتكار استثنائي).
          - إذا لم تجد شاهداً لمعيار معين، امنحه درجة 0.
          - اكتب مبرراً تربوياً قصيراً ومقنعاً لكل معيار بناءً على ما وجدته في الصور/الملفات.
          - كن موضوعياً جداً ولا تجامل.` }
      ];

      // تحميل الملفات وتحويلها لـ Base64
      // نكتفي بآخر 12 ملفاً لضمان عدم تجاوز حجم الطلب
      const filesToProcess = files.slice(0, 12);
      
      for (const file of filesToProcess) {
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
          console.error(`Error downloading file ${file.name}:`, e);
        }
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview', 
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
              justifications: { type: Type.ARRAY, items: { type: Type.STRING }, description: "مبرر واحد لكل معيار بالترتيب من 1 إلى 11" },
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

    // التعامل مع الطلبات القديمة أو غير المكتملة
    return NextResponse.json({ 
      error: 'لم يتم العثور على ملفات للتحليل. تأكد من أن المجلد يحتوي على ملفات PDF أو صور.',
      receivedMode: effectiveMode
    }, { status: 400 });

  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    if (error.status === 429) {
      return NextResponse.json({ error: 'عذراً، تجاوزنا عدد الطلبات المسموح. يرجى الانتظار دقيقة.' }, { status: 429 });
    }
    return NextResponse.json({ error: 'حدث خطأ أثناء التحليل الذكي للبيانات.', details: error.message }, { status: 500 });
  }
}
