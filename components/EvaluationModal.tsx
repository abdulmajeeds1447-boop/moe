
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

  const getGradeDetails = (total: number) => {
    if (total >= 90) return { grade: 'ممتاز', score5: 5 };
    if (total >= 80) return { grade: 'جيد جداً', score5: 4 };
    if (total >= 70) return { grade: 'جيد', score5: 3 };
    if (total >= 60) return { grade: 'مرضي / يحتاج تطوير', score5: 2 };
    return { grade: 'غير مرضي', score5: 1 };
  };

  const saveEvaluation = async () => {
    setIsSaving(true);
    const total = calculateTotal();
    const { grade } = getGradeDetails(total);
    try {
      const fullAnalysisText = aiAnalysis + (recommendations ? "\n\nالتوصيات:\n" + recommendations : "");
      await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: fullAnalysisText,
        total_score: total,
        overall_grade: grade,
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
    const totalScore = calculateTotal();
    const { grade, score5 } = getGradeDetails(totalScore);
    const recommendationText = recommendations ? `\n\n*توصيات التطوير المهني:*\n${recommendations}` : '';
    
    const message = `*نتيجة تقييم الأداء الوظيفي الرقمي*\n*مدرسة الأمير عبدالمجيد الأولى*\n------------------\n*المعلم:* ${submission.teacher?.full_name}\n*النسبة:* ${totalScore}%\n*الدرجة:* (${score5} من 5)\n*التقدير:* ${grade}${recommendationText}\n\n*مدير المدرسة:*\n*نايف أحمد الشهري*`;
    
    window.open(`https://wa.me/966${submission.teacher?.phone?.substring(1)}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const shareDetailedAnalysis = () => {
    const totalScore = calculateTotal();
    const { grade, score5 } = getGradeDetails(totalScore);
    const recommendationText = recommendations ? `\n\n*التوصيات المعتمدة:*\n${recommendations}` : '';
    const analysisText = aiAnalysis ? `\n\n*خلاصة التحليل والمبررات:*\n${aiAnalysis}` : '';
    
    const message = `*تفاصيل تحليل الأداء المهني*\n*مدرسة الأمير عبدالمجيد الأولى*\n------------------\n*المعلم:* ${submission.teacher?.full_name}\n*النتيجة:* ${totalScore}% (${grade} - ${score5}/5)${analysisText}${recommendationText}\n\n*مدير المدرسة:*\n*نايف أحمد الشهري*`;
    
    window.open(`https://wa.me/966${submission.teacher?.phone?.substring(1)}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const total = calculateTotal();
  const { grade, score5 } = getGradeDetails(total);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm overflow-y-auto no-print">
        <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
          <div className="p-6 flex justify-between items-center bg-[#0d333f] text-white shrink-0">
            <div className="flex items-center gap-4">
              <img src="https://up6.cc/2026/01/176840436497671.png" className="h-10 object-contain" alt="Logo" />
              <h2 className="text-xl font-black">تحليل وتقييم الأداء الذكي</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 bg-[#f8fafc]">
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">رصد المعايير الوظيفية (من 5)</h3>
                  <div className="space-y-2">
                    {EVALUATION_CRITERIA.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                        <span className="text-sm font-bold text-slate-700">{c.label}</span>
                        <select 
                          value={scores[c.id]} 
                          onChange={(e) => setScores(p => ({ ...p, [c.id]: parseInt(e.target.value) }))}
                          className="bg-white border rounded-xl px-4 py-1.5 font-black text-[#009688]"
                        >
                          {[5,4,3,2,1].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#009688] p-8 rounded-[2.5rem] text-white flex justify-between items-center shadow-lg relative overflow-hidden group">
                   <div className="relative z-10">
                      <p className="text-xs opacity-60 mb-1 font-bold">النسبة المئوية</p>
                      <h4 className="text-6xl font-black tracking-tighter">{total}%</h4>
                   </div>
                   
                   {/* سلم التقدير المطلوب (من 5) */}
                   <div className="relative z-10 bg-white/10 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/20 text-center min-w-[140px]">
                      <p className="text-[10px] font-black uppercase opacity-60 mb-1">الدرجة من 5</p>
                      <div className="text-4xl font-black">{score5}</div>
                      <p className="text-[10px] font-bold mt-1">مستوى الأداء</p>
                   </div>

                   <div className="relative z-10 text-right">
                      <span className="text-lg font-black bg-white text-[#009688] px-6 py-3 rounded-2xl shadow-xl inline-block mb-1">{grade}</span>
                      <p className="text-[10px] opacity-70 font-bold italic block">سلم التقدير المعتمد</p>
                   </div>
                </div>
              </div>

              <div className="space-y-6">
                <button onClick={runAIAndAutoFill} disabled={isAnalyzing} className="w-full py-5 bg-[#009688] text-white rounded-[2rem] text-lg font-black shadow-xl hover:brightness-110 transition-all">
                   {isAnalyzing ? 'جاري التحليل المنصف...' : 'تفعيل التحليل الذكي العملي'}
                </button>
                
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200">
                  <label className="block text-xs font-black text-slate-400 mb-3 uppercase">خلاصة التحليل والمبررات</label>
                  <textarea value={aiAnalysis} onChange={e => setAiAnalysis(e.target.value)} className="w-full h-44 bg-slate-50 p-4 rounded-2xl text-sm border-none outline-none resize-none font-medium leading-relaxed" />
                </div>

                <div className="bg-amber-50 p-6 rounded-[2.5rem] border border-amber-100">
                  <label className="block text-xs font-black text-amber-600 mb-3 uppercase">التوصيات المعتمدة</label>
                  <textarea value={recommendations} onChange={e => setRecommendations(e.target.value)} className="w-full h-24 bg-white/50 p-4 rounded-2xl text-sm border-none outline-none resize-none font-medium leading-relaxed" />
                </div>

                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={saveEvaluation} className="py-5 bg-[#0d333f] text-white rounded-3xl font-black shadow-lg">حفظ التقييم</button>
                     <button onClick={() => window.print()} className="py-5 bg-slate-200 text-[#0d333f] rounded-3xl font-black shadow-sm">طباعة التقرير</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={shareOnWhatsapp} className="py-5 bg-[#25D366] text-white rounded-3xl font-black shadow-lg flex items-center justify-center gap-2 hover:brightness-105 transition-all text-xs">
                        واتساب (مختصر)
                     </button>
                     <button onClick={shareDetailedAnalysis} className="py-5 bg-teal-600 text-white rounded-3xl font-black shadow-lg flex items-center justify-center gap-2 hover:bg-teal-700 transition-all text-xs">
                        واتساب (تفصيلي)
                     </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="final-print-report" className="hidden print:block bg-white text-black" dir="rtl">
        <div className="a4-page mx-auto bg-white flex flex-col" style={{ width: '210mm', height: '297mm', padding: '0' }}>
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
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between gap-4 items-center">
                <div className="text-center">
                   <span className="text-[8px] font-black text-slate-400 block mb-1">النسبة:</span>
                   <p className="text-lg font-black text-[#0d333f]">{total}%</p>
                </div>
                <div className="text-center border-x border-slate-200 px-4">
                   <span className="text-[8px] font-black text-slate-400 block mb-1">الدرجة:</span>
                   <p className="text-lg font-black text-[#009688]">{score5}/5</p>
                </div>
                <div className="text-center">
                   <span className="text-[8px] font-black text-slate-400 block mb-1">التقدير:</span>
                   <p className="text-[10px] font-black text-[#0d333f]">{grade}</p>
                </div>
              </div>
            </div>

            <div className="mb-4 border border-[#0d333f] rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-[9px]">
                <thead className="bg-[#0d333f] text-white">
                  <tr>
                    <th className="py-1 px-3 text-right border-l border-white/10 w-8">م</th>
                    <th className="py-1 px-3 text-right border-l border-white/10">معيار التقييم المعتمد</th>
                    <th className="py-1 px-3 text-center w-16">الدرجة (5)</th>
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

            <div className="mb-4">
              <div className="bg-amber-50/30 p-4 rounded-xl border border-amber-100 relative">
                <span className="absolute -top-2 right-4 px-3 bg-amber-100 text-amber-900 text-[9px] font-black rounded-full">توصيات التطوير المهني المعتمدة</span>
                <div className="text-[10px] leading-relaxed text-slate-700 font-medium whitespace-pre-wrap mt-1">
                  {recommendations || "لا توجد توصيات إضافية لهذا التقييم."}
                </div>
              </div>
            </div>

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
          @page { size: A4; margin: 0mm !important; }
          body * { visibility: hidden !important; }
          #final-print-report, #final-print-report * { visibility: visible !important; }
          #final-print-report {
            display: block !important;
            position: absolute !important;
            top: 0 !important; left: 0 !important;
            width: 210mm !important; height: 297mm !important;
            margin: 0 !important; padding: 0 !important;
            background: white !important; z-index: 999999 !important;
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}} />
    </>
  );
};

export default EvaluationModal;
