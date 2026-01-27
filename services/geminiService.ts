export const analyzeTeacherReport = async (driveLink: string) => {
  try {
    // هذه الخدمة الآن تقوم بعملية المسح ثم التحليل لتكون متوافقة مع الـ API الجديد
    const scanRes = await fetch('/api/drive/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: driveLink }),
    });

    const scanData = await scanRes.json();
    if (!scanRes.ok) throw new Error(scanData.error || 'فشل مسح المجلد');

    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        mode: 'bulk_analysis', 
        files: scanData.files || [] 
      }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'فشل التحليل الذكي');

    return result;
  } catch (error: any) {
    console.error("Gemini Service Error:", error);
    throw new Error(error.message || 'خطأ في الاتصال بخدمة الذكاء الاصطناعي');
  }
};
