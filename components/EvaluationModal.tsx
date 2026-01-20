
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

  const shareOnWhatsapp = () => {
    const totalScore = calculateTotal();
    const currentGrade = getGrade(totalScore);
    const recommendationText = recommendations ? `\n\n*توصيات التطوير المهني:*\n${recommendations}` : '';
    
    const message = `*نتيجة تقييم الأداء الوظيفي الرقمي*\n*مدرسة الأمير عبدالمجيد الأولى*\n------------------\n*المعلم:* ${submission.teacher?.full_name}\n*الدرجة:* ${totalScore}/100\n*التقدير:* ${currentGrade}${recommendationText}\n\n*مدير المدرسة:*\n*نايف أحمد الشهري*`;
    
    window.open(`https://wa.me/966${submission.teacher?.phone?.substring(1)}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const shareDetailedAnalysis = () => {
    const recommendationText = recommendations ? `\n\n*التوصيات المعتمدة:*\n${recommendations}` : '';
    const analysisText = aiAnalysis ? `\n\n*خلاصة التحليل والمبررات:*\n${aiAnalysis}` : '';
    
    const message = `*تفاصيل تحليل الأداء المهني*\n*مدرسة الأمير عبدالمجيد الأولى*\n------------------\n*المعلم:* ${submission.teacher?.full_name}${analysisText}${recommendationText}\n\n*مدير المدرسة:*\n*نايف أحمد الشهري*`;
    
    window.open(`https://wa.me/966${submission.teacher?.phone?.substring(1)}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const total = calculateTotal();
  const grade = getGrade(total);

  return (
    <>
      {/* واجهة التفاعل - تظهر في المتصفح فقط */}
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
              {/* قسم المعايير والدرجات */}
              <div className="space-y-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">رصد المعايير الوظيفية</h3>
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

                <div className="bg-[#009688] p-8 rounded-[2.5rem] text-white flex justify-between items-center shadow-lg">
                   <div>
                      <p className="text-xs opacity-60 mb-1 font-bold">المجموع النهائي</p>
                      <h4 className="text-5xl font-black">{total} <span className="text-sm opacity-30">/ 100</span></h4>
                   </div>
                   <span className="text-2xl font-black bg-white/10 px-8 py-4 rounded-3xl border border-white/10">{grade}</span>
                </div>
              </div>

              {/* قسم التحليل والتوصيات */}
              <div className="space-y-6">
                <button onClick={runAIAndAutoFill} disabled={isAnalyzing} className="w-full py-5 bg-[#009688] text-white rounded-[2rem] text-lg font-black shadow-xl hover:brightness-110 transition-all">
                   {isAnalyzing ? 'جاري التحليل الذكي...' : 'تفعيل التحليل الذكي للشواهد'}
                </button>
                
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200">
                  <label className="block text-xs font-black text-slate-400 mb-3 uppercase">خلاصة التحليل والمبررات</label>
                  <textarea value={aiAnalysis} onChange={e => setAiAnalysis(e.target.value)} className="w-full h-44 bg-slate-50 p-4 rounded-2xl text-sm border-none outline-none resize-none font-medium leading-relaxed" />
                </div>

                <div className="bg-amber-50 p-6 rounded-[2.5rem] border border-amber-100">
                  <label className="block text-xs font-black text-amber-600 mb-3 uppercase">التوصيات المعتمدة</label>
                  <textarea value={recommendations} onChange={e => setRecommendations(e.target.value)} className="w-full h-24 bg-white/50 p-4 rounded-2xl text-sm border-none outline-none resize-none font-medium leading-relaxed" />
                </div>

                {/* أزرار الإجراءات - تم إضافة زر واتساب تفصيلي */}
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={saveEvaluation} className="py-5 bg-[#0d333f] text-white rounded-3xl font-black shadow-lg">حفظ التقييم</button>
                     <button onClick={() => window.print()} className="py-5 bg-slate-200 text-[#0d333f] rounded-3xl font-black shadow-sm">طباعة التقرير</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                     <button onClick={shareOnWhatsapp} className="py-5 bg-[#25D366] text-white rounded-3xl font-black shadow-lg flex items-center justify-center gap-2 hover:brightness-105 transition-all">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        النتيجة (مختصر)
                     </button>
                     <button onClick={shareDetailedAnalysis} className="py-5 bg-teal-600 text-white rounded-3xl font-black shadow-lg flex items-center justify-center gap-2 hover:bg-teal-700 transition-all border-b-4 border-teal-800">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                        التحليل (تفصيلي)
                     </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* التقرير النهائي للطباعة - تم حل مشكلة الصفحة البيضاء والتكرار */}
      <div id="final-print-report" className="hidden print:block bg-white text-black" dir="rtl">
        <div className="a4-page mx-auto bg-white flex flex-col" style={{ width: '210mm', height: '297mm', padding: '0' }}>
          
          {/* ترويسة مكبوسة */}
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
                    <th className="py-1 px-3 text-right border-l border-white/10">معيار التقييم المعتمد</th>
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
            <div className="mb-4">
              <div className="bg-amber-50/30 p-4 rounded-xl border border-amber-100 relative">
                <span className="absolute -top-2 right-4 px-3 bg-amber-100 text-amber-900 text-[9px] font-black rounded-full">توصيات التطوير المهني المعتمدة</span>
                <div className="text-[10px] leading-relaxed text-slate-700 font-medium whitespace-pre-wrap mt-1">
                  {recommendations || "لا توجد توصيات إضافية لهذا التقييم."}
                </div>
              </div>
            </div>

            {/* التواقيع مرفوعة */}
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
