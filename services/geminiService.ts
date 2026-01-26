export const analyzeTeacherReport = async (driveLink: string, onRetry?: (attempt: number) => void) => {
  const maxRetries = 3; 
  let initialDelay = 5000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: driveLink }),
      });

      // التحقق مما إذا كانت الاستجابة JSON فعلاً
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textError = await response.text();
        console.error("Server returned non-JSON response:", textError);
        throw new Error('حدث خطأ فني في السيرفر (تجاوز وقت المعالجة). يرجى محاولة تقليل عدد الملفات في المجلد وإعادة المحاولة.');
      }

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

      if (response.status === 429) {
        if (i < maxRetries - 1) {
          const waitTime = initialDelay * (i + 1);
          if (onRetry) onRetry(i + 1);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw new Error('عذراً، تم الوصول للحد الأقصى لطلبات التحليل المجانية. يرجى الانتظار دقيقة واحدة.');
      }

      throw new Error(result.error || 'فشل التحليل الذكي');

    } catch (error: any) {
      if (i === maxRetries - 1) throw error;
      // السماح بإعادة المحاولة في حالات أخطاء الشبكة أو الـ Timeout
      const isRetryable = error.message.includes('429') || error.message.includes('فني');
      if (!isRetryable) throw error;
      
      const waitTime = initialDelay * (i + 1);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};