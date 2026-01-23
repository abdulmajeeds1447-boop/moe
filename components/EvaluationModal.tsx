
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Submission, EVALUATION_CRITERIA } from '../types';
import { analyzeTeacherReport } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

interface EvaluationModalProps {
  submission: Submission;
  onClose: () => void;
  isViewOnly?: boolean; 
}

const EvaluationModal: React.FC<EvaluationModalProps> = ({ submission, onClose, isViewOnly = false }) => {
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [scores, setScores] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { 
    loadExistingEvaluation(); 
    return () => { if(timerRef.current) clearInterval(timerRef.current); };
  }, [submission.id]);

  const loadExistingEvaluation = async () => {
    const { data } = await supabase.from('evaluations').select('*').eq('submission_id', submission.id).maybeSingle();
    if (data) {
      setAiAnalysis(data.ai_analysis || '');
      setRecommendations(data.recommendations || '');
      if (data.scores) {
        const normalized: Record<number, number> = {};
        Object.entries(data.scores).forEach(([k, v]) => normalized[Number(k)] = Number(v));
        setScores(normalized);
      }
    }
  };

  const calculateTotal = () => {
    let total = 0;
    EVALUATION_CRITERIA.forEach(c => { total += (scores[c.id] || 0) * (c.weight / 5); });
    return Math.round(total);
  };

  const getGrade = (t: number) => {
    if (t >= 90) return 'ممتاز';
    if (t >= 80) return 'جيد جداً';
    if (t >= 70) return 'جيد';
    if (t >= 60) return 'مرضي';
    return 'غير مرضي';
  };

  const runAIAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setSeconds(0);
    setAnalysisStatus('جاري تحليل الشواهد والمجلدات العميقة...');
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    
    try {
      const data = await analyzeTeacherReport(submission.drive_link);
      if (data) {
        setAiAnalysis(data.reasons || data.summary);
        setRecommendations(data.recommendations || '');
        if (data.suggested_scores) {
          const newScores = { ...scores };
          Object.entries(data.suggested_scores).forEach(([k, v]) => {
            newScores[Number(k)] = Number(v);
          });
          setScores(newScores);
        }
      }
    } catch (err: any) {
      alert(`عذراً، فشل التحليل: ${err.message}`);
    } finally {
      if(timerRef.current) clearInterval(timerRef.current);
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const saveEvaluation = async () => {
    if (isViewOnly) return;
    setIsSaving(true);
    try {
      const total = calculateTotal();
      const { error } = await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: aiAnalysis,
        recommendations: recommendations,
        scores: scores,
        total_score: total,
        overall_grade: getGrade(total),
      }, { onConflict: 'submission_id' });
      
      if (error) throw error;
      await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      alert('✅ تم اعتماد التقييم بنجاح');
    } catch (err) { alert('خطأ في حفظ البيانات'); } finally { setIsSaving(false); }
  };

  const totalScore = calculateTotal();
  const currentGrade = getGrade(totalScore);

  const handlePrint = () => { window.print(); };

  const sendWhatsApp = () => {
    const teacherPhone = submission.teacher?.phone || '';
    const message = `*تقرير تقييم الأداء الرقمي*%0A%0A` +
      `الأستاذ/ة: ${submission.teacher?.full_name}%0A` +
      `المادة: ${submission.subject}%0A` +
      `الدرجة: ${totalScore}/100%0A` +
      `التقدير: *${currentGrade}*%0A%0A` +
      `*تحليل المشرف:*%0A${aiAnalysis.substring(0, 300)}...%0A%0A` +
      `مع تحيات إدارة مدرسة الأمير عبدالمجيد الأولى.`;
    window.open(`https://wa.me/966${teacherPhone.replace(/^0/, '')}?text=${message}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-lg overflow-y-auto">
      
      {/* التقرير الرسمي A4 (للطباعة) */}
      <div className="hidden print:block w-[210mm] bg-white p-[25mm] text-black font-['Tajawal'] min-h-[297mm]">
        <div className="flex justify-between items-start border-b-4 border-moe-navy pb-8 mb-12">
          <div className="text-right text-[14px] font-bold space-y-1.5">
            <p>المملكة العربية السعودية</p>
            <p>وزارة التعليم</p>
            <p>ثانوية الأمير عبدالمجيد الأولى</p>
          </div>
          <img src="https://up6.cc/2026/01/176840436497671.png" className="h-28 object-contain" alt="Logo" />
        </div>

        <div className="text-center mb-12">
          <h1 className="text-3xl font-black underline decoration-moe-teal underline-offset-8">بطاقة تقييم الأداء الوظيفي الرقمي</h1>
          <p className="text-sm font-bold mt-5">للعام الدراسي 1446هـ</p>
        </div>

        <div className="grid grid-cols-2 gap-8 bg-slate-50 p-10 rounded-[2.5rem] mb-12 border border-slate-200 text-[13px]">
          <p><strong>اسم المعلم:</strong> {submission.teacher?.full_name}</p>
          <p><strong>المادة / التخصص:</strong> {submission.subject}</p>
          <p><strong>تاريخ الاعتماد:</strong> {new Date().toLocaleDateString('ar-SA')}</p>
          <p><strong>التقدير العام:</strong> <span className="text-moe-teal font-black">{currentGrade}</span></p>
        </div>

        <table className="w-full border-collapse border-2 border-moe-navy mb-12 text-[11px]">
          <thead>
            <tr className="bg-slate-100 font-black">
              <th className="border-2 border-moe-navy p-4 text-right">معيار التقييم</th>
              <th className="border-2 border-moe-navy p-4 text-center w-28">الوزن</th>
              <th className="border-2 border-moe-navy p-4 text-center w-28">الدرجة</th>
            </tr>
          </thead>
          <tbody>
            {EVALUATION_CRITERIA.map(c => (
              <tr key={c.id}>
                <td className="border border-moe-navy p-3 font-bold">{c.label}</td>
                <td className="border border-moe-navy p-3 text-center">{c.weight}</td>
                <td className="border border-moe-navy p-3 text-center font-black">{(scores[c.id] || 0) * (c.weight / 5)}</td>
              </tr>
            ))}
            <tr className="bg-moe-navy text-white font-black">
              <td className="border-2 border-moe-navy p-5 text-xl" colSpan={2}>النسبة المئوية النهائية</td>
              <td className="border-2 border-moe-navy p-5 text-center text-3xl">{totalScore}%</td>
            </tr>
          </tbody>
        </table>

        <div className="space-y-8 mb-20">
          <div className="border-r-4 border-moe-teal pr-5">
            <h3 className="font-black text-sm mb-3">تحليل الأداء الوظيفي:</h3>
            <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-slate-700 italic">{aiAnalysis || 'تم الاعتماد بناءً على المرفقات الرقمية.'}</p>
          </div>
          <div className="border-r-4 border-moe-teal pr-5">
            <h3 className="font-black text-sm mb-3">توصيات التطوير المهني:</h3>
            <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-slate-700 italic">{recommendations || 'نوصي بمتابعة العطاء المتميز.'}</p>
          </div>
        </div>

        <div className="mt-auto pt-16 flex justify-between items-center text-center">
          <div className="w-64">
            <p className="font-black text-sm mb-16">توقيع المعلم</p>
            <p className="border-t border-dotted border-black pt-3 text-[11px]">{submission.teacher?.full_name}</p>
          </div>
          <div className="w-64">
            <p className="font-black text-sm mb-16">مدير المدرسة</p>
            <p className="font-black text-base">نايف أحمد الشهري</p>
            <p className="text-[10px] text-slate-400 mt-2">(ختم رسمي معتمد إلكترونياً)</p>
          </div>
        </div>
      </div>

      {/* واجهة العرض (Modal) */}
      <div className="bg-white w-full max-w-6xl rounded-[4rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden no-print">
        
        <div className="p-8 bg-moe-navy text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-moe-teal rounded-3xl flex items-center justify-center shadow-lg text-3xl">📊</div>
            <div>
              <h2 className="text-2xl font-black">تحليل ملف الأداء الرقمي</h2>
              <p className="text-sm text-moe-teal font-bold mt-1 uppercase tracking-widest">المعلم: {submission.teacher?.full_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-14 h-14 rounded-full hover:bg-white/10 flex items-center justify-center text-3xl transition-all">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-slate-50/50">
          <div className="grid lg:grid-cols-2 gap-16">
            
            <div className="space-y-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">بطاقة التقييم المعتمدة</h3>
              <div className="grid gap-3">
                {EVALUATION_CRITERIA.map(c => (
                  <div key={c.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex justify-between items-center group hover:border-moe-teal transition-all shadow-sm">
                    <span className="text-xs font-black text-slate-700 group-hover:text-moe-teal">{c.label}</span>
                    <div className="flex items-center gap-4">
                      <select 
                        disabled={isViewOnly}
                        value={scores[c.id]} 
                        onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                        className={`bg-slate-50 px-4 py-2 rounded-xl text-sm font-black text-moe-teal outline-none border-2 border-transparent ${isViewOnly ? 'appearance-none pointer-events-none' : 'focus:border-moe-teal/20'}`}
                      >
                        {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <span className="text-[10px] text-slate-300 font-bold">/ 5</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-10">
              <div className="bg-gradient-to-br from-moe-navy to-moe-teal p-12 rounded-[3.5rem] text-white shadow-2xl flex justify-between items-center relative overflow-hidden group">
                <div className="relative z-10">
                  <p className="text-[10px] opacity-70 font-black mb-1 uppercase tracking-[0.2em]">النسبة المئوية للأداء</p>
                  <h4 className="text-8xl font-black">{totalScore}%</h4>
                </div>
                <div className="text-center z-10 bg-white/10 backdrop-blur-xl px-12 py-8 rounded-[3rem] border border-white/20 shadow-xl">
                  <p className="text-[10px] opacity-70 font-black mb-1 uppercase tracking-widest">التقدير العام</p>
                  <p className="text-4xl font-black">{currentGrade}</p>
                </div>
                <div className="absolute -top-10 -right-10 w-80 h-80 bg-white/5 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-1000"></div>
              </div>

              {isAnalyzing ? (
                <div className="bg-white p-10 rounded-[3rem] border-2 border-moe-teal shadow-xl space-y-6 text-center">
                  <div className="animate-spin text-4xl mx-auto">🌀</div>
                  <p className="text-lg font-black text-moe-teal animate-pulse">{analysisStatus}</p>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden w-full">
                    <div className="h-full bg-moe-teal animate-[progress_15s_ease-in-out_infinite]" style={{width: '70%'}}></div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5">
                  {!isViewOnly && (
                    <>
                      <button onClick={runAIAnalysis} className="col-span-2 py-6 bg-white border-2 border-moe-teal text-moe-teal rounded-[2.5rem] font-black text-lg hover:bg-moe-teal hover:text-white transition-all shadow-lg flex items-center justify-center gap-4">
                        <span>🤖</span> بدء التحليل الذكي الفوري للمجلد
                      </button>
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-6 bg-moe-navy text-white rounded-[2rem] font-black text-lg shadow-xl hover:brightness-125 transition-all">
                        {isSaving ? 'جاري الحفظ...' : 'اعتماد ورصد الدرجات'}
                      </button>
                    </>
                  )}
                  
                  <button onClick={handlePrint} className={`py-6 bg-slate-100 text-moe-navy border-2 border-slate-200 rounded-[2rem] font-black text-lg hover:bg-white transition-all ${isViewOnly ? 'col-span-2' : ''}`}>
                    📄 طباعة التقرير الرسمي A4
                  </button>
                  
                  <button onClick={sendWhatsApp} className="col-span-2 py-6 bg-green-500 text-white rounded-[2.5rem] font-black text-lg shadow-xl hover:bg-green-600 hover:-translate-y-1 transition-all flex items-center justify-center gap-4">
                    <span>💬</span> إرسال التقرير عبر الواتساب
                  </button>
                </div>
              )}

              <div className="space-y-6">
                 <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-4">توصيات ومبررات الدرجات</h3>
                 <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-4">
                    <textarea 
                      readOnly={isViewOnly}
                      value={aiAnalysis} 
                      onChange={e=>setAiAnalysis(e.target.value)} 
                      className="w-full h-44 text-sm font-bold outline-none border-none resize-none leading-relaxed text-slate-600 bg-transparent" 
                      placeholder="مبررات الدرجة والتحليل النقدي..." 
                    />
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
