
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { parseFileContent } from '../../../lib/parser';
import { GoogleGenAI, Type } from "@google/genai";

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!link) return NextResponse.json({ error: 'رابط المجلد مطلوب' }, { status: 400 });

    const driveFiles = await getDriveFiles(link);
    if (driveFiles.length === 0) return NextResponse.json({ error: 'لا توجد ملفات أو مجلدات فرعية تحتوي على شواهد' }, { status: 404 });

    const validContents = [];
    for (const file of driveFiles) {
      const content = await parseFileContent(file);
      if (content) validContents.push(content);
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `
      أنت الآن "مُشرف تربوي خبير بوزارة التعليم". مهمتك تقييم ملف الأداء الرقمي للمعلم بناءً على الشواهد المرفقة.
      
      قواعد التقييم الصارمة:
      1. حلل هيكلية المجلدات (الأسماء والمسارات).
      2. التقييم الكمي: احسب عدد التقارير والشواهد لكل معيار. المعلم الذي قدم 3 شواهد في "تنوع أساليب التقويم" ينال درجة أعلى ممن قدم شاهداً واحداً.
      3. التقييم النوعي: ابحث عن محتوى حقيقي وليس مجرد عناوين. إذا وجد "placeholder text" أو محتوى متكرر، اخفض الدرجة.
      4. كن ناقداً ومنصفاً: لا تعطِ 5/5 إلا إذا كانت الشواهد مكتملة ومتنوعة.
      5. قدم مبرراً لكل درجة بناءً على ما وجدته (أو ما لم تجده).

      أجب بصيغة JSON تحتوي على:
      - suggested_scores: درجة من 5 لكل معيار من الـ 11.
      - evidence_counts: وصف لعدد الشواهد المكتشفة لكل معيار.
      - reasons: نقد مهني مفصل ومبررات للدرجات.
      - recommendations: توصيات للتطوير المهني.
      - summary: ملخص عام للأداء.
    `;

    const promptParts: any[] = [{ text: prompt }];
    validContents.forEach(item => {
      if (item.type === 'text') promptParts.push({ text: `ملف (المسار: ${item.name}):\n${item.content}\n---` });
      else promptParts.push({ inlineData: { data: item.content, mimeType: item.mimeType } });
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: promptParts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            suggested_scores: { type: Type.OBJECT, properties: { "1":{type:Type.NUMBER}, "2":{type:Type.NUMBER}, "3":{type:Type.NUMBER}, "4":{type:Type.NUMBER}, "5":{type:Type.NUMBER}, "6":{type:Type.NUMBER}, "7":{type:Type.NUMBER}, "8":{type:Type.NUMBER}, "9":{type:Type.NUMBER}, "10":{type:Type.NUMBER}, "11":{type:Type.NUMBER} } },
            evidence_counts: { type: Type.STRING },
            reasons: { type: Type.STRING },
            recommendations: { type: Type.STRING }
          },
          required: ['summary', 'suggested_scores', 'reasons', 'recommendations', 'evidence_counts']
        }
      }
    });

    return NextResponse.json(JSON.parse(response.text));
  } catch (error: any) {
    return NextResponse.json({ error: 'فشل التحليل', details: error.message }, { status: 500 });
  }
}
