
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
        throw new Error('عذراً، تم الوصول للحد الأقصى لطلبات التحليل المجانية المتاحة حالياً. يرجى الانتظار دقيقة واحدة ثم المحاولة مرة أخرى.');
      }
      const errorMessage = result.details ? `${result.error}: ${result.details}` : (result.error || 'فشل التحليل');
      throw new Error(errorMessage);
    }
    
    if (result.suggested_scores) {
      const fixedScores: Record<number, number> = {};
      for (let i = 1; i <= 11; i++) {
        const rawValue = result.suggested_scores[i.toString()] || result.suggested_scores[i];
        fixedScores[i] = Number(rawValue !== undefined ? rawValue : 0);
      }
      result.suggested_scores = fixedScores;
    }
    
    return result;
  } catch (error: any) {
    console.error("AI Analysis Client Error:", error);
    throw error;
  }
};
