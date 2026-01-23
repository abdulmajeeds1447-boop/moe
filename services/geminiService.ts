
export const analyzeTeacherReport = async (driveLink: string) => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: driveLink }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'فشل التحليل');
    }

    const result = await response.json();
    
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
