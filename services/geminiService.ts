
export const analyzeTeacherReport = async (driveLink: string) => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: driveLink }),
    });

    // تحقق من نوع المحتوى قبل المحاولة
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("Server returned non-JSON response:", text);
      throw new Error("حدث خطأ في السيرفر (استجابة غير صالحة). تأكد من إعدادات Vercel ومسار الـ API.");
    }

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.details || 'فشل التحليل');
    }
    
    // توحيد تنسيق الدرجات كأرقام
    if (result.suggested_scores) {
      const fixedScores: Record<number, number> = {};
      for (let i = 1; i <= 11; i++) {
        fixedScores[i] = Number(result.suggested_scores[i.toString()] || result.suggested_scores[i] || 0);
      }
      result.suggested_scores = fixedScores;
    }
    
    return result;
  } catch (error: any) {
    console.error("AI Analysis Client Error:", error);
    throw error;
  }
};
