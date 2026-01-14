
import React, { useState, useEffect } from 'react';
import { Submission, EVALUATION_CRITERIA } from '../types';
import { analyzeTeacherReport } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

const EvaluationModal: React.FC<{ submission: Submission; onClose: () => void }> = ({ submission, onClose }) => {
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scores, setScores] = useState<Record<number, number>>({
    1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5, 9: 5, 10: 5, 11: 5
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadExistingEvaluation();
  }, [submission.id]);

  const loadExistingEvaluation = async () => {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*')
      .eq('submission_id', submission.id)
      .maybeSingle();

    if (!error && data) {
      setAiAnalysis(data.ai_analysis);
      if (data.scores) setScores(data.scores);
      if (data.ai_analysis.includes('التوصيات:')) {
        const parts = data.ai_analysis.split('التوصيات:');
        setRecommendations(parts[1].trim());
      }
    }
  };

  const runAIAndAutoFill = async () => {
    setIsAnalyzing(true);
    const data = await analyzeTeacherReport(submission.drive_link);
    if (data) {
      setAiAnalysis(data.summary + "\n\nالمبررات:\n" + data.reasons);
      setRecommendations(Array.isArray(data.recommendations) ? data.recommendations.join("\n") : data.recommendations);
      if (data.suggested_scores && Array.isArray(data.suggested_scores)) {
        const newScores: Record<number, number> = {};
        data.suggested_scores.forEach((score: number, index: number) => {
          if (index < 11) newScores[index + 1] = score;
        });
        setScores(newScores);
      }
    }
    setIsAnalyzing(false);
  };

  const calculateTotal = () => {
    let total = 0;
    EVALUATION_CRITERIA.forEach(c => {
      total += (scores[c.id] || 0) * (c.weight / 5);
    });
    return Math.round(total);
  };

  const getGrade = (total: number) => {
    if (total >= 90) return 'ممتاز';
    if (total >= 80) return 'جيد جداً';
    if (total >= 70) return 'جيد';
    return 'مرضي';
  };

  const saveEvaluation = async () => {
    setIsSaving(true);
    const total = calculateTotal();
    try {
      await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: aiAnalysis + (recommendations ? "\n\nالتوصيات:\n" + recommendations : ""),
        total_score: total,
        overall_grade: getGrade(total),
        scores: scores
      }, { onConflict: 'submission_id' });
      await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      alert('تم حفظ التقييم بنجاح');
      onClose();
    } catch (err: any) {
      alert('خطأ في الحفظ');
    } finally {
      setIsSaving(false);
    }
  };

  const shareOnWhatsapp = () => {
    const total = calculateTotal();
    const grade = getGrade(total);
    const recs = recommendations ? `\n\n*التوصيات:* \n- ${recommendations.replace(/\n/g, '\n- ')}` : "";
    const message = `*نتيجة تقييم الأداء الوظيفي الرقمي*\n*مدرسة الأمير عبدالمجيد الأولى*\n------------------\n*المعلم:* ${submission.teacher?.full_name}\n*الدرجة:* ${total}/100\n*التقدير:* ${grade}${recs}\n\n*مدير المدرسة:*\n*نايف أحمد الشهري*`;
    window.open(`https://wa.me/966${submission.teacher?.phone?.substring(1)}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md overflow-y-auto no-print">
        <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
          <div className="p-8 flex justify-between items-center bg-[#0d333f] text-white">
            <div className="flex items-center gap-5">
              <img src="https://up6.cc/2026/01/176840436497671.png" className="h-10 object-contain" alt="Logo" />
              <div>
                <h2 className="text-xl font-black">تحليل أداء المعلم الذكي</h2>
                <p className="text-[#009688] text-xs font-bold">بإشراف المدير: نايف الشهري</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-10 bg-[#f8fafc]">
            <div className="grid lg:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-black text-slate-800 mb-6">رصد المعايير</h3>
                  <div className="space-y-3">
                    {EVALUATION_CRITERIA.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-[#009688]/5 transition-all">
                        <span className="text-sm font-bold text-slate-700">{c.label}</span>
                        <select 
                          value={scores[c.id]} 
                          onChange={(e) => setScores(p => ({ ...p, [c.id]: parseInt(e.target.value) }))}
                          className="bg-white border rounded-xl px-4 py-2 font-black text-[#009688] outline-none"
                        >
                          {[5,4,3,2,1].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-[#009688] p-8 rounded-[2.5rem] text-white flex justify-between items-center shadow-lg shadow-[#009688]/20">
                   <div>
                      <p className="text-xs opacity-60 mb-1">المجموع النهائي</p>
                      <h4 className="text-6xl font-black">{calculateTotal()} <span className="text-sm opacity-30">/ 100</span></h4>
                   </div>
                   <span className="text-3xl font-black bg-white/10 px-8 py-4 rounded-3xl border border-white/20">{getGrade(calculateTotal())}</span>
                </div>
              </div>

              <div className="space-y-6">
                <button onClick={runAIAndAutoFill} disabled={isAnalyzing} className="w-full py-6 bg-[#009688] text-white rounded-[2rem] text-lg font-black shadow-xl hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50">
                   {isAnalyzing ? 'جاري الفحص والتحليل...' : 'تفعيل التحليل الذكي للشواهد'}
                </button>
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200">
                  <label className="block text-[10px] font-black text-slate-400 mb-3 uppercase tracking-tighter">خلاصة التحليل والبيانات المعتمدة</label>
                  <textarea value={aiAnalysis} onChange={e => setAiAnalysis(e.target.value)} className="w-full h-40 bg-[#f8fafc] p-5 rounded-2xl text-sm border-none outline-none resize-none font-medium text-slate-700" />
                </div>
                <div className="bg-amber-50 p-6 rounded-[2.5rem] border border-amber-100">
                  <label className="block text-[10px] font-black text-amber-600 mb-3 uppercase tracking-tighter">التوصيات التطويرية الموجهة</label>
                  <textarea value={recommendations} onChange={e => setRecommendations(e.target.value)} className="w-full h-24 bg-white/50 p-5 rounded-2xl text-sm border-none outline-none resize-none font-medium" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <button onClick={saveEvaluation} className="py-5 bg-[#0d333f] text-white rounded-3xl font-black shadow-xl hover:brightness-125">حفظ السجل</button>
                   <button onClick={() => window.print()} className="py-5 bg-slate-200 text-[#0d333f] rounded-3xl font-black flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                      طباعة
                   </button>
                </div>
                <button onClick={shareOnWhatsapp} className="w-full py-5 bg-[#25D366] text-white rounded-3xl font-black shadow-lg shadow-green-500/20 hover:brightness-110">إرسال عبر الواتساب</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* نسخة الطباعة المتوافقة مع الهوية الجديدة */}
      <div className="hidden print-only fixed inset-0 bg-white p-0 text-black z-[100] text-right font-['Tajawal']" dir="rtl">
          <div className="border-[12px] border-[#0d333f] m-0 p-0 min-h-screen flex flex-col relative overflow-hidden bg-white">
            <div className="bg-[#0d333f] text-white p-12 flex items-center justify-between">
                <div className="text-[14px] font-medium space-y-1">
                   <p>المملكة العربية السعودية</p>
                   <p>وزارة التعليم</p>
                   <p>تعليم محافظة جدة</p>
                   <p className="font-black text-2xl">ثانوية الأمير عبدالمجيد الأولى</p>
                </div>
                <img src="https://up6.cc/2026/01/176840436497671.png" className="h-28 object-contain" alt="Logo" />
            </div>
            <div className="px-16 py-12 flex-1">
               <div className="text-center mb-12">
                  <div className="inline-block border-2 border-[#009688] px-20 py-4 bg-[#f0f9fa] rounded-3xl">
                     <h1 className="text-3xl font-black text-[#0d333f]">بطاقة تقييم الأداء الوظيفي الرقمي</h1>
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-10 mb-10">
                  <div className="bg-slate-50 p-8 rounded-3xl border-2 border-slate-100">
                     <p className="font-black text-[#009688] mb-1">اسم المعلم:</p>
                     <p className="text-2xl font-black">{submission.teacher?.full_name}</p>
                  </div>
                  <div className="bg-slate-50 p-8 rounded-3xl border-2 border-slate-100">
                     <p className="font-black text-[#009688] mb-1">الدرجة النهائية المعتمدة:</p>
                     <p className="text-4xl font-black text-[#0d333f]">{calculateTotal()} / 100</p>
                  </div>
               </div>
               <table className="w-full border-collapse border-2 border-[#0d333f] mb-12 rounded-2xl overflow-hidden">
                  <thead>
                     <tr className="bg-[#0d333f] text-white">
                        <th className="p-4 text-right">معيار التقييم</th>
                        <th className="p-4 text-center">الدرجة</th>
                     </tr>
                  </thead>
                  <tbody>
                     {EVALUATION_CRITERIA.map(c => (
                       <tr key={c.id} className="border-b border-slate-100">
                          <td className="p-4 font-bold text-sm">{c.label}</td>
                          <td className="p-4 text-center text-xl font-black text-[#009688]">{scores[c.id]}</td>
                       </tr>
                     ))}
                  </tbody>
               </table>
               <div className="flex justify-between items-end mt-20">
                  <div className="text-right space-y-2 opacity-50">
                     <p className="text-xs">رقم التقرير الرقمي: {submission.id.substring(0,8)}</p>
                     <p className="text-xs">تاريخ الاعتماد: {new Date().toLocaleDateString('ar-SA')}</p>
                  </div>
                  <div className="text-center w-80">
                     <p className="font-black text-2xl mb-8">مدير المدرسة</p>
                     <p className="font-black text-3xl text-[#0d333f]">نايف أحمد الشهري</p>
                     <div className="h-1 w-full bg-[#009688] mt-4 rounded-full"></div>
                  </div>
               </div>
            </div>
            <div className="h-6 w-full bg-gradient-to-r from-[#00a19b] via-[#00737a] to-[#00a19b] mt-auto"></div>
          </div>
      </div>
    </>
  );
};

export default EvaluationModal;
