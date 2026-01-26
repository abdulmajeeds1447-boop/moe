
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
    // الدرجة من 5، نضربها في الوزن المقسم على 5
    return (rawScore / 5) * criterion.weight;
  };

  const calculateTotal = () => {
    let total = 0;
    EVALUATION_CRITERIA.forEach(c => { total += calculateWeighted(c.id); });
    return Math.min(100, Math.round(total * 10) / 10); 
  };

  const getGradeInfo = (t: number) => {
    if (t >= 90) return { label: 'ممتاز / أداء رائد', color: 'text-emerald-600' };
    if (t >= 80) return { label: 'جيد جداً / أداء قوي', color: 'text-blue-600' };
    if (t >= 70) return { label: 'جيد / أداء مقبول', color: 'text-cyan-600' };
    if (t >= 60) return { label: 'مرضي / يحتاج تطوير', color: 'text-amber-600' };
    return { label: 'غير مرضي / ضعف حاد', color: 'text-red-600' };
  };

  const totalScore = calculateTotal();
  const gradeInfo = getGradeInfo(totalScore);

  const runAIAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setAnalysisStatus('جاري تشغيل المدقق الفني (Auditor Pro Mode)...');
    
    try {
      const data = await analyzeTeacherReport(submission.drive_link, (attempt) => {
        setAnalysisStatus(`جاري فحص الشواهد ونقد المجلد (محاولة ${attempt}/3)`);
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
      alert('✅ تم اعتماد التقرير الفني بنجاح');
      onClose();
    } catch (err) { alert('خطأ في حفظ البيانات'); } finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-lg overflow-y-auto">
      <style type="text/css" media="print">
        {`@page { size: A4; margin: 0; } body { visibility: hidden; } .print-container, .print-container * { visibility: visible; } .print-container { position: fixed; top: 0; left: 0; width: 210mm; padding: 15mm; background: white; }`}
      </style>

      {/* تقرير الطباعة الرسمي المحدث */}
      <div className="print-container hidden font-['Tajawal'] text-black">
        <div className="flex justify-between items-center mb-6 border-b-4 border-[#0d333f] pb-4">
           <div className="text-[10px] font-bold">المملكة العربية السعودية<br/>وزارة التعليم<br/>ثانوية الأمير عبدالمجيد الأولى</div>
           <img src="https://up6.cc/2026/01/176840436497671.png" className="h-16 grayscale" alt="Logo" />
        </div>
        <h1 className="text-center text-xl font-black mb-6">بطاقة تدقيق الأداء الوظيفي الرقمي</h1>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="border border-black p-4 rounded-lg bg-slate-50">
            <p className="text-[10px] font-bold">اسم المعلم: {submission.teacher?.full_name}</p>
            <p className="text-[10px] font-bold">التخصص: {submission.subject}</p>
          </div>
          <div className="border-2 border-black p-4 rounded-lg text-center bg-slate-100">
            <p className="text-[9px] font-black">النتيجة النهائية المستحقة</p>
            <p className="text-4xl font-black">{totalScore}%</p>
            <p className="text-[10px] font-bold">{gradeInfo.label}</p>
          </div>
        </div>

        <table className="w-full border-collapse text-[9px] text-center mb-6">
          <thead>
            <tr className="bg-slate-200">
              <th className="border border-black p-2 w-10">م</th>
              <th className="border border-black p-2 text-right">معيار الجودة</th>
              <th className="border border-black p-2 w-20">الوزن النسبي</th>
              <th className="border border-black p-2 w-20">الدرجة المكتسبة</th>
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
            <tr className="bg-slate-100 font-black h-12 border-t-4 border-black text-[12px]">
              <td colSpan={2} className="border border-black p-2 text-right">إجمالي نقاط الأداء المكتسبة</td>
              <td className="border border-black p-2">100%</td>
              <td className="border border-black p-2">{totalScore}%</td>
            </tr>
          </tbody>
        </table>

        <div className="border border-black p-4 rounded-lg bg-slate-50">
          <p className="text-[10px] font-black mb-2 underline">تقرير التدقيق الفني (نقد الأدلة):</p>
          <p className="text-[9px] leading-relaxed whitespace-pre-wrap italic">{justification}</p>
        </div>

        <div className="mt-10 flex justify-between px-10">
           <div className="text-center"><p className="text-[10px] font-black">توقيع المعلم</p><p className="mt-4">.................</p></div>
           <div className="text-center"><p className="text-[10px] font-black">يعتمد مدير المدرسة: نايف الشهري</p><p className="mt-4">..................</p></div>
        </div>
      </div>

      <div className="print:hidden bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden border border-white/20">
        <div className="p-6 bg-[#0d333f] text-white flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-moe-teal rounded-2xl flex items-center justify-center text-2xl shadow-lg">🛡️</div>
            <div>
              <h2 className="text-xl font-black">مركز التدقيق الفني (Auditor Pro)</h2>
              <p className="text-[10px] text-moe-teal font-black tracking-widest uppercase">وضع التدقيق الصارم مفعل</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-xl transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-[#fbfcfd]">
          <div className="grid lg:grid-cols-2 gap-12">
            
            <div className="space-y-4">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">كشف المعايير والأوزان النسبية</h3>
              <div className="grid gap-2">
                {EVALUATION_CRITERIA.map(c => (
                  <div key={c.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex justify-between items-center hover:border-moe-teal transition-all group">
                    <div>
                      <span className="text-[11px] font-black text-slate-700 block">{c.label}</span>
                      <span className="text-[9px] text-slate-400 font-bold">الوزن: {c.weight}% | المكتسب: <span className="text-moe-teal font-black">{calculateWeighted(c.id).toFixed(1)}%</span></span>
                    </div>
                    <select 
                      disabled={isViewOnly}
                      value={scores[c.id]} 
                      onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                      className="bg-slate-50 px-4 py-2 rounded-xl text-xs font-black text-moe-teal outline-none border border-transparent focus:border-moe-teal/30 appearance-none text-center min-w-[80px]"
                    >
                      {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v === 0 ? '❌ 0' : `⭐ ${v}`}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-moe-navy p-10 rounded-[2.5rem] text-white text-center shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-moe-teal to-transparent" />
                <p className="text-xs font-bold opacity-60 mb-2 uppercase tracking-widest">إجمالي درجة الأداء</p>
                <h4 className="text-9xl font-black tracking-tighter mb-4">{totalScore}%</h4>
                <div className={`text-sm font-black px-8 py-2 bg-white/5 rounded-full border border-white/10 inline-block ${gradeInfo.color}`}>
                  {gradeInfo.label}
                </div>
              </div>

              {isAnalyzing ? (
                <div className="bg-white p-10 rounded-[2rem] border-2 border-moe-teal border-dashed text-center space-y-4">
                  <div className="w-12 h-12 border-4 border-moe-teal border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm font-black text-moe-teal animate-pulse">{analysisStatus}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {!isViewOnly && (
                    <>
                      <button onClick={runAIAnalysis} className="col-span-2 py-5 bg-moe-teal text-white rounded-2xl font-black shadow-lg hover:brightness-110 active:scale-[0.98] transition-all">
                        🔍 تشغيل التدقيق الفني المعتمد (Gemini 3 Pro)
                      </button>
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-5 bg-moe-navy text-white rounded-2xl font-black shadow-lg hover:brightness-125 transition-all">
                        {isSaving ? 'جاري الحفظ...' : 'اعتماد التقييم'}
                      </button>
                      <button onClick={() => window.print()} className="py-5 bg-white text-moe-navy border border-slate-200 rounded-2xl font-black hover:bg-slate-50 transition-all">
                        🖨️ طباعة التقرير
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative">
                <div className="absolute -top-3 right-8 bg-[#0d333f] px-4 py-1 rounded-full text-[10px] font-black text-white">تقرير المدقق (نقد الأدلة)</div>
                <div className="w-full h-64 text-sm font-bold leading-relaxed bg-slate-50/50 p-6 rounded-2xl overflow-y-auto whitespace-pre-wrap text-slate-600 border border-slate-50 custom-scrollbar">
                  {justification || 'اضغط على زر التدقيق أعلاه لفحص المجلد نقدياً...'}
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
