'use client';

import React, { useState, useEffect } from 'react';
import { Submission, EVALUATION_CRITERIA } from '../types.ts';
import { supabase } from '../services/supabaseClient.ts';

interface EvaluationModalProps {
  submission: Submission;
  onClose: () => void;
  isViewOnly?: boolean; 
}

const EvaluationModal: React.FC<EvaluationModalProps> = ({ submission, onClose, isViewOnly = false }) => {
  const [justifications, setJustifications] = useState<string[]>([]);
  const [strengths, setStrengths] = useState<string[]>([]);
  const [weaknesses, setWeaknesses] = useState<string[]>([]);
  const [recommendation, setRecommendation] = useState('');
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [scores, setScores] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
  });

  useEffect(() => { loadData(); }, [submission.id]);

  const loadData = async () => {
    try {
      const { data } = await supabase.from('evaluations').select('*').eq('submission_id', submission.id).maybeSingle();
      if (data) {
        if (data.scores) {
          const norm: Record<number, number> = {};
          Object.entries(data.scores).forEach(([k, v]) => norm[Number(k)] = Number(v));
          setScores(norm);
        }
        if (data.ai_analysis) {
          const lines = data.ai_analysis.split('\n');
          setJustifications(lines.find(l => l.startsWith('المبررات:'))?.replace('المبررات:', '').split(' | ') || []);
          setStrengths(lines.find(l => l.startsWith('نقاط القوة:'))?.replace('نقاط القوة:', '').split(', ') || []);
          setWeaknesses(lines.find(l => l.startsWith('نقاط التطوير:'))?.replace('نقاط التطوير:', '').split(', ') || []);
          setRecommendation(lines.find(l => l.startsWith('التوصية:'))?.replace('التوصية:', '').trim() || '');
        }
      }
    } catch (e) { console.error(e); }
  };

  const runDecisionProcess = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setProgress({ current: 0, total: 0, status: 'جاري استدعاء مصفوفة التقييم الوزارية...' });

    try {
      const scanRes = await fetch('/api/drive/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: submission.drive_link })
      });
      const { files, error: scanErr } = await scanRes.json();
      if (scanErr) throw new Error(scanErr);
      
      let allEvidence = "";
      setProgress({ current: 0, total: files.length, status: `تم اكتشاف ${files.length} مستنداً تربوياً...` });

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(p => ({ ...p, current: i + 1, status: `تحليل المستند: ${file.name}...` }));
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'partial', fileId: file.id, mimeType: file.mimeType, fileName: file.name })
        });
        const data = await res.json();
        if (data.findings) allEvidence += `[ملف: ${file.name}]:\n${data.findings}\n\n`;
      }

      setProgress(p => ({ ...p, status: 'جاري محاكاة لجنة التقييم وإصدار القرار التربوي...' }));
      const finalRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'final', previousFindings: allEvidence })
      });
      const result = await finalRes.json();

      if (result.scores) {
        const norm: Record<number, number> = {};
        Object.entries(result.scores).forEach(([k, v]) => norm[Number(k)] = Number(v));
        setScores(norm);
        setJustifications(result.justifications || []);
        setStrengths(result.strengths || []);
        setWeaknesses(result.weaknesses || []);
        setRecommendation(result.recommendation || '');
      }
    } catch (err: any) {
      alert(`عذراً، حدث خطأ تقني: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const calculateTotal = () => {
    let t = 0;
    EVALUATION_CRITERIA.forEach(c => { t += ((scores[c.id] || 0) / 5) * c.weight; });
    return Math.round(t * 10) / 10;
  };

  const totalScore = calculateTotal();
  const getGradeStyle = (t: number) => {
    if (t >= 90) return { label: 'ممتاز / أداء رائد', color: 'text-emerald-600', bg: 'bg-emerald-50' };
    if (t >= 80) return { label: 'جيد جداً / أداء قوي', color: 'text-blue-600', bg: 'bg-blue-50' };
    if (t >= 70) return { label: 'جيد / أداء مقبول', color: 'text-cyan-600', bg: 'bg-cyan-50' };
    return { label: 'يحتاج تطوير مكثف / فجوات أداء', color: 'text-red-600', bg: 'bg-red-50' };
  };
  const grade = getGradeStyle(totalScore);

  const saveDecision = async () => {
    setIsSaving(true);
    try {
      const fullReport = `المبررات: ${justifications.join(' | ')}\nنقاط القوة: ${strengths.join(', ')}\nنقاط التطوير: ${weaknesses.join(', ')}\nالتوصية: ${recommendation}`;
      await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: fullReport,
        scores: scores,
        total_score: totalScore,
        overall_grade: grade.label,
      }, { onConflict: 'submission_id' });
      await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      alert('✅ تم اعتماد القرار التربوي الصارم بنجاح');
      onClose();
    } catch (e) { alert('خطأ في الحفظ'); } finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl overflow-y-auto">
      <div className="bg-white w-full max-w-7xl rounded-[3rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden border border-white/20">
        
        {/* Header Section */}
        <div className="p-8 bg-[#0d333f] text-white flex justify-between items-center no-print">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-[#009688] rounded-2xl flex items-center justify-center text-3xl shadow-xl ring-4 ring-white/10">⚖️</div>
            <div>
              <h2 className="text-2xl font-black">قرار لجنة التدقيق التربوي</h2>
              <p className="text-[11px] text-[#009688] font-black uppercase tracking-widest">تحليل رقمي صارم ومعتمد</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-xl transition-all">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-[#f8fafc]">
          <div className="grid lg:grid-cols-2 gap-16">
            
            {/* Left Column: Detailed Criteria */}
            <div className="space-y-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-4">مصفوفة الدرجات والتدليل المهني</h3>
              <div className="grid gap-4">
                {EVALUATION_CRITERIA.map((c, idx) => (
                  <div key={c.id} className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:border-moe-teal transition-all group overflow-hidden relative">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <span className="text-sm font-black text-slate-800 block mb-2">{c.label}</span>
                        <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50 group-hover:bg-white transition-colors">
                           <p className="text-[10px] text-slate-500 font-bold leading-relaxed italic">
                             {justifications[idx] || 'بانتظار التحليل المهني لاستخراج مبرر الدرجة بناءً على الشواهد...'}
                           </p>
                        </div>
                      </div>
                      <div className="mr-8 flex flex-col items-center">
                         <div className={`text-4xl font-black ${scores[c.id] > 0 ? 'text-[#0d333f]' : 'text-slate-200'} mb-1`}>{scores[c.id]}</div>
                         <span className="text-[9px] font-black text-slate-300">/ 5</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-50 flex items-center gap-3">
                       <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="bg-moe-teal h-full transition-all duration-[1.5s] ease-out shadow-sm" style={{ width: `${(scores[c.id] / 5) * 100}%` }} />
                       </div>
                       <span className="text-[10px] font-black text-moe-teal opacity-70">وزن {c.weight}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Final Decision and Analysis */}
            <div className="space-y-10">
              {/* Main Score Display */}
              <div className="bg-[#0d333f] p-12 rounded-[4rem] text-white text-center shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent opacity-30"></div>
                <p className="text-xs font-bold opacity-60 mb-2 tracking-[0.4em] uppercase">المحصلة النهائية لقرار اللجنة</p>
                <h4 className="text-[10rem] font-black leading-none mb-6 tracking-tighter group-hover:scale-105 transition-transform duration-1000">{totalScore}%</h4>
                <div className={`px-12 py-4 rounded-full inline-block font-black text-sm shadow-2xl ${grade.color} ${grade.bg} border-4 border-white/5`}>
                  {grade.label}
                </div>
              </div>

              {isAnalyzing ? (
                <div className="bg-white p-16 rounded-[4rem] border-4 border-dashed border-moe-teal/20 text-center space-y-8 shadow-xl">
                  <div className="relative w-28 h-28 mx-auto">
                     <div className="absolute inset-0 border-8 border-moe-teal/5 rounded-full"></div>
                     <div className="absolute inset-0 border-8 border-moe-teal border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <div className="space-y-4">
                    <p className="font-black text-2xl text-[#0d333f] tracking-tight">{progress.status}</p>
                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                      <div className="bg-moe-teal h-full transition-all duration-700" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {!isViewOnly && (
                    <button onClick={runDecisionProcess} className="w-full py-9 bg-moe-teal text-white rounded-[2.5rem] font-black shadow-2xl hover:brightness-110 hover:translate-y-[-2px] transition-all text-2xl flex items-center justify-center gap-6 group">
                      <span className="group-hover:rotate-12 transition-transform duration-500">🚀</span>
                      إصدار القرار التربوي النهائي
                    </button>
                  )}

                  {/* Summary Box */}
                  <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-xl space-y-12">
                    <div className="grid grid-cols-2 gap-10">
                       <div className="space-y-5">
                          <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-3">
                             <span className="w-3 h-3 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/50"></span> نقاط التميز المكتشفة
                          </h5>
                          <div className="space-y-3">
                             {strengths.map((s,i) => <div key={i} className="text-xs font-bold text-slate-700 bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100/50 hover:bg-emerald-50 transition-colors">✓ {s}</div>)}
                             {strengths.length === 0 && <p className="text-[10px] text-slate-400 italic font-bold">بانتظار التقييم لتدوين نقاط التميز...</p>}
                          </div>
                       </div>
                       <div className="space-y-5">
                          <h5 className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-3">
                             <span className="w-3 h-3 bg-amber-500 rounded-full shadow-lg shadow-amber-500/50"></span> فجوات الأداء (فرص التحسين)
                          </h5>
                          <div className="space-y-3">
                             {weaknesses.map((w,i) => <div key={i} className="text-xs font-bold text-slate-700 bg-amber-50/30 p-4 rounded-2xl border border-amber-100/50 hover:bg-amber-50 transition-colors">⚠ {w}</div>)}
                             {weaknesses.length === 0 && <p className="text-[10px] text-slate-400 italic font-bold">بانتظار التقييم لتدوين الفجوات...</p>}
                          </div>
                       </div>
                    </div>

                    {recommendation && (
                      <div className="p-10 bg-[#0d333f] text-white rounded-[3rem] text-center relative overflow-hidden group border-4 border-moe-teal/20">
                         <div className="absolute top-0 right-0 w-48 h-48 bg-moe-teal/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                         <h6 className="text-[9px] font-black text-moe-teal uppercase mb-5 tracking-[0.3em]">توصية المشرف التربوي النهائية:</h6>
                         <p className="text-lg font-bold leading-relaxed italic relative z-10 text-slate-100">"{recommendation}"</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-6 no-print">
                    {!isViewOnly && (
                      <button onClick={saveDecision} disabled={isSaving} className="py-7 bg-[#0d333f] text-white rounded-[2rem] font-black shadow-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-4 text-lg">
                         {isSaving ? 'جاري الاعتماد الرسمي...' : '✅ اعتماد التقرير وحفظه'}
                      </button>
                    )}
                    <button onClick={() => window.print()} className="py-7 bg-white border-2 border-slate-200 text-[#0d333f] rounded-[2rem] font-black hover:bg-slate-50 transition-all flex items-center justify-center gap-4 text-lg shadow-sm">
                       🖨️ طباعة المحضر الرسمي
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationModal;