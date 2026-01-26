import { NextResponse } from 'next/server';
import { downloadDriveFile } from '../../../lib/drive';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { fileId, mimeType, fileName, mode, previousFindings } = await req.json();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // المرحلة 1: التحليل الجزئي العميق (استخراج الشواهد الحقيقية)
    if (mode === 'partial') {
      const buffer = await downloadDriveFile(fileId);
      const base64Data = Buffer.from(buffer).toString('base64');

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: `أنت الآن "محلل شواهد تربوية". قم بفحص هذا المستند (${fileName}) بدقة. 
            استخرج شواهد ملموسة (أرقام، تواريخ، أسماء استراتيجيات، محاضر، نتائج طلاب). 
            صنف الشواهد حسب المعايير الـ 11 (الدوام، المجتمع، أولياء الأمور، الاستراتيجيات، النتائج، التخطيط، التقنية، البيئة، الإدارة، التحليل، التقويم).
            إذا لم تجد شواهد لبعض المعايير، تجاوزها. اكتب ما وجدته فقط بصدق وموضوعية.` }
          ]
        }],
        config: { temperature: 0.1 }
      });
      return NextResponse.json({ findings: response.text || "" });
    }

    // المرحلة 2: محاكاة قرار "المشرف التربوي الخبير والصارم"
    if (mode === 'final') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{
          parts: [{ text: `بصفتك "رئيس لجنة تدقيق الأداء الوظيفي والتميز التربوي"، أمامك الشواهد التي جمعها مساعدوك من ملفات المعلم:\n${previousFindings}\n
          المطلوب منك إصدار "قرار تقييم نهائي" يتسم بالصرامة والمهنية العالية وفق القواعد التالية:
          1. تقييم كل معيار من 0 إلى 5.
          2. كن "ناقداً": لا تمنح الدرجة الكاملة (5) أبداً إلا إذا وجد شاهد قطعي ومبتكر. إذا كان الشاهد روتينياً امنح (3) أو (4). إذا غاب الشاهد امنح (0).
          3. مبرر الدرجة: يجب أن يكون مبرراً تربوياً "قوياً" يربط الدرجة بما ورد (أو لم يرد) في الملفات.
          4. نقاط القوة: حدد 3 نقاط تميز حقيقي فقط.
          5. فرص التحسين: حدد بوضوح أين أخفق المعلم في تقديم شواهد كافية.
          6. التوصية النهائية: رسالة توجيهية صارمة لرفع كفاءة المعلم.

          المعايير هي: 1-الواجبات، 2-المجتمع، 3-أولياء الأمور، 4-الاستراتيجيات، 5-تحسين النتائج، 6-التخطيط، 7-التقنية، 8-البيئة، 9-الإدارة، 10-التحليل، 11-التقويم.` }]
        }],
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
              justifications: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "يجب أن يحتوي على 11 مبرراً تربوياً دقيقاً، مبرر لكل معيار بالترتيب"
              },
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
    console.error("Critical API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}