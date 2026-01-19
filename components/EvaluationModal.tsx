
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
      {/* واجهة العرض داخل المتصفح (لا تظهر عند الطباعة) */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md overflow-y-auto no-print">
        <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="p-8 flex justify-between items-center bg-[#0d333f] text-white shrink-0">
            <div className="flex items-center gap-5">
              <img src="https://up6.cc/2026/01/176840436497671.png" className="h-10 object-contain" alt="Logo" />
              <div>
                <h2 className="text-xl font-black">تحليل أداء المعلم الذكي</h2>
                <p className="text-[#009688] text-xs font-bold">بإشراف المدير: نايف الشهري</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-10 bg-[#f8fafc]">
            <div className="grid lg:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                    <span className="w-1.5 h-5 bg-[#009688] rounded-full"></span>
                    رصد المعايير الوظيفية
                  </h3>
                  <div className="space-y-3">
                    {EVALUATION_CRITERIA.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-[#009688]/5 transition-all group">
                        <span className="text-sm font-bold text-slate-700 group-hover:text-[#009688] transition-colors">{c.label}</span>
                        <select 
                          value={scores[c.id]} 
                          onChange={(e) => setScores(p => ({ ...p, [c.id]: parseInt(e.target.value) }))}
                          className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2 font-black text-[#009688] outline-none focus:border-[#009688] transition-all"
                        >
                          {[5,4,3,2,1].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-[#009688] p-8 rounded-[2.5rem] text-white flex justify-between items-center shadow-lg shadow-[#009688]/20 border border-white/10">
                   <div>
                      <p className="text-xs opacity-60 mb-1 font-bold">المجموع النهائي المستحق</p>
                      <h4 className="text-6xl font-black">{calculateTotal()} <span className="text-sm opacity-30">/ 100</span></h4>
                   </div>
                   <div className="text-center">
                      <p className="text-[10px] font-black opacity-60 mb-2 uppercase tracking-widest">التقدير العام</p>
                      <span className="text-2xl font-black bg-white/10 px-8 py-4 rounded-3xl border border-white/20 inline-block">{getGrade(calculateTotal())}</span>
                   </div>
                </div>
              </div>

              <div className="space-y-6">
                <button onClick={runAIAndAutoFill} disabled={isAnalyzing} className="w-full py-6 bg-gradient-to-r from-[#009688] to-[#00737a] text-white rounded-[2rem] text-lg font-black shadow-xl hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3">
                   {isAnalyzing ? (
                     <><div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full"></div> جاري الفحص والتحليل...</>
                   ) : (
                     <><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> تفعيل التحليل الذكي للشواهد</>
                   )}
                </button>
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200">
                  <label className="block text-[10px] font-black text-slate-400 mb-3 uppercase tracking-tighter flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    خلاصة التحليل والبيانات المعتمدة
                  </label>
                  <textarea value={aiAnalysis} onChange={e => setAiAnalysis(e.target.value)} className="w-full h-40 bg-[#f8fafc] p-5 rounded-2xl text-sm border-2 border-transparent focus:border-slate-100 outline-none resize-none font-medium text-slate-700 transition-all" />
                </div>
                <div className="bg-amber-50 p-6 rounded-[2.5rem] border border-amber-100">
                  <label className="block text-[10px] font-black text-amber-600 mb-3 uppercase tracking-tighter flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    التوصيات التطويرية الموجهة
                  </label>
                  <textarea value={recommendations} onChange={e => setRecommendations(e.target.value)} className="w-full h-24 bg-white/50 p-5 rounded-2xl text-sm border-2 border-transparent focus:border-amber-200 outline-none resize-none font-medium text-amber-900 transition-all" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <button onClick={saveEvaluation} className="py-5 bg-[#0d333f] text-white rounded-3xl font-black shadow-xl hover:brightness-125 transition-all">حفظ السجل</button>
                   <button onClick={() => window.print()} className="py-5 bg-slate-200 text-[#0d333f] rounded-3xl font-black flex items-center justify-center gap-2 hover:bg-slate-300 transition-all">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                      طباعة
                   </button>
                </div>
                <button onClick={shareOnWhatsapp} className="w-full py-5 bg-[#25D366] text-white rounded-3xl font-black shadow-lg shadow-green-500/20 hover:brightness-110 flex items-center justify-center gap-3 transition-all">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  إرسال التقرير عبر الواتساب
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* نموذج الطباعة الرسمي المطور (صفحة واحدة A4 ثابتة) */}
      <div className="hidden print:block fixed inset-0 bg-white text-black z-[100] p-0" dir="rtl">
        <div className="print-page-container mx-auto bg-white relative overflow-hidden flex flex-col h-full border-0">
          
          {/* الترويسة مضغوطة */}
          <div className="bg-[#0d333f] text-white py-5 px-10 flex justify-between items-center shrink-0">
            <div className="space-y-0.5 text-[10px] font-bold">
              <p>المملكة العربية السعودية</p>
              <p>وزارة التعليم</p>
              <p>الإدارة العامة للتعليم بجدة</p>
              <p className="text-lg font-black pt-0.5">ثانوية الأمير عبدالمجيد الأولى</p>
            </div>
            <img src="https://up6.cc/2026/01/176840436497671.png" className="h-16 object-contain brightness-0 invert" alt="Logo" />
          </div>

          <div className="px-10 py-5 flex-1 flex flex-col overflow-hidden">
            {/* عنوان البطاقة */}
            <div className="text-center mb-5">
              <h1 className="inline-block text-lg font-black text-[#0d333f] px-8 py-2 border-2 border-[#009688] rounded-xl bg-teal-50/10">
                بطاقة تقييم الأداء الوظيفي الرقمي
              </h1>
            </div>

            {/* بيانات المعلم */}
            <div className="grid grid-cols-2 gap-4 mb-4 shrink-0">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[9px] font-black text-[#009688] block mb-0.5">اسم المعلم:</span>
                <p className="text-base font-black text-slate-800 leading-none">{submission.teacher?.full_name}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                <div>
                   <span className="text-[9px] font-black text-[#009688] block mb-0.5">الدرجة النهائية المستحقة:</span>
                   <p className="text-2xl font-black text-[#0d333f] leading-none">{calculateTotal()} / 100</p>
                </div>
                <div className="px-3 py-1 bg-white rounded-lg border border-[#009688] text-[9px] font-black text-[#009688]">
                  {getGrade(calculateTotal())}
                </div>
              </div>
            </div>

            {/* جدول المعايير */}
            <div className="mb-4 border border-[#0d333f] rounded-xl overflow-hidden shrink-0 shadow-sm">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-[#0d333f] text-white">
                    <th className="py-1.5 px-3 text-right">م</th>
                    <th className="py-1.5 px-3 text-right">معيار التقييم</th>
                    <th className="py-1.5 px-3 text-center">الدرجة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {EVALUATION_CRITERIA.map((c, idx) => (
                    <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="py-1 px-3 font-bold text-slate-400 border-l border-slate-100">{idx + 1}</td>
                      <td className="py-1 px-3 font-bold text-slate-700 border-l border-slate-100">{c.label}</td>
                      <td className="py-1 px-3 text-center font-black text-[#009688] text-sm">{scores[c.id]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* التوصيات */}
            <div className="mb-4 flex-1 min-h-0 overflow-hidden">
              <div className="bg-amber-50/30 p-4 rounded-xl border border-amber-100 relative h-full">
                <div className="absolute -top-2 right-4 px-3 bg-amber-100 text-amber-800 text-[8px] font-black rounded-full">توصيات التطوير المهني المعتمدة</div>
                <div className="text-[10px] leading-relaxed text-slate-700 font-medium whitespace-pre-wrap h-full overflow-hidden">
                  {recommendations || "لا توجد توصيات إضافية لهذا التقييم."}
                </div>
              </div>
            </div>

            {/* التوقيعات */}
            <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-end px-4 shrink-0">
              <div className="text-right space-y-1">
                <p className="text-[8px] text-slate-400 font-bold tracking-tighter">معرف التقرير الرقمي: {submission.id.substring(0,8).toUpperCase()}</p>
                <p className="text-[8px] text-slate-400 font-bold">تاريخ الاعتماد الرسمي: {new Date().toLocaleDateString('ar-SA')}</p>
                <div className="pt-4">
                   <p className="text-[9px] font-black text-slate-500 mb-4">توقيع المعلم المقيم:</p>
                   <p className="text-xs font-black border-b border-slate-200 pb-1 w-40">{submission.teacher?.full_name}</p>
                </div>
              </div>

              <div className="text-center flex flex-col items-center">
                 <p className="text-[10px] font-black text-[#0d333f] mb-6">يعتمد مدير المدرسة</p>
                 <p className="text-lg font-black text-[#0d333f] mb-1">نايف أحمد الشهري</p>
                 <div className="w-40 h-0.5 bg-gradient-to-r from-transparent via-[#009688] to-transparent rounded-full opacity-20"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4;
            margin: 0mm !important;
          }
          html, body {
            height: 100%;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }
          .no-print { display: none !important; }
          .print-page-container {
            width: 210mm !important;
            height: 297mm !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          tr, div, p { page-break-inside: avoid; }
        }
      `}} />
    </>
  );
};

export default EvaluationModal;
