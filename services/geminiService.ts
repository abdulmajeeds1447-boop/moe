export const analyzeTeacherReport = async (driveLink: string) => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: driveLink }),
    });

    const contentType = response.headers.get("content-type");
    
    // إذا كانت الاستجابة ليست JSON، فهذا يعني أن Vercel أرجع صفحة خطأ HTML (غالباً Timeout)
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error('تجاوز المجلد الوقت المسموح للتحليل. يرجى التأكد من أن المجلد يحتوي على ملفات قليلة وواضحة (PDF/صور).');
    }

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'فشل التحليل الذكي');
    }

    // تنظيف وتجهيز الدرجات للتأكد من أنها أرقام
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
    console.error("Gemini Service Error:", error);
    throw new Error(error.message || 'حدث خطأ غير متوقع أثناء الاتصال بالخادم');
  }
};