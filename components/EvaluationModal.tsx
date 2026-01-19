
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
    const total = calculateTotal();
    const grade = getGrade(total);
    const recs = recommendations ? `\n\n*التوصيات:* \n- ${recommendations.replace(/\n/g, '\n- ')}` : "";
    const message = `*نتيجة تقييم الأداء الوظيفي الرقمي*\n*مدرسة الأمير عبدالمجيد الأولى*\n------------------\n*المعلم:* ${submission.teacher?.full_name}\n*الدرجة:* ${total}/100\n*التقدير:* ${grade}${recs}\n\n*مدير المدرسة:*\n*نايف أحمد الشهري*`;
    window.open(`https://wa.me/966${submission.teacher?.phone?.substring(1)}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <>
      {/* واجهة العرض داخل المتصفح */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md overflow-y-auto no-print">
        <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
          <div className="p-8 flex justify-between items-center bg-[#0d333f] text-white shrink-0">
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
                  <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">رصد المعايير الوظيفية</h3>
                  <div className="space-y-3">
                    {EVALUATION_CRITERIA.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                        <span className="text-sm font-bold text-slate-700">{c.label}</span>
                        <select 
                          value={scores[c.id]} 
                          onChange={(e) => setScores(p => ({ ...p, [c.id]: parseInt(e.target.value) }))}
                          className="bg-white border rounded-xl px-4 py-2 font-black text-[#009688]"
                        >
                          {[5,4,3,2,1].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-[#009688] p-8 rounded-[2.5rem] text-white flex justify-between items-center">
                   <div>
                      <p className="text-xs opacity-60 mb-1">المجموع النهائي</p>
                      <h4 className="text-6xl font-black">{calculateTotal()} <span className="text-sm opacity-30">/ 100</span></h4>
                   </div>
                   <span className="text-2xl font-black bg-white/10 px-8 py-4 rounded-3xl">{getGrade(calculateTotal())}</span>
                </div>
              </div>

              <div className="space-y-6">
                <button onClick={runAIAndAutoFill} disabled={isAnalyzing} className="w-full py-6 bg-[#009688] text-white rounded-[2rem] text-lg font-black shadow-xl">
                   {isAnalyzing ? 'جاري التحليل...' : 'تفعيل التحليل الذكي'}
                </button>
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200">
                  <label className="block text-xs font-black text-slate-400 mb-3">خلاصة التحليل</label>
                  <textarea value={aiAnalysis} onChange={e => setAiAnalysis(e.target.value)} className="w-full h-40 bg-slate-50 p-4 rounded-2xl text-sm border-none outline-none resize-none font-medium" />
                </div>
                <div className="bg-amber-50 p-6 rounded-[2.5rem] border border-amber-100">
                  <label className="block text-xs font-black text-amber-600 mb-3">التوصيات</label>
                  <textarea value={recommendations} onChange={e => setRecommendations(e.target.value)} className="w-full h-24 bg-white/50 p-4 rounded-2xl text-sm border-none outline-none resize-none font-medium" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <button onClick={saveEvaluation} className="py-5 bg-[#0d333f] text-white rounded-3xl font-black">حفظ السجل</button>
                   <button onClick={() => window.print()} className="py-5 bg-slate-200 text-[#0d333f] rounded-3xl font-black flex items-center justify-center gap-2">
                      طباعة
                   </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* نموذج الطباعة الرسمي المطور (صفحة واحدة A4 ثابتة) */}
      <div className="hidden print:block fixed inset-0 bg-white text-black z-[99999]" dir="rtl">
        <div className="mx-auto flex flex-col h-[296mm] w-[209mm] overflow-hidden bg-white">
          
          {/* ترويسة مكبوسة جداً */}
          <div className="bg-[#0d333f] text-white py-3 px-10 flex justify-between items-center shrink-0">
            <div className="space-y-0.5 text-[8px] font-bold">
              <p>المملكة العربية السعودية - وزارة التعليم</p>
              <p>الإدارة العامة للتعليم بجدة</p>
              <p className="text-sm font-black pt-0.5">ثانوية الأمير عبدالمجيد الأولى</p>
            </div>
            <img src="https://up6.cc/2026/01/176840436497671.png" className="h-12 object-contain brightness-0 invert" alt="Logo" />
          </div>

          <div className="px-10 py-4 flex-1 flex flex-col min-h-0">
            {/* عنوان البطاقة */}
            <div className="text-center mb-3">
              <h1 className="inline-block text-sm font-black text-[#0d333f] px-6 py-1 border-2 border-[#009688] rounded-lg">
                بطاقة تقييم الأداء الوظيفي الرقمي
              </h1>
            </div>

            {/* بيانات المعلم مضغوطة */}
            <div className="grid grid-cols-2 gap-2 mb-3 shrink-0">
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[7px] font-black text-[#009688] block mb-0.5 uppercase tracking-tighter">اسم المعلم:</span>
                <p className="text-xs font-black text-slate-800">{submission.teacher?.full_name}</p>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center">
                <div>
                   <span className="text-[7px] font-black text-[#009688] block mb-0.5 uppercase tracking-tighter">الدرجة النهائية:</span>
                   <p className="text-lg font-black text-[#0d333f] leading-none">{calculateTotal()} / 100</p>
                </div>
                <div className="px-2 py-0.5 bg-white rounded border border-[#009688] text-[7px] font-black text-[#009688]">
                  {getGrade(calculateTotal())}
                </div>
              </div>
            </div>

            {/* جدول المعايير مضغوط جداً */}
            <div className="mb-3 border border-[#0d333f] rounded-lg overflow-hidden shrink-0 shadow-sm">
              <table className="w-full text-[8px]">
                <thead>
                  <tr className="bg-[#0d333f] text-white">
                    <th className="py-1 px-2 text-right border-l border-white/10 w-8">م</th>
                    <th className="py-1 px-2 text-right border-l border-white/10">معيار التقييم المعتمد</th>
                    <th className="py-1 px-2 text-center w-16">الدرجة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {EVALUATION_CRITERIA.map((c, idx) => (
                    <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="py-0.5 px-2 font-bold text-slate-400 border-l border-slate-100">{idx + 1}</td>
                      <td className="py-0.5 px-2 font-bold text-slate-700 border-l border-slate-100">{c.label}</td>
                      <td className="py-0.5 px-2 text-center font-black text-[#009688] text-[10px]">{scores[c.id]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* قسم التوصيات - مساحة مكبوسة وواضحة */}
            <div className="shrink-0 mb-3">
              <div className="bg-amber-50/30 p-2 rounded-lg border border-amber-100 relative">
                <div className="absolute -top-1.5 right-3 px-2 bg-amber-100 text-amber-800 text-[7px] font-black rounded-full">توصيات التطوير المهني المعتمدة</div>
                <div className="text-[9px] leading-snug text-slate-700 font-medium whitespace-pre-wrap mt-1">
                  {recommendations || "لا توجد توصيات إضافية لهذا التقييم."}
                </div>
              </div>
            </div>

            {/* قسم التوقيعات مرفوع للأعلى */}
            <div className="mt-auto border-t border-slate-100 flex justify-between items-end px-2 pt-2 shrink-0 pb-10">
              <div className="text-right space-y-0.5">
                <p className="text-[6px] text-slate-400 font-bold uppercase tracking-tighter">معرف التقرير الرقمي: {submission.id.substring(0,8).toUpperCase()}</p>
                <p className="text-[6px] text-slate-400 font-bold">تاريخ الاعتماد: {new Date().toLocaleDateString('ar-SA')}</p>
                <div className="pt-2">
                   <p className="text-[8px] font-black text-slate-500 mb-1">توقيع المعلم المقيم:</p>
                   <p className="text-[10px] font-black border-b border-slate-200 pb-0.5 w-32">{submission.teacher?.full_name}</p>
                </div>
              </div>

              <div className="text-center flex flex-col items-center">
                 <p className="text-[9px] font-black text-[#0d333f] mb-3">يعتمد مدير المدرسة</p>
                 <p className="text-base font-black text-[#0d333f] leading-none mb-1">نايف أحمد الشهري</p>
                 <div className="w-32 h-0.5 bg-[#009688] opacity-20 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media screen {
          .print-only-container { display: none !important; }
        }
        @media print {
          @page {
            size: A4;
            margin: 0 !important;
          }
          #root { display: none !important; }
          .no-print { display: none !important; }
          body {
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
          }
          /* منع ظهور أي صفحات إضافية */
          html { height: 100%; overflow: hidden; }
        }
      `}} />
    </>
  );
};

export default EvaluationModal;
