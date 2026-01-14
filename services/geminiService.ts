
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeTeacherReport = async (driveLink: string) => {
  const prompt = `
    أنت الآن تعمل كمساعد تقني ذكي للأستاذ نايف أحمد الشهري، مدير مدرسة الأمير عبدالمجيد الأولى.
    المهمة: تحليل رابط شواهد الأداء الوظيفي التالي: ${driveLink}
    
    المطلوب منك تقديم رد بتنسيق JSON (حصراً) يحتوي على العناصر التالية:
    1. "summary": ملخص واقعي ونقدي جداً لما تم رصده في الرابط (كن حذراً إذا كان الرابط لا يحتوي شواهد).
    2. "suggested_scores": مصفوفة تحتوي على الدرجة المقترحة (من 1 إلى 5) لكل عنصر من العناصر الـ 11 بالترتيب.
    3. "recommendations": أهم 3 توصيات عملية لتحسين أداء المعلم.
    4. "reasons": مبررات الدرجات المقترحة.

    ملاحظة هامة: إذا وجد مديحاً لا يستند لشواهد، استبدله بنقد بناء.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return null;
  }
};
