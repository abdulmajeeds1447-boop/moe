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
  const [justificationsList, setJustificationsList] = useState<string[]>([]);
  const [strengths, setStrengths] = useState<string[]>([]);
  const [weaknesses, setWeaknesses] = useState<string[]>([]);
  const [recommendation, setRecommendation] = useState('');
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [scores, setScores] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
  });

  useEffect(() => { loadExistingEvaluation(); }, [submission.id]);

  const loadExistingEvaluation = async () => {
    try {
      const { data } = await supabase.from('evaluations').select('*').eq('submission_id', submission.id).maybeSingle();
      if (data) {
        if (data.scores) {
          const normalized: Record<number, number> = {};
          Object.entries(data.scores).forEach(([k, v]) => normalized[Number(k)] = Number(v));
          setScores(normalized);
        }
        // استخراج التفاصيل من النص المخزن إذا وجد
        const analysisText = data.ai_analysis || '';
        if (analysisText.includes('نقاط القوة:')) {
           const parts = analysisText.split('\n');
           setRecommendation(parts.find(p => p.includes('التوصية:'))?.split(': ')[1] || '');
        }
      }
    } catch (e) { console.error("Load error:", e); }
  };

  const runAdvancedAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setProgress({ current: 0, total: 0, status: 'جاري فحص مجلد الشواهد...' });

    try {
      const scanRes = await fetch('/api/drive/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: submission.drive_link })
      });
      const { files, error: scanError } = await scanRes.json();
      if (scanError) throw new Error(scanError);
      
      let allFindings = "";
      setProgress({ current: 0, total: files.length, status: `تم اكتشاف ${files.length} ملفات...` });

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(p => ({ ...p, current: i + 1, status: `جاري تحليل: ${file.name}...` }));
        try {
          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'partial', fileId: file.id, mimeType: file.mimeType, fileName: file.name })
          });
          const data = await res.json();
          if (data.findings) allFindings += `[${file.name}]:\n${data.findings}\n\n`;
        } catch (e) {}
      }

      setProgress(p => ({ ...p, status: 'جاري إصدار القرار والتقرير النهائي...' }));
      const finalRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'final', previousFindings: allFindings })
      });
      const result = await finalRes.json();

      if (result.scores) {
        const normalizedScores: Record<number, number> = {};
        Object.entries(result.scores).forEach(([k, v]) => normalizedScores[Number(k)] = Number(v));
        
        setScores(normalizedScores);
        setJustificationsList(result.justifications || []);
        setStrengths(result.strengths || []);
        setWeaknesses(result.weaknesses || []);
        setRecommendation(result.recommendation || '');
      }
    } catch (err: any) {
      alert(`خطأ: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const calculateWeighted = (id: number) => {
    const criterion = EVALUATION_CRITERIA.find(c => c.id === id);
    return criterion ? ((scores[id] || 0) / 5) * criterion.weight : 0;
  };

  const calculateTotal = () => {
    let total = 0;
    EVALUATION_CRITERIA.forEach(c => { total += calculateWeighted(c.id); });
    return Math.round(total * 10) / 10;
  };

  const totalScore = calculateTotal();
  const getGradeInfo = (t: number) => {
    if (t >= 90) return { label: 'ممتاز / أداء رائد', color: 'text-emerald-600', bg: 'bg-emerald-50' };
    if (t >= 80) return { label: 'جيد جداً / أداء قوي', color: 'text-blue-600', bg: 'bg-blue-50' };
    if (t >= 70) return { label: 'جيد / أداء مقبول', color: 'text-cyan-600', bg: 'bg-cyan-50' };
    if (t >= 60) return { label: 'مرضي / يحتاج تطوير', color: 'text-amber-600', bg: 'bg-amber-50' };
    return { label: 'غير مرضي / ضعف حاد', color: 'text-red-600', bg: 'bg-red-50' };
  };
  const gradeInfo = getGradeInfo(totalScore);

  const saveEvaluation = async () => {
    setIsSaving(true);
    try {
      const fullAnalysis = `المبررات: ${justificationsList.join(' | ')}\nنقاط القوة: ${strengths.join(', ')}\nنقاط التطوير: ${weaknesses.join(', ')}\nالتوصية: ${recommendation}`;

      await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: fullAnalysis,
        scores: scores,
        total_score: totalScore,
        overall_grade: gradeInfo.label,
      }, { onConflict: 'submission_id' });
      
      await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      alert('✅ تم الاعتماد بنجاح');
      onClose();
    } catch (e) { alert('خطأ في الحفظ'); } finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl overflow-y-auto">
      <div className="bg-white w-full max-w-7xl rounded-[3.5rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-8 bg-[#0d333f] text-white flex justify-between items-center no-print border-b border-white/5">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-[#009688] rounded-3xl flex items-center justify-center text-3xl shadow-lg">🛡️</div>
            <div>
              <h2 className="text-2xl font-black">مركز التدقيق والقرار الرقمي</h2>
              <p className="text-[11px] text-[#009688] font-black uppercase tracking-widest">تحليل شامل لكافة مجلدات الشواهد</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-xl transition-all">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-[#f8fafc]">
          <div className="grid lg:grid-cols-2 gap-16">
            
            {/* Left Column: Metrics */}
            <div className="space-y-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">نتائج معايير الأداء المعتمدة</h3>
              <div className="grid gap-4">
                {EVALUATION_CRITERIA.map((c, idx) => (
                  <div key={c.id} className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm hover:border-moe-teal transition-all group">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <span className="text-sm font-black text-slate-800 block mb-1">{c.label}</span>
                        <p className="text-[10px] text-slate-500 font-bold leading-relaxed italic">
                          {justificationsList[idx] || 'بانتظار التحليل لاستخراج المبررات...'}
                        </p>
                      </div>
                      <div className="text-2xl font-black text-moe-teal bg-slate-50 w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner">
                        {scores[c.id]}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-3 border-t border-slate-50">
                       <span className="text-[9px] font-black text-slate-400">الوزن المكتسب:</span>
                       <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="bg-moe-teal h-full transition-all duration-700 shadow-sm shadow-moe-teal/20" style={{ width: `${(scores[c.id] / 5) * 100}%` }} />
                       </div>
                       <span className="text-[10px] font-black text-[#0d333f]">{calculateWeighted(c.id).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Decisions */}
            <div className="space-y-10">
              {/* Decision Box */}
              <div className="bg-[#0d333f] p-12 rounded-[3.5rem] text-white text-center shadow-2xl relative overflow-hidden">
                <p className="text-xs font-bold opacity-60 mb-2 tracking-widest uppercase">النسبة المئوية النهائية</p>
                <h4 className="text-9xl font-black mb-6 tracking-tighter">{totalScore}%</h4>
                <div className={`px-10 py-3 rounded-full inline-block font-black text-sm shadow-xl ${gradeInfo.color} ${gradeInfo.bg}`}>
                  {gradeInfo.label}
                </div>
              </div>

              {isAnalyzing ? (
                <div className="bg-white p-12 rounded-[3rem] border-2 border-dashed border-moe-teal/30 text-center space-y-8">
                  <div className="w-20 h-20 border-4 border-moe-teal border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <div className="space-y-3">
                    <p className="font-black text-xl text-[#0d333f]">{progress.status}</p>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-moe-teal h-full transition-all duration-500" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {!isViewOnly && (
                    <button onClick={runAdvancedAnalysis} className="w-full py-7 bg-moe-teal text-white rounded-[2rem] font-black shadow-2xl hover:scale-[1.01] transition-all text-xl">
                      🚀 تحليل المجلد بالكامل واستخراج المبررات
                    </button>
                  )}

                  {/* Analysis Summary */}
                  <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
                    {strengths.length > 0 && (
                      <div className="grid grid-cols-2 gap-6">
                        <div className="bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100">
                           <h5 className="text-[10px] font-black text-emerald-600 uppercase mb-3">نقاط التميز:</h5>
                           <ul className="space-y-2">
                             {strengths.map((s,i) => <li key={i} className="text-xs font-bold text-slate-700 flex items-start gap-2"><span>•</span> {s}</li>)}
                           </ul>
                        </div>
                        <div className="bg-amber-50/50 p-6 rounded-3xl border border-amber-100">
                           <h5 className="text-[10px] font-black text-amber-600 uppercase mb-3">مجالات التطوير:</h5>
                           <ul className="space-y-2">
                             {weaknesses.map((w,i) => <li key={i} className="text-xs font-bold text-slate-700 flex items-start gap-2"><span>•</span> {w}</li>)}
                           </ul>
                        </div>
                      </div>
                    )}

                    {recommendation && (
                      <div className="p-8 bg-[#0d333f] text-white rounded-[2rem] text-center">
                         <h6 className="text-[9px] font-black text-moe-teal uppercase tracking-widest mb-2">التوصية المهنية النهائية:</h6>
                         <p className="text-sm font-bold italic leading-relaxed">"{recommendation}"</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 no-print">
                    {!isViewOnly && (
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-6 bg-[#0d333f] text-white rounded-[1.8rem] font-black shadow-xl">
                        {isSaving ? 'جاري الحفظ...' : 'اعتماد التقرير'}
                      </button>
                    )}
                    <button onClick={() => window.print()} className="py-6 bg-white border-2 border-slate-100 text-[#0d333f] rounded-[1.8rem] font-black">
                      🖨️ طباعة المحضر
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