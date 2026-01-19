
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

  const total = calculateTotal();
  const grade = getGrade(total);

  return (
    <>
      {/* واجهة التفاعل - تختفي تماماً عند الطباعة */}
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
                <textarea placeholder="خلاصة التحليل" value={aiAnalysis} onChange={e => setAiAnalysis(e.target.value)} className="w-full h-32 p-4 rounded-2xl border text-sm" />
                <textarea placeholder="التوصيات" value={recommendations} onChange={e => setRecommendations(e.target.value)} className="w-full h-24 p-4 rounded-2xl border text-sm bg-amber-50" />
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={saveEvaluation} className="py-4 bg-[#0d333f] text-white rounded-2xl font-black">حفظ التقييم</button>
                  <button onClick={() => window.print()} className="py-4 bg-slate-200 text-[#0d333f] rounded-2xl font-black">طباعة التقرير</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* التقرير المخصص للطباعة فقط - تم حله باحترافية */}
      <div id="final-print-report" className="hidden print:block bg-white text-black" dir="rtl">
        <div className="a4-page mx-auto bg-white flex flex-col" style={{ width: '210mm', height: '297mm', padding: '0' }}>
          
          {/* ترويسة مصغرة */}
          <div className="bg-[#0d333f] text-white p-4 flex justify-between items-center w-full">
            <div className="text-[9px] font-bold leading-tight">
              <p>المملكة العربية السعودية</p>
              <p>وزارة التعليم</p>
              <p>الإدارة العامة للتعليم بجدة</p>
              <p className="text-sm font-black mt-1 text-teal-400">ثانوية الأمير عبدالمجيد الأولى</p>
            </div>
            <img src="https://up6.cc/2026/01/176840436497671.png" className="h-14 object-contain brightness-0 invert" alt="Logo" />
          </div>

          <div className="px-10 py-4 flex flex-col flex-1">
            <div className="text-center mb-4">
              <h1 className="inline-block px-8 py-1.5 border-2 border-[#009688] rounded-xl text-base font-black text-[#0d333f]">
                بطاقة تقييم الأداء الوظيفي الرقمي
              </h1>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[8px] font-black text-slate-400 block mb-1">اسم المعلم:</span>
                <p className="text-sm font-black text-slate-800">{submission.teacher?.full_name}</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
                <div>
                   <span className="text-[8px] font-black text-slate-400 block mb-1">الدرجة النهائية:</span>
                   <p className="text-xl font-black text-[#0d333f]">{total} / 100</p>
                </div>
                <div className="px-3 py-1 bg-white border border-[#009688] rounded-lg text-[10px] font-black text-[#009688]">
                  {grade}
                </div>
              </div>
            </div>

            <div className="mb-4 border border-[#0d333f] rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-[9px]">
                <thead className="bg-[#0d333f] text-white">
                  <tr>
                    <th className="py-1 px-3 text-right border-l border-white/10 w-8">م</th>
                    <th className="py-1 px-3 text-right border-l border-white/10">معيار التقييم</th>
                    <th className="py-1 px-3 text-center w-16">الدرجة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {EVALUATION_CRITERIA.map((c, idx) => (
                    <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="py-0.5 px-3 font-bold text-slate-400 border-l border-slate-100">{idx + 1}</td>
                      <td className="py-0.5 px-3 font-bold text-slate-700 border-l border-slate-100">{c.label}</td>
                      <td className="py-0.5 px-3 text-center font-black text-[#009688] text-base">{scores[c.id]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* منطقة التوصيات المظهورة بوضوح */}
            <div className="mb-6">
              <div className="bg-amber-50/30 p-4 rounded-xl border border-amber-100 relative">
                <span className="absolute -top-2 right-4 px-3 bg-amber-100 text-amber-900 text-[9px] font-black rounded-full">توصيات التطوير المهني المعتمدة</span>
                <div className="text-[10px] leading-relaxed text-slate-700 font-medium whitespace-pre-wrap mt-1">
                  {recommendations || "لا توجد توصيات إضافية لهذا التقييم."}
                </div>
              </div>
            </div>

            {/* الأسماء والتواقيع مرفوعة */}
            <div className="mt-auto border-t border-slate-100 pt-4 flex justify-between items-end pb-8">
              <div className="text-right">
                <p className="text-[7px] text-slate-300 font-bold mb-4">معرف التقرير: {submission.id.substring(0,8).toUpperCase()}</p>
                <p className="text-[9px] font-black text-slate-500 mb-6">توقيع المعلم المقيم:</p>
                <div className="w-48 border-b-2 border-slate-200 pb-1">
                   <p className="text-xs font-black text-slate-800">{submission.teacher?.full_name}</p>
                </div>
              </div>

              <div className="text-center flex flex-col items-center">
                 <p className="text-[10px] font-black text-[#0d333f] mb-8">يعتمد مدير المدرسة</p>
                 <p className="text-lg font-black text-[#0d333f] leading-none mb-1">نايف أحمد الشهري</p>
                 <div className="w-40 h-1 bg-[#009688] opacity-20 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media screen {
          #final-print-report { display: none !important; }
        }
        @media print {
          @page {
            size: A4;
            margin: 0mm !important;
          }
          /* إخفاء شامل لكل شيء عدا التقرير */
          body * { visibility: hidden !important; }
          #final-print-report, #final-print-report * {
            visibility: visible !important;
          }
          #final-print-report {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            z-index: 999999 !important;
          }
          .a4-page {
            box-shadow: none !important;
            border: none !important;
            overflow: hidden !important;
            page-break-after: avoid !important;
            page-break-before: avoid !important;
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}} />
    </>
  );
};

export default EvaluationModal;
