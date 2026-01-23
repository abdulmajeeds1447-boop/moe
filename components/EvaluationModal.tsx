
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Submission, EVALUATION_CRITERIA } from '../types';
import { analyzeTeacherReport } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

const EvaluationModal: React.FC<{ submission: Submission; onClose: () => void }> = ({ submission, onClose }) => {
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [evidenceCounts, setEvidenceCounts] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [progress, setProgress] = useState(0);
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
      setAiAnalysis(data.ai_analysis);
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
    setIsAnalyzing(true);
    setProgress(5);
    setSeconds(0);
    setAnalysisStatus('جاري فحص هيكلية المجلدات الفرعية...');
    
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
    setIsSaving(true);
    try {
      const total = calculateTotal();
      const { error } = await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: aiAnalysis,
        scores: scores,
        total_score: total,
        overall_grade: getGrade(total),
      }, { onConflict: 'submission_id' });
      if (error) throw error;
      await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      alert('✅ تم الاعتماد بنجاح');
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
      `*مبررات الدرجة:*%0A${aiAnalysis.substring(0, 200)}...%0A%0A` +
      `*توصيات المشرف:*%0A${recommendations.substring(0, 150)}...%0A%0A` +
      `مع تحيات إدارة مدرسة الأمير عبدالمجيد الأولى.`;
    window.open(`https://wa.me/966${teacherPhone.replace(/^0/, '')}?text=${message}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto">
      
      {/* التقرير الرسمي المخصص للطباعة فقط */}
      <div className="hidden print:block w-[210mm] bg-white p-[15mm] text-black font-['Tajawal'] min-h-[297mm]">
        <div className="flex justify-between items-start border-b-4 border-[#0d333f] pb-6 mb-8">
          <div className="text-right text-[12px] font-bold space-y-1">
            <p>المملكة العربية السعودية</p>
            <p>وزارة التعليم</p>
            <p>الإدارة العامة للتعليم بجدة</p>
            <p>ثانوية الأمير عبدالمجيد الأولى</p>
          </div>
          <img src="https://up6.cc/2026/01/176840436497671.png" className="h-24 object-contain" alt="Logo" />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-black underline decoration-teal-600 underline-offset-8">بطاقة تقييم الأداء الوظيفي (رقمي)</h1>
          <p className="text-sm font-bold mt-4">للعام الدراسي 1446هـ</p>
        </div>

        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-6 rounded-2xl mb-8 border border-slate-200">
          <p><strong>المعلم:</strong> {submission.teacher?.full_name}</p>
          <p><strong>المادة:</strong> {submission.subject}</p>
          <p><strong>تاريخ التقييم:</strong> {new Date().toLocaleDateString('ar-SA')}</p>
          <p><strong>التقدير العام:</strong> {currentGrade}</p>
        </div>

        <table className="w-full border-collapse border border-slate-300 mb-8 text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 p-3 text-right">المعيار الأساسي</th>
              <th className="border border-slate-300 p-3 text-center">الوزن</th>
              <th className="border border-slate-300 p-3 text-center">الدرجة</th>
            </tr>
          </thead>
          <tbody>
            {EVALUATION_CRITERIA.map(c => (
              <tr key={c.id}>
                <td className="border border-slate-300 p-2">{c.label}</td>
                <td className="border border-slate-300 p-2 text-center">{c.weight}</td>
                <td className="border border-slate-300 p-2 text-center font-bold">{(scores[c.id] || 0) * (c.weight / 5)}</td>
              </tr>
            ))}
            <tr className="bg-[#0d333f] text-white font-black">
              <td className="border border-slate-300 p-3" colSpan={2}>المجموع النهائي</td>
              <td className="border border-slate-300 p-3 text-center text-xl">{totalScore}%</td>
            </tr>
          </tbody>
        </table>

        <div className="space-y-4 mb-10">
          <h3 className="font-black border-r-4 border-teal-600 pr-3">مبررات الدرجة والتحليل النقدي:</h3>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiAnalysis}</p>
        </div>

        <div className="mt-auto pt-20 flex justify-between items-center text-center">
          <div className="w-48">
            <p className="font-black mb-10">توقيع المعلم</p>
            <p className="border-t border-dotted border-black pt-2 text-xs">{submission.teacher?.full_name}</p>
          </div>
          <div className="w-48">
            <p className="font-black mb-10">يعتمد مدير المدرسة</p>
            <p className="font-black text-sm">نايف أحمد الشهري</p>
          </div>
        </div>
      </div>

      {/* واجهة المودال (للعرض فقط) */}
      <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden no-print">
        <div className="p-8 bg-[#0d333f] text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-teal-500 rounded-2xl flex items-center justify-center shadow-lg animate-pulse">🤖</div>
            <div>
              <h2 className="text-xl font-black">نظام التقييم الذكي (المجلدات العميقة)</h2>
              <p className="text-[11px] text-teal-400 font-bold uppercase tracking-widest mt-1">المعلم: {submission.teacher?.full_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full hover:bg-white/10 flex items-center justify-center text-2xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50">
          <div className="grid lg:grid-cols-2 gap-12">
            
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">بطاقة الدرجات</h3>
                <span className="text-[10px] bg-teal-100 text-teal-700 px-3 py-1 rounded-lg font-bold">تحليل خبير ومنصف</span>
              </div>
              
              <div className="grid gap-3">
                {EVALUATION_CRITERIA.map(c => (
                  <div key={c.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex justify-between items-center hover:border-teal-500 transition-all shadow-sm">
                    <span className="text-xs font-black text-slate-700">{c.label}</span>
                    <div className="flex items-center gap-2">
                      <select 
                        value={scores[c.id]} 
                        onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                        className="bg-slate-50 px-3 py-1.5 rounded-lg text-sm font-black text-[#009688] outline-none border border-slate-100"
                      >
                        {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <span className="text-[10px] text-slate-300">/ 5</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-gradient-to-br from-[#009688] to-[#00737a] p-10 rounded-[3rem] text-white shadow-2xl flex justify-between items-center relative overflow-hidden group">
                <div className="relative z-10">
                  <p className="text-[10px] opacity-80 font-black mb-1 uppercase tracking-widest">الدرجة النهائية</p>
                  <h4 className="text-7xl font-black">{totalScore}%</h4>
                </div>
                <div className="text-center z-10 bg-white/20 backdrop-blur-md px-10 py-6 rounded-[2.5rem] border border-white/20 shadow-xl">
                  <p className="text-[10px] opacity-80 font-black mb-1 uppercase tracking-widest">التقدير المستحق</p>
                  <p className="text-3xl font-black tracking-tight">{currentGrade}</p>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
              </div>

              {isAnalyzing ? (
                <div className="bg-white p-8 rounded-[2.5rem] border-2 border-teal-500 shadow-xl space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-black text-teal-600 animate-pulse">{analysisStatus}</p>
                    <span className="text-xs font-bold bg-teal-50 px-2 py-1 rounded-md">{seconds}ث</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 animate-[progress_10s_ease-in-out_infinite]" style={{width: '60%'}}></div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={runAIAnalysis} className="col-span-2 py-6 bg-white border-2 border-teal-500 text-teal-600 rounded-[2rem] font-black hover:bg-teal-500 hover:text-white transition-all shadow-lg flex items-center justify-center gap-3">
                    <span>⚡</span> بدء التحليل العميق (خبير)
                  </button>
                  <button onClick={saveEvaluation} className="py-5 bg-[#0d333f] text-white rounded-2xl font-black shadow-xl hover:brightness-125 transition-all">حفظ واعتماد</button>
                  <button onClick={handlePrint} className="py-5 bg-slate-100 text-[#0d333f] border border-slate-200 rounded-2xl font-black hover:bg-white transition-all">📄 طباعة التقرير A4</button>
                  <button onClick={sendWhatsApp} className="col-span-2 py-5 bg-green-500 text-white rounded-2xl font-black shadow-xl hover:bg-green-600 transition-all flex items-center justify-center gap-3">
                    <span>💬</span> إرسال التقرير التفصيلي للمعلم
                  </button>
                </div>
              )}

              <div className="space-y-4">
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                  <h4 className="text-[11px] font-black text-teal-600 uppercase mb-3">حصر الشواهد المكتشفة:</h4>
                  <p className="text-[12px] font-bold text-slate-500 italic leading-relaxed">{evidenceCounts || 'لم يتم البدء بالتحليل...'}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                  <h4 className="text-[11px] font-black text-teal-600 uppercase mb-3">النقد المهني والمبررات:</h4>
                  <textarea value={aiAnalysis} onChange={e=>setAiAnalysis(e.target.value)} className="w-full h-40 text-xs font-bold outline-none border-none resize-none leading-relaxed" placeholder="مبررات الدرجة..." />
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
