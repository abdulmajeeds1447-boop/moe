
export const analyzeTeacherReport = async (driveLink: string, onRetry?: (attempt: number) => void) => {
  const maxRetries = 3;
  let delay = 2000; // البدء بـ 2 ثانية

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: driveLink }),
      });

      const result = await response.json();

      if (response.ok) {
        if (result.suggested_scores) {
          const fixedScores: Record<number, number> = {};
          for (let j = 1; j <= 11; j++) {
            const rawValue = result.suggested_scores[j.toString()] || result.suggested_scores[j];
            fixedScores[j] = Number(rawValue !== undefined ? rawValue : 0);
          }
          result.suggested_scores = fixedScores;
        }
        return result;
      }

      // إذا كان الخطأ 503 (ضغط) أو 429 (عدد طلبات) نقوم بالمحاولة مرة أخرى
      if (response.status === 503 || response.status === 429) {
        if (i < maxRetries - 1) {
          if (onRetry) onRetry(i + 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // مضاعفة وقت الانتظار في كل محاولة
          continue;
        }
        throw new Error(response.status === 503 ? 'خادم الذكاء الاصطناعي مشغول حالياً، يرجى المحاولة بعد قليل.' : 'تم تجاوز حد الطلبات، يرجى الانتظار دقيقة.');
      }

      const errorMessage = result.details ? `${result.error}: ${result.details}` : (result.error || 'فشل التحليل');
      throw new Error(errorMessage);

    } catch (error: any) {
      if (i === maxRetries - 1) throw error;
      if (onRetry) onRetry(i + 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
};
