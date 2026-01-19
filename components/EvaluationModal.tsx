
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
      // محاولة استخراج التوصيات إذا كانت مخزنة ضمن التحليل
      if (data.ai_analysis && data.ai_analysis.includes('التوصيات:')) {
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
      const fullAnalysisText = aiAnalysis + (recommendations ? "\n\nالتوصيات:\n" + recommendations : "");
      await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: fullAnalysisText,
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
      {/* واجهة العرض داخل النظام */}
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

      {/* نموذج الطباعة الرسمي المطور (ورقة واحدة أنيقة) */}
      <div className="hidden print:block fixed inset-0 bg-white text-black z-[100] p-0" dir="rtl">
        <div className="w-[210mm] h-[297mm] mx-auto bg-white border-[1px] border-slate-100 relative overflow-hidden flex flex-col">
          
          {/* خلفية جمالية خفيفة للطباعة */}
          <div className="absolute top-0 right-0 w-full h-full opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>

          {/* الترويسة الرسمية */}
          <div className="bg-[#0d333f] text-white p-10 flex justify-between items-center">
            <div className="space-y-1 text-sm font-bold">
              <p>المملكة العربية السعودية</p>
              <p>وزارة التعليم</p>
              <p>الإدارة العامة للتعليم بجدة</p>
              <p className="text-xl font-black pt-1">ثانوية الأمير عبدالمجيد الأولى</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <img src="https://up6.cc/2026/01/176840436497671.png" className="h-24 object-contain brightness-0 invert" alt="Logo" />
            </div>
          </div>

          <div className="p-10 flex-1 flex flex-col">
            {/* عنوان البطاقة */}
            <div className="text-center mb-10">
              <div className="inline-block relative">
                <h1 className="text-3xl font-black text-[#0d333f] mb-2 px-10 py-4 border-2 border-[#009688] rounded-2xl bg-teal-50/30">
                  بطاقة تقييم الأداء الوظيفي الرقمي
                </h1>
              </div>
            </div>

            {/* بيانات المعلم الأساسية */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-black text-[#009688] block mb-1">اسم المعلم:</span>
                <p className="text-xl font-black text-slate-800">{submission.teacher?.full_name}</p>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                <div>
                   <span className="text-[10px] font-black text-[#009688] block mb-1">الدرجة النهائية:</span>
                   <p className="text-3xl font-black text-[#0d333f]">{calculateTotal()} / 100</p>
                </div>
                <div className="px-4 py-2 bg-white rounded-xl border-2 border-[#009688] text-xs font-black text-[#009688]">
                  {getGrade(calculateTotal())}
                </div>
              </div>
            </div>

            {/* جدول المعايير والدرجات - مكثف ليناسب صفحة واحدة */}
            <div className="mb-8 border-2 border-[#0d333f] rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0d333f] text-white">
                    <th className="p-3 text-right border-l border-white/10">م</th>
                    <th className="p-3 text-right border-l border-white/10">معيار التقييم</th>
                    <th className="p-3 text-center">الدرجة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {EVALUATION_CRITERIA.map((c, idx) => (
                    <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-2.5 text-right font-bold text-slate-400 border-l border-slate-100">{idx + 1}</td>
                      <td className="p-2.5 text-right font-bold text-slate-700 border-l border-slate-100">{c.label}</td>
                      <td className="p-2.5 text-center font-black text-[#009688] text-lg">{scores[c.id]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* قسم التوصيات - مهم جداً */}
            <div className="mb-8 flex-1">
              <div className="bg-amber-50/50 p-6 rounded-3xl border-2 border-amber-200/50 relative">
                <div className="absolute -top-3 right-6 px-4 bg-amber-200 text-amber-800 text-[10px] font-black rounded-full">توصيات التطوير المهني</div>
                <div className="text-sm leading-relaxed text-slate-700 font-medium whitespace-pre-wrap">
                  {recommendations || "لا توجد توصيات إضافية لهذا التقييم."}
                </div>
              </div>
            </div>

            {/* قسم التوقيعات والاعتماد */}
            <div className="mt-auto pt-10 border-t-2 border-slate-100 flex justify-between items-end px-4">
              <div className="text-right space-y-2">
                <p className="text-[10px] text-slate-400 font-bold">معرف التقرير: <span className="font-mono">{submission.id.substring(0,8)}</span></p>
                <p className="text-[10px] text-slate-400 font-bold">تاريخ الاعتماد: {new Date().toLocaleDateString('ar-SA')}</p>
                <div className="pt-6">
                   <p className="text-xs font-black text-slate-500 mb-6">توقيع المعلم المقيم:</p>
                   <p className="text-sm font-black border-b border-slate-200 pb-2 w-48">{submission.teacher?.full_name}</p>
                </div>
              </div>

              <div className="text-center flex flex-col items-center">
                 <p className="text-sm font-black text-[#0d333f] mb-8">يعتمد مدير المدرسة</p>
                 <div className="relative">
                    {/* هنا يمكن إضافة ختم المدرسة مستقبلاً */}
                    <p className="text-2xl font-black text-[#0d333f]">نايف أحمد الشهري</p>
                 </div>
                 <div className="mt-4 w-56 h-1 bg-gradient-to-r from-transparent via-[#009688] to-transparent rounded-full opacity-30"></div>
              </div>
            </div>
          </div>

          {/* الفوتر الملون */}
          <div className="h-4 w-full bg-gradient-to-r from-[#00a19b] via-[#00737a] to-[#00a19b]"></div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 0; }
          .print-block { display: block !important; }
        }
      `}} />
    </>
  );
};

export default EvaluationModal;
