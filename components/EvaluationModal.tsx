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
  const [justification, setJustification] = useState('');
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
        setJustification(data.ai_analysis || '');
        if (data.scores) {
          const normalized: Record<number, number> = {};
          Object.entries(data.scores).forEach(([k, v]) => normalized[Number(k)] = Number(v));
          setScores(normalized);
        }
        // استعادة البيانات الإضافية إذا كانت مخزنة في JSON (يمكن توسيع الجدول لاحقاً)
        // حالياً سنعرضها من نص التحليل إذا كانت مدمجة
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
      if (!files || files.length === 0) throw new Error('لم يتم العثور على ملفات (PDF/صور) صالحة للتحليل');

      setProgress({ current: 0, total: files.length, status: `تم العثور على ${files.length} ملفات. يبدأ التدقيق الآن...` });

      let allFindings = "";
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(p => ({ ...p, current: i + 1, status: `تدقيق الشواهد في: ${file.name}...` }));

        const fileRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'partial', fileId: file.id, mimeType: file.mimeType, fileName: file.name })
        });
        const data = await fileRes.json();
        allFindings += `[مصدر: ${file.name}]\n${data.findings}\n\n`;
      }

      setProgress(p => ({ ...p, status: 'جاري معالجة كافة الشواهد وإصدار القرار والدرجات المستحقة...' }));
      const finalRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'final', previousFindings: allFindings })
      });
      const result = await finalRes.json();

      if (result.suggested_scores) {
        // تحديث المبررات والدرجات
        setJustification(result.justification || '');
        setStrengths(result.strengths || []);
        setWeaknesses(result.weaknesses || []);
        setRecommendation(result.recommendation || '');
        
        const newScores = { ...scores };
        Object.entries(result.suggested_scores).forEach(([k, v]) => {
          newScores[Number(k)] = Number(v);
        });
        setScores(newScores);
      }
    } catch (err: any) {
      alert(`عذراً، حدث خطأ أثناء التحليل: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const calculateWeighted = (id: number) => {
    const criterion = EVALUATION_CRITERIA.find(c => c.id === id);
    if (!criterion) return 0;
    return ((scores[id] || 0) / 5) * criterion.weight;
  };

  const calculateTotal = () => {
    let total = 0;
    EVALUATION_CRITERIA.forEach(c => { total += calculateWeighted(c.id); });
    return Math.min(100, Math.round(total * 10) / 10); 
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
      // دمج المبررات مع نقاط القوة والتوصيات للحفظ
      const fullAnalysisText = `
المبررات العامة: ${justification}
نقاط القوة: ${strengths.join(' - ')}
نقاط التطوير: ${weaknesses.join(' - ')}
التوصية الختامية: ${recommendation}
      `.trim();

      await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: fullAnalysisText,
        scores: scores,
        total_score: totalScore,
        overall_grade: gradeInfo.label,
      }, { onConflict: 'submission_id' });
      
      await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      alert('✅ تم اعتماد التقييم وإصدار التقرير النهائي بنجاح');
      onClose();
    } catch (e) { alert('خطأ في عملية الحفظ'); } finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl overflow-y-auto font-['Tajawal']">
      <div className="bg-white w-full max-w-7xl rounded-[3.5rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden border border-white/20">
        
        {/* Header */}
        <div className="p-8 bg-[#0d333f] text-white flex justify-between items-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#009688]/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
          <div className="flex items-center gap-6 relative z-10">
            <div className="w-16 h-16 bg-[#009688] rounded-3xl flex items-center justify-center text-3xl shadow-lg border border-white/10">🛡️</div>
            <div>
              <h2 className="text-2xl font-black">مركز التدقيق الفني (Auditor Pro)</h2>
              <p className="text-[11px] text-[#009688] font-black uppercase tracking-[0.2em]">نظام التدقيق الصارم مفعل</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-xl transition-all relative z-10">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-[#f8fafc]">
          <div className="grid lg:grid-cols-2 gap-16">
            
            {/* Left: Criteria & Grading */}
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">مصفوفة المعايير والأوزان النسبية</h3>
                <div className="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-500">مقياس 0 - 5</div>
              </div>
              <div className="grid gap-3">
                {EVALUATION_CRITERIA.map(c => (
                  <div key={c.id} className="p-5 bg-white rounded-[2rem] border border-slate-100 flex justify-between items-center group hover:border-moe-teal transition-all shadow-sm">
                    <div className="flex-1">
                      <span className="text-sm font-black text-slate-800 block mb-1">{c.label}</span>
                      <div className="flex items-center gap-3">
                         <span className="text-[10px] text-slate-400 font-bold">الوزن: {c.weight}%</span>
                         <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                         <span className="text-[10px] text-moe-teal font-black">المكتسب: {calculateWeighted(c.id).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       {scores[c.id] === 0 && <span className="text-red-400 text-xs font-bold px-2">❌ 0</span>}
                       <select 
                        disabled={isViewOnly || isAnalyzing}
                        value={scores[c.id]} 
                        onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                        className="bg-slate-50 px-4 py-2.5 rounded-2xl text-xs font-black outline-none border border-transparent focus:border-moe-teal focus:bg-white transition-all appearance-none text-center min-w-[70px]"
                      >
                        {[5,4,3,2,1,0].map(v => <option key={v} value={v}>⭐ {v}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: AI Analysis & Final Decision */}
            <div className="space-y-10">
              {/* Score Card */}
              <div className="bg-[#0d333f] p-12 rounded-[3.5rem] text-white text-center shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-[#009688]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                <p className="text-xs font-bold opacity-60 mb-4 tracking-widest">إجمالي درجة الأداء</p>
                <h4 className="text-9xl font-black mb-6 tracking-tighter">{totalScore}%</h4>
                <div className={`px-10 py-3 rounded-full inline-block font-black text-sm ${gradeInfo.color} ${gradeInfo.bg} shadow-xl`}>
                  {gradeInfo.label}
                </div>
              </div>

              {/* Action Buttons & Progress */}
              {isAnalyzing ? (
                <div className="bg-white p-12 rounded-[3rem] border-2 border-dashed border-moe-teal/30 text-center space-y-8 animate-in zoom-in-95 duration-500">
                  <div className="relative w-24 h-24 mx-auto">
                    <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-moe-teal rounded-full border-t-transparent animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center font-black text-moe-teal text-xs">AI</div>
                  </div>
                  <div className="space-y-3">
                    <p className="font-black text-xl text-[#0d333f]">{progress.status}</p>
                    <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-bold">
                       <span>جاري المعالجة</span>
                       <span className="w-1.5 h-1.5 bg-moe-teal rounded-full animate-ping"></span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-50 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-moe-teal h-full transition-all duration-700 ease-out" 
                      style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {!isViewOnly && (
                    <button 
                      onClick={runAdvancedAnalysis} 
                      className="w-full py-6 bg-moe-teal text-white rounded-[2rem] font-black shadow-xl shadow-moe-teal/20 hover:scale-[1.02] active:scale-[0.98] transition-all text-lg flex items-center justify-center gap-3"
                    >
                      🚀 تشغيل التدقيق الشامل واستخراج الدرجات
                    </button>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 no-print">
                    {!isViewOnly && (
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-5 bg-[#0d333f] text-white rounded-[1.8rem] font-black shadow-lg hover:brightness-125 transition-all">
                        {isSaving ? 'جاري الاعتماد...' : 'اعتماد التقرير نهائياً'}
                      </button>
                    )}
                    <button onClick={() => window.print()} className="py-5 bg-white border-2 border-slate-100 text-[#0d333f] rounded-[1.8rem] font-black hover:bg-slate-50 transition-all">
                      🖨️ طباعة محضر التقييم
                    </button>
                  </div>
                </div>
              )}

              {/* Insights Section */}
              <div className="space-y-6">
                {/* Justification */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-moe-teal rounded-full"></span> مبررات التقييم والقرار
                  </h4>
                  <div className="text-sm font-bold leading-relaxed text-slate-700 bg-slate-50 p-6 rounded-2xl min-h-[150px] whitespace-pre-wrap">
                    {justification || 'انتظار بدء عملية التدقيق لتحليل الشواهد...'}
                  </div>
                </div>

                {/* Recommendations & Feedback */}
                {(recommendation || strengths.length > 0) && (
                  <div className="bg-teal-50/50 p-8 rounded-[2.5rem] border border-teal-100 space-y-6 animate-in fade-in duration-700">
                    {strengths.length > 0 && (
                      <div>
                        <h5 className="text-[10px] font-black text-teal-600 mb-3 uppercase">نقاط التميز المرصودة:</h5>
                        <ul className="space-y-2">
                          {strengths.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs font-bold text-teal-800">
                              <span className="mt-1 text-teal-500">✓</span> {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {recommendation && (
                      <div className="pt-4 border-t border-teal-100">
                        <h5 className="text-[10px] font-black text-teal-600 mb-3 uppercase">توصية اللجنة النهائية:</h5>
                        <p className="text-xs font-black leading-relaxed text-[#0d333f] italic">
                          "{recommendation}"
                        </p>
                      </div>
                    )}
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