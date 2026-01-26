
export const analyzeTeacherReport = async (driveLink: string, onRetry?: (attempt: number) => void) => {
  const maxRetries = 3; 
  let initialDelay = 5000; // تأخير مبدئي 5 ثوانٍ

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: driveLink }),
      });

      const result = await response.json();

      if (response.ok) {
        // معالجة وتوحيد صيغة الدرجات الواردة من الذكاء الاصطناعي
        if (result.suggested_scores) {
          const fixedScores: Record<number, number> = {};
          for (let j = 1; j <= 11; j++) {
            // التحقق من وجود القيمة سواء كانت نصية أو رقمية
            const rawValue = result.suggested_scores[j.toString()] || result.suggested_scores[j];
            fixedScores[j] = Number(rawValue !== undefined ? rawValue : 0);
          }
          result.suggested_scores = fixedScores;
        }
        return result;
      }

      // معالجة خطأ تجاوز الحد (429)
      if (response.status === 429) {
        if (i < maxRetries - 1) {
          const waitTime = initialDelay * (i + 1); // تأخير تصاعدي
          if (onRetry) onRetry(i + 1);
          console.warn(`Rate limit hit, automatic retry ${i + 1}/${maxRetries} after ${waitTime}ms`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // محاولة مرة أخرى
        }
        // في حال فشل كل المحاولات، نظهر الرسالة المطلوبة
        throw new Error('عذراً، تم الوصول للحد الأقصى لطلبات التحليل المجانية المتاحة حالياً. يرجى الانتظار دقيقة واحدة ثم المحاولة مرة أخرى.');
      }

      // معالجة الأخطاء الأخرى
      const errorMessage = result.details ? `${result.error}: ${result.details}` : (result.error || 'فشل التحليل');
      throw new Error(errorMessage);

    } catch (error: any) {
      // إذا كان الخطأ ليس 429، أو انتهت المحاولات، ارمِ الخطأ فوراً
      if (i === maxRetries - 1) throw error;
      if (!error.message.includes('الحد الأقصى') && !error.message.includes('429')) throw error;
    }
  }
};
