
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Submission, EVALUATION_CRITERIA } from '../types';
import { analyzeTeacherReport } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

interface EvaluationModalProps {
  submission: Submission;
  onClose: () => void;
  isViewOnly?: boolean; // خاصية جديدة لتحديد ما إذا كان المستخدم معلماً (عرض فقط) أو مديراً
}

const EvaluationModal: React.FC<EvaluationModalProps> = ({ submission, onClose, isViewOnly = false }) => {
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [evidenceCounts, setEvidenceCounts] = useState('');
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
    setAnalysisStatus('جاري فحص هيكلية المجلدات العميقة...');
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    
    try {
      const data = await analyzeTeacherReport(submission.drive_link);
      if (data) {
        setAiAnalysis(data.reasons || data.summary);
        setEvidenceCounts(data.evidence_counts || '');
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
      alert('✅ تم الاعتماد والحفظ بنجاح');
    } catch (err) { alert('خطأ في الحفظ'); } finally { setIsSaving(false); }
  };

  const totalScore = calculateTotal();
  const currentGrade = getGrade(totalScore);

  const handlePrint = () => { window.print(); };

  const sendWhatsApp = () => {
    const teacherPhone = submission.teacher?.phone || '';
    const message = `*تقرير تقييم الأداء الوظيفي الرقمي*%0A%0A` +
      `الأستاذ/ة: ${submission.teacher?.full_name}%0A` +
      `المادة: ${submission.subject}%0A` +
      `الدرجة النهائية: ${totalScore}%0A` +
      `التقدير العام: *${currentGrade}*%0A%0A` +
      `*مبررات الدرجة:*%0A${aiAnalysis.substring(0, 300)}...%0A%0A` +
      `مع تحيات إدارة مدرسة الأمير عبدالمجيد الأولى.`;
    window.open(`https://wa.me/966${teacherPhone.replace(/^0/, '')}?text=${message}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md overflow-y-auto">
      
      {/* 1. النسخة المخصصة للطباعة A4 (مخفية في المتصفح وتظهر عند الطباعة فقط) */}
      <div className="hidden print:block w-[210mm] bg-white p-[20mm] text-black font-['Tajawal'] min-h-[297mm] shadow-none">
        <div className="flex justify-between items-start border-b-4 border-[#0d333f] pb-6 mb-10">
          <div className="text-right text-[13px] font-bold space-y-1">
            <p>المملكة العربية السعودية</p>
            <p>وزارة التعليم</p>
            <p>الإدارة العامة للتعليم بجدة</p>
            <p>ثانوية الأمير عبدالمجيد الأولى</p>
          </div>
          <img src="https://up6.cc/2026/01/176840436497671.png" className="h-28 object-contain" alt="Logo" />
        </div>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-black underline decoration-teal-600 underline-offset-8">بطاقة تقييم الأداء الوظيفي الرقمي</h1>
          <p className="text-sm font-bold mt-4">للعام الدراسي 1446هـ</p>
        </div>

        <div className="grid grid-cols-2 gap-6 bg-slate-50 p-8 rounded-[2rem] mb-10 border border-slate-200 text-sm">
          <p><strong>اسم المعلم:</strong> {submission.teacher?.full_name}</p>
          <p><strong>المادة / التخصص:</strong> {submission.subject}</p>
          <p><strong>تاريخ الاعتماد:</strong> {new Date().toLocaleDateString('ar-SA')}</p>
          <p><strong>التقدير العام:</strong> <span className="text-teal-700 font-black">{currentGrade}</span></p>
        </div>

        <table className="w-full border-collapse border-2 border-[#0d333f] mb-10 text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className="border-2 border-[#0d333f] p-3 text-right">معايير التقييم الأساسية</th>
              <th className="border-2 border-[#0d333f] p-3 text-center w-24">الوزن</th>
              <th className="border-2 border-[#0d333f] p-3 text-center w-24">الدرجة الممنوحة</th>
            </tr>
          </thead>
          <tbody>
            {EVALUATION_CRITERIA.map(c => (
              <tr key={c.id}>
                <td className="border border-[#0d333f] p-2 font-bold">{c.label}</td>
                <td className="border border-[#0d333f] p-2 text-center">{c.weight}</td>
                <td className="border border-[#0d333f] p-2 text-center font-black">{(scores[c.id] || 0) * (c.weight / 5)}</td>
              </tr>
            ))}
            <tr className="bg-[#0d333f] text-white font-black">
              <td className="border-2 border-[#0d333f] p-4 text-lg" colSpan={2}>النسبة المئوية النهائية للأداء</td>
              <td className="border-2 border-[#0d333f] p-4 text-center text-2xl">{totalScore}%</td>
            </tr>
          </tbody>
        </table>

        <div className="space-y-6 mb-16">
          <div className="border-r-4 border-teal-600 pr-4">
            <h3 className="font-black text-sm mb-2">مبررات التقييم والتحليل النقدي:</h3>
            <p className="text-[11px] leading-relaxed whitespace-pre-wrap text-slate-700 italic">{aiAnalysis || 'تم تقييم المعلم بناءً على الشواهد الرقمية المرفقة.'}</p>
          </div>
          <div className="border-r-4 border-teal-600 pr-4">
            <h3 className="font-black text-sm mb-2">توصيات مدير المدرسة للتطوير المهني:</h3>
            <p className="text-[11px] leading-relaxed whitespace-pre-wrap text-slate-700 italic">{recommendations || 'الاستمرار في العطاء المتميز وتطوير المهارات التقنية.'}</p>
          </div>
        </div>

        <div className="mt-auto pt-10 flex justify-between items-center text-center">
          <div className="w-56">
            <p className="font-black text-xs mb-12">توقيع المعلم</p>
            <p className="border-t border-dotted border-black pt-2 text-[10px]">{submission.teacher?.full_name}</p>
          </div>
          <div className="w-56">
            <p className="font-black text-xs mb-12">مدير المدرسة</p>
            <p className="font-black text-sm">نايف أحمد الشهري</p>
            <p className="text-[9px] text-slate-400 mt-1">(ختم وتوقيع إلكتروني معتمد)</p>
          </div>
        </div>
      </div>

      {/* 2. واجهة العرض التفاعلية (Modal) */}
      <div className="bg-white w-full max-w-6xl rounded-[3.5rem] shadow-[0_30px_90px_rgba(0,0,0,0.4)] flex flex-col max-h-[95vh] overflow-hidden no-print">
        
        {/* هيدر النافذة */}
        <div className="p-8 bg-[#0d333f] text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-teal-500 rounded-2xl flex items-center justify-center shadow-lg text-3xl">📊</div>
            <div>
              <h2 className="text-2xl font-black">تقرير تقييم الأداء الرسمي</h2>
              <p className="text-sm text-teal-400 font-bold mt-1 tracking-wide uppercase">المعلم: {submission.teacher?.full_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-14 h-14 rounded-full hover:bg-white/10 flex items-center justify-center text-3xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50">
          <div className="grid lg:grid-cols-2 gap-12">
            
            {/* الجزء الأيمن: بطاقة الدرجات */}
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">تفصيل الدرجات لكل معيار</h3>
                <span className="text-[10px] bg-teal-100 text-teal-700 px-4 py-1.5 rounded-full font-black">بناءً على معايير الوزارة</span>
              </div>
              
              <div className="grid gap-3">
                {EVALUATION_CRITERIA.map(c => (
                  <div key={c.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex justify-between items-center group hover:border-teal-500 transition-all shadow-sm">
                    <span className="text-xs font-black text-slate-700 group-hover:text-teal-700">{c.label}</span>
                    <div className="flex items-center gap-3">
                      <select 
                        disabled={isViewOnly}
                        value={scores[c.id]} 
                        onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                        className={`bg-slate-50 px-3 py-1.5 rounded-xl text-sm font-black text-[#009688] outline-none border border-slate-100 ${isViewOnly ? 'appearance-none pointer-events-none' : 'hover:border-teal-500'}`}
                      >
                        {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <span className="text-[10px] text-slate-300 font-bold">/ 5</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* الجزء الأيسر: الإحصائيات والأوامر */}
            <div className="space-y-8">
              <div className="bg-gradient-to-br from-[#0d333f] to-[#009688] p-12 rounded-[3.5rem] text-white shadow-2xl flex justify-between items-center relative overflow-hidden group">
                <div className="relative z-10">
                  <p className="text-[10px] opacity-70 font-black mb-1 uppercase tracking-widest">النسبة المئوية</p>
                  <h4 className="text-8xl font-black tabular-nums">{totalScore}%</h4>
                </div>
                <div className="text-center z-10 bg-white/10 backdrop-blur-xl px-12 py-8 rounded-[3rem] border border-white/20 shadow-2xl">
                  <p className="text-[10px] opacity-70 font-black mb-1 uppercase tracking-widest">التقدير العام</p>
                  <p className="text-4xl font-black tracking-tight">{currentGrade}</p>
                </div>
                <div className="absolute -top-10 -right-10 w-80 h-80 bg-white/5 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-1000"></div>
              </div>

              {isAnalyzing ? (
                <div className="bg-white p-10 rounded-[3rem] border-2 border-teal-500 shadow-xl space-y-6 text-center">
                  <div className="animate-spin text-4xl mx-auto">🌀</div>
                  <p className="text-lg font-black text-teal-600 animate-pulse">{analysisStatus}</p>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden w-full">
                    <div className="h-full bg-teal-500 animate-[progress_15s_ease-in-out_infinite]" style={{width: '70%'}}></div>
                  </div>
                  <p className="text-xs text-slate-400 font-bold">الوقت المستغرق: {seconds} ثانية</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5">
                  {!isViewOnly && (
                    <>
                      <button onClick={runAIAnalysis} className="col-span-2 py-6 bg-teal-500 text-white rounded-[2.5rem] font-black text-lg hover:bg-teal-600 hover:-translate-y-1 transition-all shadow-xl shadow-teal-500/20 flex items-center justify-center gap-4">
                        <span>⚡</span> تحديث التحليل الذكي للبيانات
                      </button>
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-6 bg-[#0d333f] text-white rounded-[2rem] font-black text-lg shadow-xl hover:brightness-125 transition-all">
                        {isSaving ? 'جاري الحفظ...' : 'حفظ واعتماد الدرجات'}
                      </button>
                    </>
                  )}
                  
                  <button onClick={handlePrint} className={`py-6 bg-slate-100 text-[#0d333f] border-2 border-slate-200 rounded-[2rem] font-black text-lg hover:bg-white transition-all ${isViewOnly ? 'col-span-2' : ''}`}>
                    📄 طباعة التقرير الرسمي A4
                  </button>
                  
                  <button onClick={sendWhatsApp} className="col-span-2 py-6 bg-green-500 text-white rounded-[2.5rem] font-black text-lg shadow-xl hover:bg-green-600 hover:-translate-y-1 transition-all flex items-center justify-center gap-4">
                    <span>💬</span> إرسال التقرير عبر الواتساب
                  </button>
                </div>
              )}

              <div className="space-y-4">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                  <h4 className="text-[11px] font-black text-teal-600 uppercase tracking-widest border-b border-teal-50 pb-2">نقد المشرف ومبررات الدرجة:</h4>
                  <textarea 
                    readOnly={isViewOnly}
                    value={aiAnalysis} 
                    onChange={e=>setAiAnalysis(e.target.value)} 
                    className={`w-full h-40 text-xs font-bold outline-none border-none resize-none leading-relaxed text-slate-600 bg-transparent ${isViewOnly ? 'cursor-default' : 'focus:ring-2 focus:ring-teal-50'}`} 
                    placeholder="مبررات الدرجة..." 
                  />
                </div>
                {!isViewOnly && (
                  <div className="bg-amber-50 p-8 rounded-[2.5rem] border border-amber-100 shadow-sm space-y-4">
                    <h4 className="text-[11px] font-black text-amber-600 uppercase tracking-widest border-b border-amber-100 pb-2">توصيات التطوير المهني:</h4>
                    <textarea 
                      value={recommendations} 
                      onChange={e=>setRecommendations(e.target.value)} 
                      className="w-full h-24 text-xs font-bold outline-none border-none resize-none leading-relaxed text-amber-900 bg-transparent" 
                      placeholder="توصيات للمعلم..." 
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationModal;
