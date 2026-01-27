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
  const [isCoolingDown, setIsCoolingDown] = useState(false);
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
    } catch (err) { console.error(err); }
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
    if (t >= 90) return { label: 'ممتاز / رائد', color: 'text-emerald-600' };
    if (t >= 80) return { label: 'جيد جداً / قوي', color: 'text-blue-600' };
    if (t >= 70) return { label: 'جيد', color: 'text-cyan-600' };
    if (t >= 60) return { label: 'مرضي / مقبول', color: 'text-amber-600' };
    return { label: 'غير مرضي / ضعيف', color: 'text-red-600' };
  };

  const totalScore = calculateTotal();
  const gradeInfo = getGradeInfo(totalScore);

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // دالة جلب البيانات مع إعادة محاولة ذكية
  const fetchWithRetry = async (url: string, options: any, retries = 3): Promise<any> => {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      if (retries > 0) {
        setIsCoolingDown(true);
        setProgressStatus('الخوادم مزدحمة.. سأقوم بإعادة المحاولة تلقائياً خلال 25 ثانية، يرجى الانتظار...');
        await delay(25000); // انتظار 25 ثانية
        setIsCoolingDown(false);
        return fetchWithRetry(url, options, retries - 1);
      }
      throw new Error("عذراً، الخادم مزدحم جداً حالياً. يرجى المحاولة بعد دقيقة واحدة.");
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'فشل الاتصال');
    return data;
  };

  const runAIAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setProgressStatus('جاري جلب قائمة الشواهد من المجلد...');

    try {
      const scanRes = await fetch('/api/drive/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: submission.drive_link })
      });
      const scanData = await scanRes.json();
      if (!scanRes.ok) throw new Error(scanData.error);

      const files = scanData.files || [];
      if (files.length === 0) throw new Error("المجلد فارغ.");

      setProgressStatus('تم اكتشاف الملفات. جاري التحليل الرقمي الآن...');
      
      const data = await fetchWithRetry('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'bulk_analysis', files: files.slice(0, 6) })
      });

      if (data.scores) {
        setJustificationsList(data.justifications || []);
        const newScores: Record<number, number> = {};
        Object.entries(data.scores).forEach(([k, v]) => newScores[Number(k)] = Number(v));
        setScores(newScores);

        const fullReport = `المبررات: ${(data.justifications || []).join(' | ')}\nنقاط القوة: ${(data.strengths || []).join(', ')}\nنقاط التطوير: ${(data.weaknesses || []).join(', ')}\nالتوصية: ${data.recommendation || ''}`;
        setJustification(fullReport);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsAnalyzing(false);
      setProgressStatus('');
      setIsCoolingDown(false);
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
      alert('✅ تم الاعتماد بنجاح');
      onClose();
    } catch (err) { alert('خطأ في الحفظ'); } finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/98 backdrop-blur-2xl overflow-y-auto">
      
      {isAnalyzing && (
        <div className="absolute inset-0 z-[300] bg-moe-navy/98 flex flex-col items-center justify-center p-12 text-white text-center">
           <div className={`w-36 h-36 border-8 ${isCoolingDown ? 'border-amber-500 animate-pulse' : 'border-moe-teal animate-spin'} border-t-transparent rounded-full mb-10`}></div>
           <h2 className="text-3xl font-black mb-6">{isCoolingDown ? 'وضع التبريد النشط' : 'جاري التحليل الرقمي'}</h2>
           <div className={`px-10 py-5 rounded-3xl border ${isCoolingDown ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/5'} transition-colors`}>
             <p className={`text-xl font-bold ${isCoolingDown ? 'text-amber-400' : 'text-moe-teal'}`}>{progressStatus}</p>
           </div>
           <p className="mt-8 opacity-40 text-xs font-bold tracking-[0.2em]">نظام التقييم الذكي | معالجة قيود جوجل المجانية</p>
        </div>
      )}

      <div className="print:hidden bg-white w-full max-w-6xl rounded-[4rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden relative border-4 border-white/10">
        <div className="p-8 bg-moe-navy text-white flex justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-moe-teal rounded-3xl flex items-center justify-center text-3xl shadow-xl">📊</div>
            <div>
              <h2 className="text-2xl font-black">نظام التحليل التربوي الذكي</h2>
              <p className="text-[10px] text-moe-teal font-black uppercase tracking-[0.3em] mt-1">المحرك المطور | نظام تبريد الطلبات</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-2xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-slate-50/50">
          <div className="grid lg:grid-cols-2 gap-16">
            
            <div className="space-y-6">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.5em] mb-4">مصفوفة التقييم (0-5)</h3>
              <div className="grid gap-3">
                {EVALUATION_CRITERIA.map((c, idx) => (
                  <div key={c.id} className="p-5 bg-white rounded-[2rem] border border-slate-100 flex flex-col gap-3 shadow-sm hover:border-moe-teal transition-all">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[12px] font-black text-slate-700">{c.label}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">الوزن: {c.weight}%</span>
                      </div>
                      <select 
                        disabled={isViewOnly}
                        value={scores[c.id]} 
                        onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                        className="bg-slate-50 px-5 py-1.5 rounded-xl text-xs font-black text-moe-teal border-none outline-none"
                      >
                        {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    {justificationsList[idx] && (
                      <div className="p-3 bg-slate-50/50 rounded-xl text-[10px] font-bold text-slate-500 italic border border-slate-100 leading-relaxed">
                        🔍 الشاهد: {justificationsList[idx]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-10">
              <div className="bg-[#0d333f] p-16 rounded-[4.5rem] text-white text-center shadow-2xl flex flex-col items-center justify-center overflow-hidden">
                <p className="text-xs font-black opacity-60 mb-4 uppercase tracking-[0.5em]">الدرجة المستحقة</p>
                <h4 className="text-[10rem] font-black tracking-tighter leading-none mb-6 drop-shadow-2xl">{totalScore}%</h4>
                <div className={`px-12 py-4 rounded-full font-black text-lg ${gradeInfo.color} bg-white shadow-xl`}>
                  {gradeInfo.label}
                </div>
              </div>

              <div className="grid gap-4">
                  {!isViewOnly && (
                    <>
                      <button onClick={runAIAnalysis} className="py-7 bg-moe-teal text-white rounded-[2rem] font-black shadow-2xl hover:brightness-110 active:scale-95 transition-all text-xl">
                        ⚡ بدء التحليل الرقمي الشامل (AI)
                      </button>
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-6 bg-moe-navy text-white rounded-[2rem] font-black shadow-xl hover:bg-slate-800 transition-all text-lg">
                        {isSaving ? 'جاري الحفظ...' : 'حفظ واعتماد التقييم'}
                      </button>
                    </>
                  )}
                  <button onClick={() => window.print()} className="py-5 bg-white border-2 border-slate-200 text-slate-600 rounded-[2rem] font-black hover:bg-slate-50 transition-all text-lg">
                    🖨️ طباعة التقرير الرسمي
                  </button>
              </div>

              <div className="bg-white p-10 rounded-[4rem] border border-slate-100 shadow-xl space-y-6">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] px-4">التوصيات التربوية:</h4>
                <div className="w-full h-48 text-sm font-bold leading-relaxed bg-slate-50/50 p-8 rounded-[3rem] overflow-y-auto whitespace-pre-wrap text-slate-700 border border-slate-100">
                  {justification || 'سيتم إدراج التوصيات فور إتمام التحليل...'}
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
