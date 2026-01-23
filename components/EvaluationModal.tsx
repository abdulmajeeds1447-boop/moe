
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Submission, EVALUATION_CRITERIA } from '../types';
import { analyzeTeacherReport } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

const EvaluationModal: React.FC<{ submission: Submission; onClose: () => void }> = ({ submission, onClose }) => {
  const [aiAnalysis, setAiAnalysis] = useState('');
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

  const runAIAnalysis = async () => {
    setIsAnalyzing(true);
    setProgress(5);
    setSeconds(0);
    setAnalysisStatus('جاري التحقق من أذونات المجلد...');
    
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    const progressInterval = setInterval(() => setProgress(p => p < 90 ? p + Math.random() * 5 : p), 2000);

    const statusUpdates = [
      { time: 4000, msg: 'جاري سحب الملفات والصور من Google Drive...' },
      { time: 10000, msg: 'جاري استخراج النصوص وفحص جودة الشواهد...' },
      { time: 20000, msg: 'الذكاء الاصطناعي يطابق الشواهد مع معايير الأداء الـ 11...' },
      { time: 35000, msg: 'جاري صياغة التوصيات المهنية النهائية...' }
    ];

    statusUpdates.forEach(update => {
      setTimeout(() => { if(isAnalyzing) setAnalysisStatus(update.msg); }, update.time);
    });

    try {
      const data = await analyzeTeacherReport(submission.drive_link);
      setProgress(100);
      if (data) {
        setAiAnalysis(data.reasons || data.summary);
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
      clearInterval(progressInterval);
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
      alert('✅ تم حفظ التقييم بنجاح وإشعار المعلم.');
      onClose();
    } catch (err) { 
      alert('خطأ في الحفظ، يرجى المحاولة لاحقاً'); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const getGrade = (t: number) => {
    if (t >= 90) return 'ممتاز';
    if (t >= 80) return 'جيد جداً';
    if (t >= 70) return 'جيد';
    if (t >= 60) return 'مرضي';
    return 'غير مرضي';
  };

  const totalScore = calculateTotal();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto font-['Tajawal']">
      <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden border border-white/20">
        
        {/* هيدر المودال */}
        <div className="p-8 bg-[#0d333f] text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-teal-500 rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
            </div>
            <div>
              <h2 className="text-xl font-black">تحليل ملف الأداء الرقمي</h2>
              <p className="text-[11px] text-teal-400 mt-1 font-bold">المعلم: {submission.teacher?.full_name} | المادة: {submission.subject}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full hover:bg-white/10 flex items-center justify-center text-2xl transition-all">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50">
          <div className="grid lg:grid-cols-2 gap-12">
            
            {/* يمين: معايير التقييم */}
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">بطاقة التقييم المعتمدة</h3>
                <a href={submission.drive_link} target="_blank" rel="noreferrer" className="text-[10px] font-black text-[#009688] bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-100">فتح المجلد يدوياً</a>
              </div>
              
              <div className="grid gap-4">
                {EVALUATION_CRITERIA.map(c => (
                  <div key={c.id} className="p-5 bg-white rounded-3xl border border-slate-100 flex justify-between items-center shadow-sm group hover:border-[#009688] transition-all">
                    <div className="flex-1">
                      <span className="text-xs font-black text-slate-700 block mb-1">{c.label}</span>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">{c.examples.substring(0, 60)}...</p>
                    </div>
                    <div className="flex items-center gap-3 mr-4">
                      <select 
                        value={scores[c.id]} 
                        onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                        className="bg-slate-50 px-4 py-2 rounded-xl text-sm font-black text-[#009688] outline-none border-2 border-transparent focus:border-[#009688] transition-all"
                      >
                        {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <span className="text-[10px] font-black text-slate-300">/ 5</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* يسار: التحليل الذكي */}
            <div className="space-y-8 sticky top-0">
              
              {/* كارت الدرجة الكبيرة */}
              <div className="bg-gradient-to-br from-[#009688] to-[#00737a] p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 group-hover:scale-110 transition-transform duration-700"></div>
                <div className="relative z-10 flex justify-between items-center">
                  <div>
                    <p className="text-[11px] opacity-80 font-black mb-2 uppercase tracking-widest">النسبة المئوية للأداء</p>
                    <h4 className="text-6xl font-black">{totalScore}%</h4>
                  </div>
                  <div className="text-center bg-white/20 backdrop-blur-md px-8 py-4 rounded-3xl border border-white/20">
                    <p className="text-[10px] opacity-80 font-black mb-1">التقدير العام</p>
                    <p className="text-2xl font-black">{getGrade(totalScore)}</p>
                  </div>
                </div>
              </div>

              {/* حالة التحليل */}
              {isAnalyzing ? (
                <div className="bg-white p-8 rounded-[2.5rem] border border-teal-100 shadow-xl space-y-5 animate-pulse">
                  <div className="flex justify-between items-center text-[12px] font-black text-[#009688]">
                    <span>{analysisStatus}</span>
                    <span className="bg-teal-50 px-3 py-1 rounded-full">{seconds} ثانية</span>
                  </div>
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={runAIAnalysis} 
                  className="w-full py-7 bg-white border-2 border-[#009688] text-[#009688] rounded-[2.5rem] font-black hover:bg-[#009688] hover:text-white transition-all shadow-xl flex items-center justify-center gap-4 group"
                >
                  <span className="text-2xl group-hover:rotate-12 transition-transform">🤖</span>
                  بدء التحليل الذكي الفوري للمجلد
                </button>
              )}

              {/* تقرير الذكاء الاصطناعي */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                  <h4 className="text-xs font-black text-[#009688] uppercase tracking-widest">توصيات ومبررات الدرجات</h4>
                  <span className="text-[10px] font-bold text-slate-300">Gemini 3 Pro AI Engine</span>
                </div>
                <textarea 
                  value={aiAnalysis} 
                  onChange={e => setAiAnalysis(e.target.value)} 
                  className="w-full h-64 text-sm font-bold bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm focus:ring-4 focus:ring-teal-500/5 outline-none transition-all leading-relaxed" 
                  placeholder="سيظهر هنا التحليل المفصل للشواهد بعد الضغط على زر التحليل..." 
                />
              </div>

              {/* أزرار الحفظ والواتساب */}
              <div className="flex gap-4">
                <button 
                  onClick={saveEvaluation} 
                  disabled={isSaving || isAnalyzing} 
                  className="flex-1 py-6 bg-[#0d333f] text-white rounded-3xl font-black shadow-2xl hover:brightness-125 transition-all text-lg disabled:opacity-50"
                >
                  {isSaving ? 'جاري الحفظ...' : 'اعتماد ورصد الدرجات'}
                </button>
                <button 
                  onClick={() => {
                    const teacherPhone = submission.teacher?.phone || '';
                    const message = `السلام عليكم أ/ ${submission.teacher?.full_name}%0Aتم رصد تقييم ملفكم الرقمي بنسبة: ${totalScore}% (%20${getGrade(totalScore)}).%0Aشكراً لجهودكم.`;
                    window.open(`https://wa.me/966${teacherPhone.startsWith('0') ? teacherPhone.substring(1) : teacherPhone}?text=${message}`, '_blank');
                  }} 
                  className="w-20 py-6 bg-green-500 text-white rounded-3xl font-black shadow-xl hover:bg-green-600 transition-all flex items-center justify-center text-3xl"
                  title="إرسال عبر واتساب"
                >
                  💬
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationModal;
