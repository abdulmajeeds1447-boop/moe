import { NextResponse } from 'next/server';
import { downloadDriveFile } from '../../../lib/drive';
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

export const maxDuration = 10;

export async function POST(req: Request) {
  try {
    const { fileId, mimeType, fileName, mode, previousFindings } = await req.json();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // المرحلة 1: استخراج الشواهد وتصنيفها أولياً
    if (mode === 'partial') {
      const buffer = await downloadDriveFile(fileId);
      const base64Data = Buffer.from(buffer).toString('base64');

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: `أنت مدقق جودة تعليمي. حلل الملف (${fileName}) واستخرج منه أدلة واضحة تخص المعايير الـ 11 للأداء الوظيفي. 
            المعايير هي: (1-الواجبات، 2-المجتمع، 3-أولياء الأمور، 4-الاستراتيجيات، 5-تحسين النتائج، 6-التخطيط، 7-التقنية، 8-البيئة، 9-الإدارة الصفية، 10-التحليل، 11-التقويم).
            اذكر رقم المعيار وبجانبه الشاهد المستخلص منه باختصار شديد جداً.` }
          ]
        }],
        config: { temperature: 0.1 }
      });

      return NextResponse.json({ findings: response.text });
    }

    // المرحلة 2: التقييم النهائي، المبررات، والتوصيات
    if (mode === 'final') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [{ text: `بناءً على الشواهد المستخلصة من كافة ملفات المعلم التالية:\n${previousFindings}\n
          المطلوب منك كمدقق خبير:
          1. تقييم كل معيار من 0 إلى 5 بناءً على قوة الشواهد (0 إذا لم يوجد شاهد).
          2. كتابة مبرر منطقي لكل درجة.
          3. تحديد نقاط القوة (Strengths) ونقاط التطوير (Areas for growth).
          4. كتابة توصية ختامية للمعلم.
          
          رد بصيغة JSON حصراً بهذا التركيب:
          {
            "suggested_scores": {"1":5, "2":4, ...},
            "justification": "نص المبررات العامة...",
            "strengths": ["نقطة 1", "نقطة 2"],
            "weaknesses": ["نقطة 1"],
            "recommendation": "نص التوصية الختامية"
          }` }]
        }],
        config: { 
          responseMimeType: 'application/json',
          systemInstruction: "أنت رئيس لجنة تدقيق الأداء الوظيفي بوزارة التعليم. قراراتك مبنية على الأدلة فقط. كن صارماً وعادلاً في الدرجات."
        }
      });
      
      const result = JSON.parse(response.text.trim());
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'وضع غير مدعوم' }, { status: 400 });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}