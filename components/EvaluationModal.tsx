'use client';

import React, { useState, useEffect } from 'react';
import { Submission, EVALUATION_CRITERIA } from '../types';
import { analyzeTeacherReport } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

interface EvaluationModalProps {
  submission: Submission;
  onClose: () => void;
  isViewOnly?: boolean; 
}

const EvaluationModal: React.FC<EvaluationModalProps> = ({ submission, onClose, isViewOnly = false }) => {
  const [justification, setJustification] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // الحالة الافتراضية للدرجات (كلها أصفار)
  const [scores, setScores] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
  });

  useEffect(() => { 
    loadExistingEvaluation(); 
  }, [submission.id]);

  const loadExistingEvaluation = async () => {
    const { data } = await supabase.from('evaluations').select('*').eq('submission_id', submission.id).maybeSingle();
    if (data) {
      setJustification(data.ai_analysis || '');
      if (data.scores) {
        const normalized: Record<number, number> = {};
        Object.entries(data.scores).forEach(([k, v]) => normalized[Number(k)] = Number(v));
        setScores(normalized);
      }
    }
  };

  // --- دالة الحساب الدقيقة ---
  const calculateTotal = () => {
    let total = 0;
    EVALUATION_CRITERIA.forEach(c => { 
      // الدرجة الخام (من 0 إلى 5)
      const rawScore = Number(scores[c.id] || 0);
      
      // المعادلة: (الدرجة / 5) * الوزن النسبي
      // مثال: (4/5) * 10 = 8 درجات مستحقة
      const weightedScore = (rawScore / 5) * c.weight;
      
      total += weightedScore;
    });
    // التقريب لأقرب عدد صحيح وضمان عدم تجاوز 100
    return Math.min(100, Math.round(total)); 
  };

  const getGradeInfo = (t: number) => {
    if (t >= 90) return { label: 'ممتاز', scale: '5' };
    if (t >= 80) return { label: 'جيد جداً', scale: '4' };
    if (t >= 70) return { label: 'جيد', scale: '3' };
    if (t >= 60) return { label: 'مرضي', scale: '2' };
    return { label: 'غير مرضي', scale: '1' };
  };

  const totalScore = calculateTotal();
  const gradeInfo = getGradeInfo(totalScore);

  const runAIAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setAnalysisStatus('جاري تحليل الشواهد بدقة تربوية صارمة...');
    
    try {
      const data = await analyzeTeacherReport(submission.drive_link);
      if (data) {
        setJustification(data.justification || '');
        if (data.suggested_scores) {
          const newScores = { ...scores };
          Object.entries(data.suggested_scores).forEach(([k, v]) => {
            const numKey = Number(k);
            if (numKey >= 1 && numKey <= 11) {
              newScores[numKey] = Number(v);
            }
          });
          setScores(newScores);
        }
      }
    } catch (err: any) {
      alert(`عذراً، فشل التحليل: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const saveEvaluation = async () => {
    if (isViewOnly) return;
    setIsSaving(true);
    try {
      const total = calculateTotal();
      const info = getGradeInfo(total);
      
      const { error } = await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: justification,
        scores: scores,
        total_score: total,
        overall_grade: info.label,
      }, { onConflict: 'submission_id' });
      
      if (error) throw error;
      await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      alert('✅ تم اعتماد تقييم الأداء بنجاح');
      onClose(); // إغلاق النافذة بعد الحفظ وتحديث البيانات
    } catch (err) { alert('خطأ في حفظ البيانات'); } finally { setIsSaving(false); }
  };

  const handlePrint = () => { window.print(); };

  const sendWhatsApp = () => {
    const teacherName = submission.teacher?.full_name || 'الزميل المعلم';
    // تنظيف النص من علامات Markdown عند الإرسال للواتساب ليكون مقروءاً
    const cleanJustification = (justification || 'تم رصد الدرجات بناءً على الشواهد.').replace(/\*\*/g, '').replace(/\*/g, '-');
    
    const message = `*تقرير تقييم الأداء الوظيفي الرقمي* 📄%0A%0A` +
      `*عزيزي المعلم:* ${teacherName}%0A%0A` +
      `*تحية طيبة، نتيجة الأداء الوظيفي:*%0A` +
      `*المادة:* ${submission.subject}%0A` +
      `*النتيجة النهائية:* ${totalScore}%%0A` +
      `*التقدير:* ${gradeInfo.label} (${gradeInfo.scale}/5)%0A%0A` +
      `*أبرز الملحوظات:*%0A${cleanJustification}%0A%0A` +
      `إدارة المدرسة: نايف أحمد الشهري`;
    
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-lg overflow-y-auto">
      
      {/* --- قسم الطباعة (A4) --- */}
      <div className="hidden print:flex flex-col w-[210mm] h-[297mm] bg-white p-[12mm] text-black font-['Tajawal'] overflow-hidden border relative">
        {/* الترويسة */}
        <div className="flex justify-between items-center border-b-2 border-moe-navy pb-3 mb-4 shrink-0">
          <div className="text-[9px] font-bold space-y-0.5">
            <p>المملكة العربية السعودية</p>
            <p>وزارة التعليم</p>
            <p>ثانوية الأمير عبدالمجيد الأولى</p>
          </div>
          <div className="text-center">
             <img src="https://up6.cc/2026/01/176840436497671.png" className="h-12 object-contain mb-1 mx-auto" alt="Logo" />
             <h2 className="text-[11px] font-black text-moe-navy">بطاقة تقييم الأداء الوظيفي الرقمي</h2>
          </div>
          <div className="text-[9px] font-bold text-left space-y-0.5">
            <p>التاريخ: {new Date().toLocaleDateString('ar-SA')}</p>
            <p>العام الدراسي: 1446هـ</p>
          </div>
        </div>

        {/* بيانات المعلم */}
        <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-lg mb-4 border border-slate-100 text-[9px] shrink-0">
          <p><strong>اسم المعلم/ة:</strong> {submission.teacher?.full_name}</p>
          <p><strong>المادة / التخصص:</strong> {submission.subject}</p>
          <p><strong>الدرجة النهائية:</strong> <span className="font-black">{totalScore}/100 ({gradeInfo.label})</span></p>
        </div>

        {/* جدول الدرجات المطبوع */}
        <div className="mb-4 shrink-0">
          <table className="w-full border-collapse border border-slate-400 text-[8.5px]">
            <thead>
              <tr className="bg-slate-100 font-black">
                <th className="border border-slate-400 p-1 text-right">المعيار الأساسي للتقييم</th>
                <th className="border border-slate-400 p-1 text-center w-14">الوزن</th>
                <th className="border border-slate-400 p-1 text-center w-20">الدرجة المستحقة</th>
              </tr>
            </thead>
            <tbody>
              {EVALUATION_CRITERIA.map(c => {
                const rawScore = Number(scores[c.id] || 0);
                const weightedScore = (rawScore / 5) * c.weight;
                return (
                  <tr key={c.id}>
                    <td className="border border-slate-400 p-0.5 px-1.5 font-bold">{c.label}</td>
                    <td className="border border-slate-400 p-0.5 text-center">{c.weight}</td>
                    {/* هنا نعرض الدرجة الموزونة (مثلاً 10) وليس الدرجة من 5 */}
                    <td className="border border-slate-400 p-0.5 text-center font-black">
                       {Number.isInteger(weightedScore) ? weightedScore : weightedScore.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-moe-navy text-white font-black">
                <td className="border border-moe-navy p-1.5 text-[10px]" colSpan={2}>النسبة المئوية النهائية للتقرير الرقمي</td>
                <td className="border border-moe-navy p-1.5 text-center text-[14px]">{totalScore}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* التبريرات */}
        <div className="flex-1 overflow-hidden">
          <div className="border-r-2 border-moe-teal pr-4 h-full">
            <h3 className="font-black text-[10px] text-moe-navy mb-1 underline">تحليل الخبير التربوي للملف الرقمي:</h3>
            <p className="text-[9px] leading-relaxed text-slate-700 italic text-justify whitespace-pre-wrap">
              {justification || 'تم رصد الدرجات بناءً على الشواهد والأدلة الرقمية المرفوعة...'}
            </p>
          </div>
        </div>

        {/* التواقيع */}
        <div className="mt-auto pt-6 flex justify-between items-end text-center shrink-0">
          <div className="w-48 border-t border-dotted border-black pt-2">
            <p className="font-black text-[9px] mb-8">توقيع المعلم</p>
            <p className="text-[8.5px]">{submission.teacher?.full_name}</p>
          </div>
          <div className="w-48 border-t border-dotted border-black pt-2">
            <p className="font-black text-[9px] mb-8">يعتمد مدير المدرسة</p>
            <p className="font-black text-[9px]">نايف أحمد الشهري</p>
            <p className="text-[6px] text-slate-400 mt-1">وثيقة رقمية معتمدة</p>
          </div>
        </div>
      </div>

      {/* --- واجهة المستخدم (Modal) --- */}
      <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden no-print">
        {/* رأس النافذة */}
        <div className="p-6 bg-moe-navy text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-moe-teal rounded-2xl flex items-center justify-center text-2xl shadow-lg">🤖</div>
            <div>
              <h2 className="text-xl font-black">نظام التحليل التربوي الذكي</h2>
              <p className="text-[10px] text-moe-teal font-bold tracking-widest">إشراف المدير: نايف أحمد الشهري</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-2xl transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50">
          <div className="grid lg:grid-cols-2 gap-12">
            
            {/* القائمة اليمنى: المعايير */}
            <div className="space-y-4">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">تقدير المعايير (0-5)</h3>
              <div className="grid gap-2">
                {EVALUATION_CRITERIA.map(c => (
                  <div key={c.id} className="p-3.5 bg-white rounded-xl border border-slate-100 flex justify-between items-center group hover:border-moe-teal transition-all shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-slate-700">{c.label}</span>
                      <span className="text-[9px] text-slate-400 font-bold">الوزن النسبي: {c.weight}%</span>
                    </div>
                    <select 
                      disabled={isViewOnly}
                      value={scores[c.id]} 
                      onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                      className="bg-slate-50 px-3 py-1 rounded-lg text-xs font-black text-moe-teal outline-none focus:ring-2 focus:ring-moe-teal/20"
                    >
                      {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* القائمة اليسرى: النتائج والأزرار */}
            <div className="space-y-8">
              {/* بطاقة النتيجة الكبيرة */}
              <div className="bg-gradient-to-br from-moe-navy to-moe-teal p-10 rounded-[2.5rem] text-white shadow-xl flex justify-between items-center relative overflow-hidden">
                <div className="relative z-10">
                  <p className="text-[10px] opacity-70 font-black mb-1">النتيجة النهائية</p>
                  <h4 className="text-7xl font-black">{totalScore}%</h4>
                </div>
                <div className="text-center z-10 bg-white/10 backdrop-blur-md px-8 py-5 rounded-[2rem] border border-white/20 min-w-[140px]">
                  <p className="text-[10px] opacity-70 font-black mb-1">التقدير العام</p>
                  <p className="text-2xl font-black">{gradeInfo.label}</p>
                </div>
              </div>

              {/* أزرار التحكم */}
              {isAnalyzing ? (
                <div className="bg-white p-8 rounded-[2rem] border-2 border-moe-teal text-center space-y-4 shadow-xl">
                  <div className="animate-spin text-3xl mx-auto">🌀</div>
                  <p className="text-sm font-black text-moe-teal">{analysisStatus}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <a 
  href={submission.drive_link} 
  target="_blank" 
  rel="noopener noreferrer"
  className="col-span-2 py-4 bg-blue-50 text-blue-600 border-2 border-blue-100 rounded-2xl font-black transition-all hover:bg-blue-100 hover:border-blue-200 active:scale-95 flex items-center justify-center gap-2"
>
  <span className="text-xl">📂</span>
  عرض مجلد الشواهد (Google Drive)
</a>
                  {!isViewOnly && (
                    <>
                      <button onClick={runAIAnalysis} className="col-span-2 py-5 bg-white border-2 border-moe-teal text-moe-teal rounded-2xl font-black hover:bg-moe-teal hover:text-white transition-all shadow-md active:scale-95">
                        ⚡ بدء تحليل الخبير التربوي (Gemini AI)
                      </button>
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-5 bg-moe-navy text-white rounded-2xl font-black shadow-lg hover:brightness-110 active:scale-95">
                        {isSaving ? 'جاري الحفظ...' : 'اعتماد وحفظ الدرجات'}
                      </button>
                    </>
                  )}
                  <button onClick={handlePrint} className={`py-5 bg-slate-100 text-moe-navy border-2 border-slate-200 rounded-2xl font-black transition-all hover:bg-white active:scale-95`}>
                    📄 طباعة التقرير
                  </button>
                  <button onClick={sendWhatsApp} className="py-5 bg-[#25D366] text-white rounded-2xl font-black shadow-lg hover:bg-[#20bd5a] transition-all flex items-center justify-center gap-2 active:scale-95">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    واتساب
                  </button>
                </div>
              )}

              {/* بطاقة التبريرات */}
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <h4 className="text-[11px] font-black text-slate-400 mb-4 uppercase">تبريرات التقييم (بناءً على الشواهد):</h4>
                <div className="w-full h-48 text-xs font-bold leading-relaxed bg-slate-50/50 p-4 rounded-xl overflow-y-auto whitespace-pre-wrap text-slate-700 border border-slate-100">
                  {justification || 'سيقوم الخبير التربوي بكتابة التبريرات هنا بعد التحليل...'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationModal;
