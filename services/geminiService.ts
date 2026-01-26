export const analyzeTeacherReport = async (driveLink: string) => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: driveLink }),
    });

    const data = await response.json();

    if (!response.ok) {
      // إظهار التفاصيل القادمة من السيرفر (مثل تجاوز الحد)
      throw new Error(data.details || data.error || 'فشل التحليل');
    }

    // إصلاح هيكلية البيانات للتأكد من أنها أرقام
    if (data.suggested_scores) {
       const fixedScores: Record<number, number> = {};
       Object.keys(data.suggested_scores).forEach(key => {
         fixedScores[Number(key)] = Number(data.suggested_scores[key] || 0);
       });
       data.suggested_scores = fixedScores;
    }

    return data; 
  } catch (error: any) {
    console.error('Gemini Service Error:', error);
    throw new Error(error.message || 'حدث خطأ غير متوقع');
  }
};
