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
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '', step: 1 });
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
          const jusPart = lines.find(l => l.startsWith('المبررات:'))?.replace('المبررات:', '').trim();
          setJustifications(jusPart ? jusPart.split(' | ') : []);
          
          const strPart = lines.find(l => l.startsWith('نقاط القوة:'))?.replace('نقاط القوة:', '').trim();
          setStrengths(strPart ? strPart.split(', ') : []);
          
          const weakPart = lines.find(l => l.startsWith('نقاط التطوير:'))?.replace('نقاط التطوير:', '').trim();
          setWeaknesses(weakPart ? weakPart.split(', ') : []);
          
          const recPart = lines.find(l => l.startsWith('التوصية:'))?.replace('التوصية:', '').trim();
          setRecommendation(recPart || '');
        }
      }
    } catch (e) { console.error(e); }
  };

  const runDecisionProcess = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setProgress({ current: 0, total: 0, status: 'جاري الاتصال بقاعدة بيانات Google Drive...', step: 1 });

    try {
      // 1. Scan Folder
      const scanRes = await fetch('/api/drive/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: submission.drive_link })
      });
      const { files, error: scanErr } = await scanRes.json();
      if (scanErr) throw new Error(scanErr);
      if (!files || files.length === 0) throw new Error("المجلد فارغ أو لا يحتوي على ملفات مدعومة (PDF/صور)");
      
      let allEvidence = "";
      setProgress({ current: 0, total: files.length, status: `تم العثور على ${files.length} ملفات. جاري استخراج الشواهد...`, step: 2 });

      // 2. Partial Analysis (Evidence Extraction)
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(p => ({ ...p, current: i + 1, status: `جاري فحص تربوي دقيق للملف: ${file.name}...` }));
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'partial', fileId: file.id, mimeType: file.mimeType, fileName: file.name })
        });
        const data = await res.json();
        if (data.findings) allEvidence += `--- بداية شواهد ملف (${file.name}) ---\n${data.findings}\n--- نهاية شواهد الملف ---\n\n`;
      }

      // 3. Final Decision (Expert Logic)
      setProgress(p => ({ ...p, status: 'جاري انعقاد لجنة التحكيم الرقمية لإصدار الدرجات والمبررات...', step: 3 }));
      const finalRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'final', previousFindings: allEvidence })
      });
      const result = await finalRes.json();

      if (result.scores) {
        // تحديث الواجهة فوراً بالنتائج
        const norm: Record<number, number> = {};
        Object.entries(result.scores).forEach(([k, v]) => norm[Number(k)] = Number(v));
        setScores(norm);
        setJustifications(result.justifications || []);
        setStrengths(result.strengths || []);
        setWeaknesses(result.weaknesses || []);
        setRecommendation(result.recommendation || '');
        
        // حفظ تلقائي للنتيجة بعد التحليل
        const fullReport = `المبررات: ${(result.justifications || []).join(' | ')}\nنقاط القوة: ${(result.strengths || []).join(', ')}\nنقاط التطوير: ${(result.weaknesses || []).join(', ')}\nالتوصية: ${result.recommendation || ''}`;
        await supabase.from('evaluations').upsert({
          submission_id: submission.id,
          teacher_id: submission.teacher_id,
          ai_analysis: fullReport,
          scores: norm,
          total_score: calculateScore(norm),
          overall_grade: getGradeStyle(calculateScore(norm)).label,
        }, { onConflict: 'submission_id' });
        
        await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      }
    } catch (err: any) {
      alert(`عذراً، حدث خطأ: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const calculateScore = (currentScores: Record<number, number>) => {
    let t = 0;
    EVALUATION_CRITERIA.forEach(c => { t += ((currentScores[c.id] || 0) / 5) * c.weight; });
    return Math.round(t * 10) / 10;
  };

  const totalScore = calculateScore(scores);
  
  function getGradeStyle(t: number) {
    if (t >= 90) return { label: 'ممتاز / أداء رائد', color: 'text-emerald-600', bg: 'bg-emerald-50' };
    if (t >= 80) return { label: 'جيد جداً / أداء قوي', color: 'text-blue-600', bg: 'bg-blue-50' };
    if (t >= 70) return { label: 'جيد / أداء مقبول', color: 'text-cyan-600', bg: 'bg-cyan-50' };
    return { label: 'يحتاج تطوير مكثف / فجوات أداء', color: 'text-red-600', bg: 'bg-red-50' };
  }
  
  const grade = getGradeStyle(totalScore);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/98 backdrop-blur-2xl overflow-y-auto">
      <div className="bg-white w-full max-w-7xl rounded-[4rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col max-h-[96vh] overflow-hidden border-4 border-white/20 relative">
        
        {/* Loading Overlay - يظهر أثناء التحليل فقط */}
        {isAnalyzing && (
          <div className="absolute inset-0 z-[300] bg-[#0d333f]/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-10 space-y-12 animate-in fade-in duration-500">
             <div className="relative">
                <div className="w-40 h-40 border-8 border-white/5 rounded-full"></div>
                <div className="absolute inset-0 border-8 border-moe-teal border-t-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-4xl">🔎</div>
             </div>
             
             <div className="max-w-2xl space-y-6">
                <h2 className="text-4xl font-black text-white tracking-tight leading-tight">
                   {progress.step === 1 && "جاري الاتصال بالدليل الرقمي..."}
                   {progress.step === 2 && "المحرك التربوي يفحص المستندات الآن..."}
                   {progress.step === 3 && "لجنة التحكيم تصيغ القرار النهائي..."}
                </h2>
                <p className="text-moe-teal text-xl font-bold animate-pulse">{progress.status}</p>
                
                <div className="w-full bg-white/5 h-4 rounded-full overflow-hidden border border-white/10 p-1">
                   <div 
                     className="bg-gradient-to-r from-moe-teal to-emerald-400 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(0,150,136,0.5)]" 
                     style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }} 
                   />
                </div>
                
                <div className="flex justify-center gap-8 text-white/40 text-[10px] font-black uppercase tracking-widest">
                   <span className={progress.step >= 1 ? "text-moe-teal" : ""}>1. المسح الضوئي</span>
                   <span className={progress.step >= 2 ? "text-moe-teal" : ""}>2. استخراج الشواهد</span>
                   <span className={progress.step >= 3 ? "text-moe-teal" : ""}>3. الاعتماد التربوي</span>
                </div>
             </div>
             
             <div className="bg-white/5 p-6 rounded-3xl border border-white/10 max-w-lg">
                <p className="text-white/60 text-xs leading-relaxed font-bold italic">
                   "يرجى عدم إغلاق النافذة.. الخبير الرقمي يقوم بمراجعة دقيقة لكل ورقة لضمان عدالة التقييم ومهنية المبررات."
                </p>
             </div>
          </div>
        )}

        {/* Modal Header */}
        <div className="p-8 bg-[#0d333f] text-white flex justify-between items-center no-print shrink-0">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-[#009688] rounded-[1.5rem] flex items-center justify-center text-3xl shadow-2xl rotate-3">⚖️</div>
            <div>
              <h2 className="text-2xl font-black">المحضر الرسمي لتقييم الأداء</h2>
              <p className="text-[10px] text-moe-teal font-black uppercase tracking-[0.2em] mt-1">نظام التحليل الرقمي المعتمد | Gemini 3 Pro</p>
            </div>
          </div>
          <button onClick={onClose} className="w-14 h-14 rounded-2xl bg-white/5 hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center text-2xl transition-all border border-white/10">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-[#f8fafc]">
          <div className="grid lg:grid-cols-2 gap-16">
            
            {/* Right: Matrix */}
            <div className="space-y-6">
              <div className="flex justify-between items-center px-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">مصفوفة التقييم والتدليل</h3>
                {totalScore > 0 && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-100 animate-bounce">تم استخراج النتائج آلياً ✅</span>}
              </div>
              
              <div className="grid gap-5">
                {EVALUATION_CRITERIA.map((c, idx) => (
                  <div key={c.id} className="p-6 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all group relative overflow-hidden">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <span className="text-sm font-black text-slate-800 block mb-3 group-hover:text-moe-teal transition-colors">{c.label}</span>
                        <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100 group-hover:bg-white transition-all">
                           <p className="text-[10px] text-slate-500 font-bold leading-relaxed italic">
                             {justifications[idx] || 'بانتظار التحليل المهني لاستخراج مبرر الدرجة بناءً على الشواهد المرفقة...'}
                           </p>
                        </div>
                      </div>
                      <div className="mr-8 flex flex-col items-center">
                         <div className={`text-4xl font-black ${scores[c.id] > 0 ? 'text-[#0d333f]' : 'text-slate-200'} mb-1`}>{scores[c.id]}</div>
                         <span className="text-[9px] font-black text-slate-300">/ 5</span>
                      </div>
                    </div>
                    <div className="mt-5 pt-4 border-t border-slate-50 flex items-center gap-4">
                       <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden p-0.5">
                          <div className="bg-moe-teal h-full rounded-full transition-all duration-[2s] ease-out shadow-sm shadow-moe-teal/20" style={{ width: `${(scores[c.id] / 5) * 100}%` }} />
                       </div>
                       <span className="text-[9px] font-black text-moe-teal opacity-60">الوزن النسبي {c.weight}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Left: Final Decision */}
            <div className="space-y-12">
              {/* Score Card */}
              <div className="bg-[#0d333f] p-16 rounded-[4.5rem] text-white text-center shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent opacity-20 group-hover:opacity-40 transition-opacity"></div>
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-moe-teal/20 rounded-full blur-[80px]"></div>
                
                <p className="text-xs font-bold opacity-60 mb-4 tracking-[0.5em] uppercase relative z-10">المعدل العام للأداء الرقمي</p>
                <h4 className="text-[11rem] font-black leading-none mb-8 tracking-tighter relative z-10 group-hover:scale-110 transition-transform duration-1000">{totalScore}%</h4>
                
                <div className={`px-14 py-5 rounded-full inline-block font-black text-base shadow-2xl ${grade.color} ${grade.bg} border-4 border-white/10 relative z-10 animate-in zoom-in duration-700`}>
                  {grade.label}
                </div>
              </div>

              {/* Action & Results Panel */}
              <div className="space-y-8">
                {!isViewOnly && totalScore === 0 && (
                  <button 
                    onClick={runDecisionProcess} 
                    className="w-full py-10 bg-moe-teal text-white rounded-[3rem] font-black shadow-2xl hover:brightness-110 hover:translate-y-[-4px] active:scale-95 transition-all text-2xl flex items-center justify-center gap-6 group"
                  >
                    <span className="text-4xl group-hover:rotate-12 transition-transform duration-500">🚀</span>
                    إصدار القرار التربوي الصارم
                  </button>
                )}

                {/* AI Observations */}
                <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-xl space-y-12">
                  <div className="grid grid-cols-2 gap-12">
                     <div className="space-y-6">
                        <h5 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-3">
                           <span className="w-4 h-4 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/40"></span> نقاط التميز المكتشفة
                        </h5>
                        <div className="space-y-3">
                           {strengths.map((s,i) => <div key={i} className="text-xs font-bold text-slate-700 bg-emerald-50/40 p-5 rounded-3xl border border-emerald-100/50 hover:bg-emerald-100 transition-colors animate-in slide-in-from-right-4 duration-500" style={{animationDelay: `${i*100}ms`}}>✅ {s}</div>)}
                           {strengths.length === 0 && <p className="text-[11px] text-slate-400 italic font-bold text-center py-6">بانتظار التقييم لتدوين التميز...</p>}
                        </div>
                     </div>
                     <div className="space-y-6">
                        <h5 className="text-[11px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-3">
                           <span className="w-4 h-4 bg-amber-500 rounded-full shadow-lg shadow-amber-500/40"></span> فرص التطوير (الفجوات)
                        </h5>
                        <div className="space-y-3">
                           {weaknesses.map((w,i) => <div key={i} className="text-xs font-bold text-slate-700 bg-amber-50/40 p-5 rounded-3xl border border-amber-100/50 hover:bg-amber-100 transition-colors animate-in slide-in-from-right-4 duration-500" style={{animationDelay: `${i*100}ms`}}>⚠ {w}</div>)}
                           {weaknesses.length === 0 && <p className="text-[11px] text-slate-400 italic font-bold text-center py-6">بانتظار التقييم لتدوين الفجوات...</p>}
                        </div>
                     </div>
                  </div>

                  {recommendation && (
                    <div className="p-12 bg-[#0d333f] text-white rounded-[3.5rem] text-center relative overflow-hidden group border-4 border-moe-teal/20 shadow-2xl">
                       <div className="absolute top-0 right-0 w-64 h-64 bg-moe-teal/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl group-hover:bg-moe-teal/20 transition-colors duration-1000"></div>
                       <h6 className="text-[10px] font-black text-moe-teal uppercase mb-6 tracking-[0.4em]">توصية المشرف التربوي النهائية:</h6>
                       <p className="text-xl font-bold leading-relaxed italic relative z-10 text-slate-100 animate-in fade-in duration-1000">"{recommendation}"</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-8 no-print">
                   <button onClick={() => window.print()} className="py-8 bg-white border-2 border-slate-200 text-[#0d333f] rounded-[2.5rem] font-black hover:bg-slate-50 transition-all flex items-center justify-center gap-4 text-xl shadow-lg">
                      🖨️ طباعة المحضر الرسمي
                   </button>
                   <button onClick={onClose} className="py-8 bg-slate-100 text-slate-500 rounded-[2.5rem] font-black hover:bg-slate-200 transition-all text-xl">
                      إغلاق النافذة
                   </button>
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