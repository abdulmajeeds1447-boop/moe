
'use client';

import React, { useState, useEffect } from 'react';
import { Submission, EVALUATION_CRITERIA } from '../types';
import { analyzeTeacherReport } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

interface EvaluationModalProps {
  submission: Submission;
  onClose: () => void;
  isViewOnly?: boolean; 
}

const EvaluationModal: React.FC<EvaluationModalProps> = ({ submission, onClose, isViewOnly = false }) => {
  const [justification, setJustification] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [scores, setScores] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
  });

  useEffect(() => { loadExistingEvaluation(); }, [submission.id]);

  const loadExistingEvaluation = async () => {
    try {
      const { data } = await supabase.from('evaluations').select('*').eq('submission_id', submission.id).maybeSingle();
      if (data && data.scores) {
        setJustification(data.ai_analysis || '');
        const normalized: Record<number, number> = {};
        Object.entries(data.scores).forEach(([k, v]) => normalized[Number(k)] = Number(v));
        setScores(normalized);
      }
    } catch (e) { console.error("Load error:", e); }
  };

  const calculateWeighted = (id: number) => {
    const criterion = EVALUATION_CRITERIA.find(c => c.id === id);
    if (!criterion) return 0;
    const rawScore = Number(scores[id] || 0);
    return (rawScore / 5) * criterion.weight;
  };

  const calculateTotal = () => {
    let total = 0;
    EVALUATION_CRITERIA.forEach(c => { total += calculateWeighted(c.id); });
    return Math.min(100, Math.round(total)); 
  };

  const getGradeInfo = (t: number) => {
    if (t >= 90) return { label: 'ممتاز / رائد', color: 'text-emerald-600' };
    if (t >= 80) return { label: 'جيد جداً / قوي', color: 'text-blue-600' };
    if (t >= 70) return { label: 'جيد', color: 'text-cyan-600' };
    if (t >= 60) return { label: 'مرضي / مقبول', color: 'text-amber-600' };
    return { label: 'غير مرضي / ضعيف', color: 'text-red-600' };
  };

  const totalScore = calculateTotal();
  const gradeInfo = getGradeInfo(totalScore);

  const runAIAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setAnalysisStatus('جاري فحص الشواهد وحساب الأوزان النسبية...');
    
    try {
      const data = await analyzeTeacherReport(submission.drive_link, (attempt) => {
        setAnalysisStatus(`الخادم مشغول.. إعادة المحاولة الذكية (${attempt}/3)`);
      });
      
      if (data && data.suggested_scores) {
        setJustification(data.justification || '');
        const newScores = { ...scores };
        Object.entries(data.suggested_scores).forEach(([k, v]) => {
          const numKey = Number(k);
          if (numKey >= 1 && numKey <= 11) newScores[numKey] = Number(v);
        });
        setScores(newScores);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const saveEvaluation = async () => {
    if (isViewOnly) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: justification,
        scores: scores,
        total_score: totalScore,
        overall_grade: gradeInfo.label,
      }, { onConflict: 'submission_id' });
      if (error) throw error;
      await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      alert('✅ تم اعتماد التقييم المئوي وحفظه بنجاح');
      onClose();
    } catch (err) { alert('خطأ في حفظ البيانات'); } finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-lg overflow-y-auto">
      <style type="text/css" media="print">
        {`@page { size: A4; margin: 0; } body { visibility: hidden; } .print-container, .print-container * { visibility: visible; } .print-container { position: fixed; top: 0; left: 0; width: 210mm; padding: 15mm; background: white; }`}
      </style>

      {/* تقرير الطباعة */}
      <div className="print-container hidden font-['Tajawal'] text-black">
        <div className="flex justify-between items-center mb-6 border-b-2 border-black pb-4">
           <div className="text-[10px] font-bold">المملكة العربية السعودية<br/>وزارة التعليم<br/>ثانوية الأمير عبدالمجيد الأولى</div>
           <img src="https://up6.cc/2026/01/176840436497671.png" className="h-16 grayscale" alt="Logo" />
        </div>
        <h1 className="text-center text-xl font-black mb-6">بطاقة تقييم الأداء (بالأوزان النسبية)</h1>
        <div className="flex gap-4 mb-6">
          <div className="flex-1 border border-black p-4 rounded-lg bg-slate-50">
            <p className="text-xs font-bold">المعلم: {submission.teacher?.full_name}</p>
            <p className="text-xs font-bold">المادة: {submission.subject}</p>
          </div>
          <div className="w-40 border-2 border-black p-4 rounded-lg text-center">
            <p className="text-[10px] font-bold">المجموع المئوي</p>
            <p className="text-3xl font-black">{totalScore}%</p>
          </div>
        </div>
        <table className="w-full border-collapse text-[10px] text-center">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-black p-2">م</th>
              <th className="border border-black p-2 text-right">معيار التقييم المعتمد</th>
              <th className="border border-black p-2">الوزن</th>
              <th className="border border-black p-2">المحقق</th>
            </tr>
          </thead>
          <tbody>
            {EVALUATION_CRITERIA.map((c, idx) => (
              <tr key={c.id}>
                <td className="border border-black p-2">{idx + 1}</td>
                <td className="border border-black p-2 text-right font-bold">{c.label}</td>
                <td className="border border-black p-2">{c.weight}%</td>
                <td className="border border-black p-2 font-black">{calculateWeighted(c.id).toFixed(1)}%</td>
              </tr>
            ))}
            <tr className="bg-slate-200 font-black h-10 border-t-2 border-black">
              <td colSpan={2} className="border border-black p-2 text-right">إجمالي التقييم الرقمي</td>
              <td className="border border-black p-2">100%</td>
              <td className="border border-black p-2 text-[14px]">{totalScore}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* نافذة التفاعل */}
      <div className="print:hidden bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden">
        <div className="p-6 bg-moe-navy text-white flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-moe-teal rounded-2xl flex items-center justify-center text-2xl shadow-lg">📊</div>
            <div>
              <h2 className="text-xl font-black">نظام الجمع المئوي المطور</h2>
              <p className="text-[10px] text-moe-teal font-bold uppercase">بإشراف: نايف الشهري</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-2xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50">
          <div className="grid lg:grid-cols-2 gap-12">
            <div className="space-y-4">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
                <span>المعايير (توزيع 10% و 5%)</span>
                <span>الدرجة من 5</span>
              </h3>
              <div className="grid gap-2">
                {EVALUATION_CRITERIA.map(c => (
                  <div key={c.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex justify-between items-center hover:border-moe-teal transition-all shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-slate-700">{c.label}</span>
                      <span className="text-[9px] font-black text-moe-teal mt-1">المحقق: {calculateWeighted(c.id).toFixed(1)}% من {c.weight}%</span>
                    </div>
                    <select 
                      disabled={isViewOnly}
                      value={scores[c.id]} 
                      onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                      className="bg-slate-50 px-3 py-2 rounded-xl text-xs font-black text-moe-teal outline-none border border-transparent"
                    >
                      {[5,4,3,2,1,0].map(v => <option key={v} value={v}>تقدير {v}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-gradient-to-br from-moe-navy to-moe-teal p-10 rounded-[2.5rem] text-white text-center shadow-xl">
                <p className="text-xs font-bold opacity-70 mb-2">المجموع المئوي النهائي</p>
                <h4 className="text-8xl font-black tracking-tighter mb-4">{totalScore}%</h4>
                <div className={`text-2xl font-black px-8 py-2 bg-white/10 rounded-full inline-block ${gradeInfo.color}`}>
                  {gradeInfo.label}
                </div>
              </div>

              {isAnalyzing ? (
                <div className="bg-white p-8 rounded-[2rem] border-2 border-moe-teal text-center space-y-4 shadow-inner">
                  <div className="animate-spin text-3xl mx-auto">🌀</div>
                  <p className="text-sm font-black text-moe-teal">{analysisStatus}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {!isViewOnly && (
                    <>
                      <button onClick={runAIAnalysis} className="col-span-2 py-5 bg-white border-2 border-moe-teal text-moe-teal rounded-2xl font-black hover:bg-moe-teal hover:text-white transition-all shadow-md">
                        ⚡ تحليل الشواهد واقتراح الأوزان
                      </button>
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-5 bg-moe-navy text-white rounded-2xl font-black shadow-lg">
                        {isSaving ? 'جاري الحفظ...' : 'اعتماد التقييم المئوي'}
                      </button>
                      <button onClick={() => window.print()} className="py-5 bg-slate-100 text-moe-navy rounded-2xl font-black">
                        📄 طباعة التقرير الرقمي
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <h4 className="text-[11px] font-black text-slate-400 mb-4 uppercase">التبرير التربوي للنسب الممنوحة:</h4>
                <div className="w-full h-40 text-xs font-bold leading-relaxed bg-slate-50/50 p-4 rounded-xl overflow-y-auto whitespace-pre-wrap text-slate-700">
                  {justification || 'سيظهر تحليل الخبير التربوي المئوي هنا بعد بدء العملية...'}
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
