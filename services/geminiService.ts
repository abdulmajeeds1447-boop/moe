export const analyzeTeacherReport = async (driveLink: string) => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: driveLink }),
    });

    const contentType = response.headers.get("content-type");
    
    // في حال رجع Vercel خطأ 504 (Timeout) ستكون الاستجابة HTML
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error('تجاوزت العملية 10 ثوانٍ. يرجى التأكد من أن الملف الأول في المجلد هو تقرير PDF واضح وصغير الحجم.');
    }

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'فشل التحليل الذكي');
    }

    if (result.suggested_scores) {
      const fixedScores: Record<number, number> = {};
      for (let j = 1; j <= 11; j++) {
        const val = result.suggested_scores[j.toString()] || result.suggested_scores[j];
        fixedScores[j] = Number(val !== undefined ? val : 0);
      }
      result.suggested_scores = fixedScores;
    }

    return result;

  } catch (error: any) {
    console.error("Service Error:", error);
    throw new Error(error.message || 'خطأ في الاتصال بالخادم');
  }
};