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

  useEffect(() => { loadExisting(); }, [submission.id]);

  const loadExisting = async () => {
    try {
      const { data } = await supabase.from('evaluations').select('*').eq('submission_id', submission.id).maybeSingle();
      if (data) {
        if (data.scores) {
          const norm: Record<number, number> = {};
          Object.entries(data.scores).forEach(([k, v]) => norm[Number(k)] = Number(v));
          setScores(norm);
        }
        // محاولة استعادة المبررات من التحليل المخزن
        if (data.ai_analysis) {
          const lines = data.ai_analysis.split('\n');
          const recLine = lines.find(l => l.startsWith('التوصية:'));
          if (recLine) setRecommendation(recLine.replace('التوصية:', '').trim());
          
          const strLine = lines.find(l => l.startsWith('نقاط القوة:'));
          if (strLine) setStrengths(strLine.replace('نقاط القوة:', '').split(', '));
          
          const jusLine = lines.find(l => l.startsWith('المبررات:'));
          if (jusLine) setJustifications(jusLine.replace('المبررات:', '').split(' | '));
        }
      }
    } catch (e) { console.error(e); }
  };

  const runAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setProgress({ current: 0, total: 0, status: 'جاري مسح المجلد الشامل للملفات...' });

    try {
      const scan = await fetch('/api/drive/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: submission.drive_link })
      });
      const { files, error } = await scan.json();
      if (error) throw new Error(error);
      
      let findings = "";
      setProgress({ current: 0, total: files.length, status: `تم العثور على ${files.length} مستندات...` });

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(p => ({ ...p, current: i + 1, status: `فحص تربوي لملف: ${file.name}...` }));
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'partial', fileId: file.id, mimeType: file.mimeType, fileName: file.name })
        });
        const data = await res.json();
        if (data.findings) findings += `[المستند: ${file.name}]:\n${data.findings}\n\n`;
      }

      setProgress(p => ({ ...p, status: 'جاري محاكاة قرار المشرف التربوي واستخراج الدرجات...' }));
      const final = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'final', previousFindings: findings })
      });
      const result = await final.json();

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
      alert(`خطأ في المعالجة: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const total = () => {
    let t = 0;
    EVALUATION_CRITERIA.forEach(c => { t += ((scores[c.id] || 0) / 5) * c.weight; });
    return Math.round(t * 10) / 10;
  };

  const totalScore = total();
  const getGrade = (t: number) => {
    if (t >= 90) return { label: 'ممتاز / أداء رائد', color: 'text-emerald-600', bg: 'bg-emerald-50' };
    if (t >= 80) return { label: 'جيد جداً / أداء قوي', color: 'text-blue-600', bg: 'bg-blue-50' };
    if (t >= 70) return { label: 'جيد / أداء مقبول', color: 'text-cyan-600', bg: 'bg-cyan-50' };
    return { label: 'يحتاج تطوير مكثف', color: 'text-red-600', bg: 'bg-red-50' };
  };
  const grade = getGrade(totalScore);

  const save = async () => {
    setIsSaving(true);
    try {
      const analysis = `المبررات: ${justifications.join(' | ')}\nنقاط القوة: ${strengths.join(', ')}\nنقاط التطوير: ${weaknesses.join(', ')}\nالتوصية: ${recommendation}`;
      await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: analysis,
        scores: scores,
        total_score: totalScore,
        overall_grade: grade.label,
      }, { onConflict: 'submission_id' });
      await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      alert('✅ تم اعتماد القرار التربوي بنجاح');
      onClose();
    } catch (e) { alert('خطأ في الحفظ'); } finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl overflow-y-auto">
      <div className="bg-white w-full max-w-7xl rounded-[3rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden border border-white/20">
        
        {/* Header */}
        <div className="p-8 bg-[#0d333f] text-white flex justify-between items-center no-print">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-[#009688] rounded-2xl flex items-center justify-center text-3xl shadow-xl">⚖️</div>
            <div>
              <h2 className="text-2xl font-black">مركز التدقيق والقرار التربوي</h2>
              <p className="text-[11px] text-[#009688] font-black uppercase tracking-widest">تحليل معمق لشواهد الأداء الوظيفي</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-xl transition-all">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-[#f8fafc]">
          <div className="grid lg:grid-cols-2 gap-16">
            
            {/* Left: Criteria List */}
            <div className="space-y-6">
              <div className="flex justify-between items-center px-4">
                 <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">مصفوفة التقييم والتدليل</h3>
                 <span className="text-[10px] font-bold text-moe-teal bg-teal-50 px-3 py-1 rounded-full">النتائج آلية</span>
              </div>
              <div className="grid gap-4">
                {EVALUATION_CRITERIA.map((c, idx) => (
                  <div key={c.id} className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:border-moe-teal transition-all group overflow-hidden relative">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <span className="text-sm font-black text-slate-800 block mb-2">{c.label}</span>
                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                           <p className="text-[10px] text-slate-500 font-bold leading-relaxed italic">
                             {justifications[idx] || 'بانتظار التحليل المهني لاستخراج مبرر الدرجة...'}
                           </p>
                        </div>
                      </div>
                      <div className="mr-6 flex flex-col items-center">
                         <div className="text-3xl font-black text-moe-navy mb-1">{scores[c.id]}</div>
                         <span className="text-[8px] font-black text-slate-400">/ 5</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-50 flex items-center gap-3">
                       <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="bg-moe-teal h-full transition-all duration-1000 shadow-sm" style={{ width: `${(scores[c.id] / 5) * 100}%` }} />
                       </div>
                       <span className="text-[10px] font-black text-moe-teal">وزن {c.weight}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Decision Panel */}
            <div className="space-y-10">
              <div className="bg-[#0d333f] p-12 rounded-[3.5rem] text-white text-center shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/5 to-transparent opacity-50"></div>
                <p className="text-xs font-bold opacity-60 mb-2 tracking-[0.3em] uppercase">المحصلة النهائية للأداء</p>
                <h4 className="text-9xl font-black mb-6 tracking-tighter group-hover:scale-110 transition-transform duration-700">{totalScore}%</h4>
                <div className={`px-10 py-4 rounded-full inline-block font-black text-sm shadow-2xl ${grade.color} ${grade.bg} border-2 border-white/10`}>
                  {grade.label}
                </div>
              </div>

              {isAnalyzing ? (
                <div className="bg-white p-16 rounded-[3rem] border-2 border-dashed border-moe-teal/30 text-center space-y-8 shadow-inner">
                  <div className="relative w-24 h-24 mx-auto">
                     <div className="absolute inset-0 border-4 border-moe-teal/10 rounded-full"></div>
                     <div className="absolute inset-0 border-4 border-moe-teal border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <div className="space-y-4">
                    <p className="font-black text-2xl text-[#0d333f] tracking-tight">{progress.status}</p>
                    <div className="w-64 mx-auto bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-moe-teal h-full transition-all duration-500" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {!isViewOnly && (
                    <button onClick={runAnalysis} className="w-full py-8 bg-moe-teal text-white rounded-[2.5rem] font-black shadow-2xl hover:brightness-110 hover:scale-[1.01] active:scale-[0.98] transition-all text-xl flex items-center justify-center gap-4 group">
                      <span className="group-hover:rotate-12 transition-transform">🚀</span>
                      إصدار القرار التربوي النهائي
                    </button>
                  )}

                  {/* Summary Box */}
                  <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-lg space-y-10">
                    <div className="grid grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                             <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> نقاط التميز
                          </h5>
                          <div className="space-y-2">
                             {strengths.map((s,i) => <div key={i} className="text-xs font-bold text-slate-700 bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50">{s}</div>)}
                             {strengths.length === 0 && <p className="text-[10px] text-slate-400 italic">بانتظار التقييم...</p>}
                          </div>
                       </div>
                       <div className="space-y-4">
                          <h5 className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
                             <span className="w-2 h-2 bg-amber-500 rounded-full"></span> فرص التحسين
                          </h5>
                          <div className="space-y-2">
                             {weaknesses.map((w,i) => <div key={i} className="text-xs font-bold text-slate-700 bg-amber-50/50 p-3 rounded-xl border border-amber-100/50">{w}</div>)}
                             {weaknesses.length === 0 && <p className="text-[10px] text-slate-400 italic">بانتظار التقييم...</p>}
                          </div>
                       </div>
                    </div>

                    {recommendation && (
                      <div className="p-8 bg-slate-900 text-white rounded-[2.5rem] text-center relative overflow-hidden group">
                         <div className="absolute top-0 right-0 w-32 h-32 bg-moe-teal/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:bg-moe-teal/40 transition-colors"></div>
                         <h6 className="text-[9px] font-black text-moe-teal uppercase mb-4 tracking-[0.2em]">توصية الخبير التربوي:</h6>
                         <p className="text-sm font-bold leading-relaxed italic relative z-10 text-slate-200">"{recommendation}"</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-6 no-print">
                    {!isViewOnly && (
                      <button onClick={save} disabled={isSaving} className="py-6 bg-[#0d333f] text-white rounded-[2rem] font-black shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3">
                         {isSaving ? 'جاري الاعتماد...' : '✅ اعتماد النتيجة'}
                      </button>
                    )}
                    <button onClick={() => window.print()} className="py-6 bg-white border-2 border-slate-100 text-[#0d333f] rounded-[2rem] font-black hover:bg-slate-50 transition-all flex items-center justify-center gap-3">
                       🖨️ طباعة التقرير
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