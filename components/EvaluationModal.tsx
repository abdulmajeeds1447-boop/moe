'use client';

import React, { useState, useEffect } from 'react';
import { Submission, EVALUATION_CRITERIA } from '../types';
import { supabase } from '../services/supabaseClient';

interface EvaluationModalProps {
  submission: Submission;
  onClose: () => void;
  isViewOnly?: boolean; 
}

const EvaluationModal: React.FC<EvaluationModalProps> = ({ submission, onClose, isViewOnly = false }) => {
  const [justification, setJustification] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressStatus, setProgressStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const [scores, setScores] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
  });

  const [justificationsList, setJustificationsList] = useState<string[]>([]);

  useEffect(() => { 
    loadExistingEvaluation(); 
  }, [submission.id]);

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
        const lines = (data.ai_analysis || '').split('\n');
        const jusPart = lines.find(l => l.startsWith('المبررات:'))?.replace('المبررات:', '').trim();
        if (jusPart) setJustificationsList(jusPart.split(' | '));
      }
    } catch (err) {
      console.error("Error loading evaluation:", err);
    }
  };

  const calculateTotal = () => {
    let total = 0;
    EVALUATION_CRITERIA.forEach(c => { 
      const rawScore = Number(scores[c.id] || 0);
      const weightedScore = (rawScore / 5) * c.weight;
      total += weightedScore;
    });
    return Math.min(100, Math.round(total)); 
  };

  const getGradeInfo = (t: number) => {
    if (t >= 90) return { label: 'ممتاز / رائد', value: 5, color: 'text-emerald-600' };
    if (t >= 80) return { label: 'جيد جداً / قوي', value: 4, color: 'text-blue-600' };
    if (t >= 70) return { label: 'جيد', value: 3, color: 'text-cyan-600' };
    if (t >= 60) return { label: 'مرضي / مقبول', value: 2, color: 'text-amber-600' };
    return { label: 'غير مرضي / ضعيف', value: 1, color: 'text-red-600' };
  };

  const totalScore = calculateTotal();
  const gradeInfo = getGradeInfo(totalScore);

  const runAIAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setProgressStatus('جاري مسح المجلد الرقمي واستخراج الشواهد...');

    try {
      // 1. مسح المجلد
      const scanRes = await fetch('/api/drive/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: submission.drive_link })
      });
      const scanData = await scanRes.json();
      if (!scanRes.ok) throw new Error(scanData.error || 'فشل الوصول للمجلد');

      const files = scanData.files || [];
      if (files.length === 0) throw new Error("المجلد المرفق لا يحتوي على أي ملفات PDF أو صور.");

      // 2. التحليل الشامل
      setProgressStatus(`تم اكتشاف ${files.length} شواهد. جاري التحليل الرقمي العميق الآن...`);
      
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mode: 'bulk_analysis', 
          files: files.slice(0, 12) // نرسل أول 12 ملفاً فقط لضمان سرعة الطلب
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'فشل في عملية التحليل الذكي');

      // 3. تحديث الواجهة بالنتائج
      if (data.scores) {
        setJustificationsList(data.justifications || []);
        const newScores: Record<number, number> = {};
        Object.entries(data.scores).forEach(([k, v]) => newScores[Number(k)] = Number(v));
        setScores(newScores);

        const fullReport = `المبررات: ${(data.justifications || []).join(' | ')}\nنقاط القوة: ${(data.strengths || []).join(', ')}\nنقاط التطوير: ${(data.weaknesses || []).join(', ')}\nالتوصية: ${data.recommendation || ''}`;
        setJustification(fullReport);
      }

    } catch (err: any) {
      alert(`تنبيه: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
      setProgressStatus('');
    }
  };

  const saveEvaluation = async () => {
    if (isViewOnly) return;
    setIsSaving(true);
    try {
      const total = calculateTotal();
      const info = getGradeInfo(total);
      
      const { error } = await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: justification,
        scores: scores,
        total_score: total,
        overall_grade: info.label,
      }, { onConflict: 'submission_id' });
      
      if (error) throw error;
      await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      alert('✅ تم حفظ واعتماد التقييم الرقمي بنجاح');
      onClose();
    } catch (err) { alert('حدث خطأ أثناء حفظ التقييم'); } finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/98 backdrop-blur-2xl overflow-y-auto">
      
      <style type="text/css" media="print">
        {`@page { size: A4; margin: 0; } body { visibility: hidden; } .print-container { visibility: visible; display: flex !important; flex-direction: column; position: fixed; top: 0; left: 0; width: 210mm; height: 297mm; background: white; z-index: 9999; padding: 15mm; box-sizing: border-box; }`}
      </style>

      {isAnalyzing && (
        <div className="absolute inset-0 z-[300] bg-[#0d333f]/98 flex flex-col items-center justify-center p-12 text-white text-center">
           <div className="w-40 h-40 border-8 border-moe-teal border-t-transparent rounded-full animate-spin mb-10 shadow-[0_0_50px_rgba(0,150,136,0.3)]"></div>
           <h2 className="text-4xl font-black mb-6 italic">جاري التحليل الرقمي الشامل</h2>
           <div className="px-8 py-4 bg-white/5 rounded-3xl border border-white/10 mb-8 max-w-xl">
             <p className="text-xl text-moe-teal font-bold animate-pulse">{progressStatus}</p>
           </div>
           <p className="opacity-40 text-sm font-bold tracking-widest uppercase">نظام التحليل التربوي المطور - الإصدار 3.0</p>
        </div>
      )}

      <div className="print:hidden bg-white w-full max-w-6xl rounded-[4rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden relative border-4 border-white/10">
        <div className="p-8 bg-moe-navy text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-moe-teal rounded-3xl flex items-center justify-center text-4xl shadow-2xl border border-white/10">🤖</div>
            <div>
              <h2 className="text-3xl font-black tracking-tight">نظام التحليل التربوي الذكي</h2>
              <p className="text-[10px] text-moe-teal font-black uppercase tracking-[0.4em] mt-1">المحرك المطور | معالجة الصور والنصوص</p>
            </div>
          </div>
          <button onClick={onClose} className="w-14 h-14 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-3xl transition-all">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-slate-50/50">
          <div className="grid lg:grid-cols-2 gap-20">
            
            <div className="space-y-8">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.5em] mb-4">مصفوفة التقييم المهني (0-5)</h3>
              <div className="grid gap-4">
                {EVALUATION_CRITERIA.map((c, idx) => (
                  <div key={c.id} className="p-6 bg-white rounded-[2.5rem] border border-slate-100 flex flex-col gap-4 shadow-sm hover:border-moe-teal transition-all group">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[13px] font-black text-slate-700">{c.label}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">الوزن النسبي: {c.weight}%</span>
                      </div>
                      <select 
                        disabled={isViewOnly}
                        value={scores[c.id]} 
                        onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                        className="bg-slate-50 px-6 py-2 rounded-2xl text-xs font-black text-moe-teal border-2 border-transparent focus:border-moe-teal outline-none transition-all shadow-inner"
                      >
                        {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    {justificationsList[idx] && (
                      <div className="p-4 bg-slate-50/50 rounded-2xl text-[10px] font-bold text-slate-500 italic border border-slate-100 leading-relaxed group-hover:bg-white transition-all">
                        🔍 الشاهد: {justificationsList[idx]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-12">
              <div className="bg-[#0d333f] p-20 rounded-[5rem] text-white text-center shadow-2xl relative flex flex-col items-center justify-center overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-moe-teal/20 blur-[100px] rounded-full"></div>
                <p className="text-xs font-black opacity-60 mb-6 uppercase tracking-[0.6em]">النتيجة النهائية المستحقة</p>
                <h4 className="text-[11rem] font-black tracking-tighter leading-none mb-8 drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]">{totalScore}%</h4>
                <div className={`px-16 py-5 rounded-full font-black text-xl shadow-2xl border-4 border-white/10 ${gradeInfo.color} bg-white transition-all`}>
                  {gradeInfo.label}
                </div>
              </div>

              <div className="grid gap-6">
                  <a href={submission.drive_link} target="_blank" rel="noopener noreferrer" className="py-6 bg-blue-50 text-blue-600 border-2 border-blue-100 rounded-[2.5rem] font-black flex items-center justify-center gap-4 hover:bg-blue-100 transition-all text-xl shadow-sm">
                    📂 معاينة مجلد الشواهد الأصلي
                  </a>

                  {!isViewOnly && (
                    <>
                      <button onClick={runAIAnalysis} className="py-8 bg-moe-teal text-white rounded-[2.5rem] font-black shadow-[0_20px_40px_rgba(0,150,136,0.3)] hover:brightness-110 active:scale-95 transition-all text-2xl border-b-8 border-teal-800">
                        ⚡ بدء التحليل الشامل والذكي (AI)
                      </button>
                      
                      <div className="grid grid-cols-2 gap-6">
                        <button onClick={saveEvaluation} disabled={isSaving} className="py-7 bg-moe-navy text-white rounded-[2.5rem] font-black shadow-xl hover:bg-slate-800 transition-all text-xl border-b-8 border-black">
                          {isSaving ? 'جاري الحفظ...' : 'حفظ واعتماد'}
                        </button>
                        <button onClick={() => window.print()} className="py-7 bg-white border-2 border-slate-200 text-slate-600 rounded-[2.5rem] font-black hover:bg-slate-50 transition-all text-xl">
                          🖨️ طباعة المحضر
                        </button>
                      </div>
                    </>
                  )}
              </div>

              <div className="bg-white p-12 rounded-[4.5rem] border border-slate-100 shadow-xl space-y-8">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.5em] px-6">الملاحظات الختامية والتوصيات:</h4>
                <div className="w-full h-56 text-sm font-bold leading-relaxed bg-slate-50/50 p-10 rounded-[3.5rem] overflow-y-auto whitespace-pre-wrap text-slate-700 border border-slate-100 shadow-inner">
                  {justification || 'سيتم إدراج تقرير الخبرة التربوية هنا فور إتمام عملية التحليل الذكي...'}
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
