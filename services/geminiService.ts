export const analyzeTeacherReport = async (driveLink: string) => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: driveLink }),
    });

    const result = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('عذراً، تم الوصول للحد الأقصى لطلبات التحليل المجانية. انتظر دقيقة.');
      }
      throw new Error(result.error || 'فشل التحليل');
    }
    
    // --- (تحديث) الحارس الذكي حسب الوزن ---
    if (result.suggested_scores) {
      const fixedScores: Record<number, number> = {};
      
      // تعريف الأوزان القصوى لكل معيار يدوياً لضمان الأمان
      const maxWeights: Record<number, number> = {
        1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 
        8: 5, 9: 5, // المعيارين 8 و 9 من 5
        10: 10, 11: 10
      };

      for (let i = 1; i <= 11; i++) {
        let rawScore = Number(result.suggested_scores[i.toString()] || result.suggested_scores[i] || 0);
        const maxLimit = maxWeights[i] || 10; // الافتراضي 10

        // الحماية: لا تتجاوز الحد الأقصى للمعيار
        if (rawScore > maxLimit) rawScore = maxLimit;
        if (rawScore < 0) rawScore = 0;

        fixedScores[i] = rawScore;
      }
      result.suggested_scores = fixedScores;
    }
    // ------------------------------------
    
    return result;
  } catch (error: any) {
    console.error("AI Error:", error);
    throw error;
  }
};
