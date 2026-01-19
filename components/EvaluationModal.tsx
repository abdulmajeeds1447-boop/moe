
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
      } else {
        setRecommendations('');
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

  return (
    <>
      {/* واجهة العرض التفاعلية - لا تظهر في الطباعة */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm overflow-y-auto no-print">
        <div className="bg-white w-full max-w-6xl rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
          <div className="p-6 flex justify-between items-center bg-[#0d333f] text-white shrink-0">
            <h2 className="text-xl font-black">تحليل وتقييم الأداء الوظيفي</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 bg-[#f8fafc]">
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="bg-white p-6 rounded-3xl border border-slate-200">
                  <h3 className="font-black text-slate-800 mb-4">المعايير والدرجات</h3>
                  <div className="space-y-2">
                    {EVALUATION_CRITERIA.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                        <span className="text-sm font-bold text-slate-700">{c.label}</span>
                        <select 
                          value={scores[c.id]} 
                          onChange={(e) => setScores(p => ({ ...p, [c.id]: parseInt(e.target.value) }))}
                          className="bg-white border rounded-lg px-3 py-1 font-black text-[#009688]"
                        >
                          {[5,4,3,2,1].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <button onClick={runAIAndAutoFill} disabled={isAnalyzing} className="w-full py-4 bg-[#009688] text-white rounded-2xl font-black shadow-lg">
                   {isAnalyzing ? 'جاري التحليل...' : 'تفعيل التحليل الذكي للشواهد'}
                </button>
                <textarea 
                  placeholder="خلاصة التحليل" 
                  value={aiAnalysis} 
                  onChange={e => setAiAnalysis(e.target.value)} 
                  className="w-full h-32 p-4 rounded-2xl border text-sm"
                />
                <textarea 
                  placeholder="التوصيات" 
                  value={recommendations} 
                  onChange={e => setRecommendations(e.target.value)} 
                  className="w-full h-24 p-4 rounded-2xl border text-sm bg-amber-50"
                />
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={saveEvaluation} className="py-4 bg-[#0d333f] text-white rounded-2xl font-black">حفظ التقييم</button>
                  <button onClick={() => window.print()} className="py-4 bg-slate-200 text-[#0d333f] rounded-2xl font-black">طباعة التقرير</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* نموذج الطباعة - يظهر فقط في الطباعة ويحل مشكلة الورقة البيضاء */}
      <div className="printable-report hidden print:block bg-white text-black" dir="rtl">
        <div className="report-page mx-auto flex flex-col h-[297mm] w-[210mm] bg-white p-0">
          
          {/* هيدر مضغوط جداً */}
          <div className="bg-[#0d333f] text-white py-3 px-8 flex justify-between items-center">
            <div className="text-[9px] font-bold space-y-0.5">
              <p>المملكة العربية السعودية</p>
              <p>وزارة التعليم - تعليم جدة</p>
              <p className="text-sm font-black pt-0.5">ثانوية الأمير عبدالمجيد الأولى</p>
            </div>
            <img src="https://up6.cc/2026/01/176840436497671.png" className="h-12 object-contain brightness-0 invert" alt="Logo" />
          </div>

          <div className="px-10 py-4 flex-1 flex flex-col overflow-hidden">
            {/* عنوان البطاقة */}
            <div className="text-center mb-4">
              <h1 className="inline-block text-base font-black text-[#0d333f] px-6 py-1 border-2 border-[#009688] rounded-lg">
                بطاقة تقييم الأداء الوظيفي الرقمي
              </h1>
            </div>

            {/* بيانات المعلم مرفوعة */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[8px] font-black text-[#009688] block mb-0.5">اسم المعلم:</span>
                <p className="text-sm font-black text-slate-800 leading-none">{submission.teacher?.full_name}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center">
                <div>
                   <span className="text-[8px] font-black text-[#009688] block mb-0.5">الدرجة النهائية المستحقة:</span>
                   <p className="text-xl font-black text-[#0d333f] leading-none">{calculateTotal()} / 100</p>
                </div>
                <div className="px-3 py-0.5 bg-white rounded border border-[#009688] text-[8px] font-black text-[#009688]">
                  {getGrade(calculateTotal())}
                </div>
              </div>
            </div>

            {/* جدول المعايير مضغوط */}
            <div className="mb-4 border border-[#0d333f] rounded-lg overflow-hidden">
              <table className="w-full text-[9px]">
                <thead>
                  <tr className="bg-[#0d333f] text-white">
                    <th className="py-1 px-3 text-right border-l border-white/10 w-8">م</th>
                    <th className="py-1 px-3 text-right border-l border-white/10">المعيار الوظيفي المعتمد</th>
                    <th className="py-1 px-3 text-center w-16">الدرجة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {EVALUATION_CRITERIA.map((c, idx) => (
                    <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                      <td className="py-0.5 px-3 font-bold text-slate-400 border-l border-slate-100">{idx + 1}</td>
                      <td className="py-0.5 px-3 font-bold text-slate-700 border-l border-slate-100">{c.label}</td>
                      <td className="py-0.5 px-3 text-center font-black text-[#009688] text-sm">{scores[c.id]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* منطقة التوصيات مضغوطة */}
            <div className="mb-4 flex-grow-0">
              <div className="bg-amber-50/20 p-3 rounded-lg border border-amber-100 relative">
                <span className="absolute -top-1.5 right-4 px-2 bg-amber-100 text-amber-800 text-[8px] font-black rounded-full">توصيات التطوير المهني</span>
                <div className="text-[10px] leading-relaxed text-slate-700 font-medium whitespace-pre-wrap mt-1">
                  {recommendations || "لا توجد توصيات إضافية."}
                </div>
              </div>
            </div>

            {/* التوقيعات مرفوعة جداً */}
            <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-end pb-12">
              <div className="text-right space-y-1">
                <p className="text-[7px] text-slate-400 font-bold">معرف رقمي: {submission.id.substring(0,8).toUpperCase()}</p>
                <div className="pt-4">
                   <p className="text-[9px] font-black text-slate-500 mb-4">توقيع المعلم المقيم:</p>
                   <p className="text-xs font-black border-b-2 border-slate-200 pb-1 w-40">{submission.teacher?.full_name}</p>
                </div>
              </div>

              <div className="text-center">
                 <p className="text-[10px] font-black text-[#0d333f] mb-8">يعتمد مدير المدرسة</p>
                 <p className="text-lg font-black text-[#0d333f] leading-none mb-1">نايف أحمد الشهري</p>
                 <div className="w-40 h-0.5 bg-gradient-to-r from-transparent via-[#009688] to-transparent rounded-full opacity-30"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4;
            margin: 0 !important;
          }
          /* إخفاء كل شيء في الموقع تماماً */
          body * {
            visibility: hidden !important;
          }
          /* استثناء التقرير فقط وإظهاره */
          .printable-report, .printable-report * {
            visibility: visible !important;
          }
          .printable-report {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: white !important;
            z-index: 9999999 !important;
            display: block !important;
          }
          .report-page {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          /* تحسين جودة الألوان والخطوط عند الطباعة */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}} />
    </>
  );
};

export default EvaluationModal;
