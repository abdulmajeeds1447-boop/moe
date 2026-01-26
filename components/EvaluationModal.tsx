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
      if (data && data.scores) {
        setJustification(data.ai_analysis || '');
        const normalized: Record<number, number> = {};
        Object.entries(data.scores).forEach(([k, v]) => normalized[Number(k)] = Number(v));
        setScores(normalized);
      }
    } catch (e) { console.error("Load error:", e); }
  };

  const runAdvancedAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setProgress({ current: 0, total: 0, status: 'جاري فحص المجلد...' });

    try {
      // 1. جلب قائمة الملفات
      const scanRes = await fetch('/api/drive/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: submission.drive_link })
      });
      const { files, error: scanError } = await scanRes.json();
      if (scanError) throw new Error(scanError);
      if (!files || files.length === 0) throw new Error('لا توجد ملفات مدعومة في المجلد');

      setProgress({ current: 0, total: files.length, status: `تم العثور على ${files.length} ملفات. جاري التحليل...` });

      // 2. تحليل كل ملف على حدة (تجنب الـ Timeout)
      let allFindings = "";
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(p => ({ ...p, current: i + 1, status: `جاري تحليل ملف: ${file.name}...` }));

        const fileRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            mode: 'partial', 
            fileId: file.id, 
            mimeType: file.mimeType, 
            fileName: file.name 
          })
        });
        const { findings } = await fileRes.json();
        allFindings += `--- ملف: ${file.name} ---\n${findings}\n\n`;
      }

      // 3. التجميع النهائي (Synthesis)
      setProgress(p => ({ ...p, status: 'جاري صياغة التقرير النهائي واعتماد الدرجات...' }));
      const finalRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'final', previousFindings: allFindings })
      });
      const result = await finalRes.json();

      if (result.suggested_scores) {
        setJustification(result.justification || '');
        const newScores = { ...scores };
        Object.entries(result.suggested_scores).forEach(([k, v]) => {
          newScores[Number(k)] = Number(v);
        });
        setScores(newScores);
      }
    } catch (err: any) {
      alert(`خطأ: ${err.message}`);
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
    if (t >= 90) return { label: 'ممتاز / أداء رائد', color: 'text-emerald-600' };
    if (t >= 80) return { label: 'جيد جداً / أداء قوي', color: 'text-blue-600' };
    if (t >= 70) return { label: 'جيد / أداء مقبول', color: 'text-cyan-600' };
    if (t >= 60) return { label: 'مرضي / يحتاج تطوير', color: 'text-amber-600' };
    return { label: 'غير مرضي / ضعف حاد', color: 'text-red-600' };
  };
  const gradeInfo = getGradeInfo(totalScore);

  const saveEvaluation = async () => {
    setIsSaving(true);
    try {
      await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: justification,
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md overflow-y-auto">
      <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-6 bg-[#0d333f] text-white flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#009688] rounded-2xl flex items-center justify-center text-2xl">🛡️</div>
            <div>
              <h2 className="text-xl font-black">نظام التدقيق المتسلسل (Turbo Analysis)</h2>
              <p className="text-[10px] text-[#009688] font-bold">معالجة آمنة لعدد غير محدود من الملفات</p>
            </div>
          </div>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-[#fbfcfd]">
          <div className="grid lg:grid-cols-2 gap-12">
            
            {/* Left: Criteria */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">المعايير والدرجات</h3>
              <div className="grid gap-2">
                {EVALUATION_CRITERIA.map(c => (
                  <div key={c.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex justify-between items-center group">
                    <div>
                      <span className="text-xs font-black text-slate-700 block">{c.label}</span>
                      <span className="text-[10px] text-slate-400 font-bold">الوزن: {c.weight}% | المكتسب: <span className="text-[#009688] font-black">{calculateWeighted(c.id).toFixed(1)}%</span></span>
                    </div>
                    <select 
                      disabled={isViewOnly || isAnalyzing}
                      value={scores[c.id]} 
                      onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                      className="bg-slate-50 px-3 py-2 rounded-xl text-xs font-black outline-none border border-transparent focus:border-[#009688]"
                    >
                      {[5,4,3,2,1,0].map(v => <option key={v} value={v}>⭐ {v}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Analysis & Results */}
            <div className="space-y-8">
              <div className="bg-[#0d333f] p-10 rounded-[2.5rem] text-white text-center shadow-xl">
                <p className="text-xs font-bold opacity-60 mb-2">إجمالي الدرجة المستحقة</p>
                <h4 className="text-8xl font-black mb-4">{totalScore}%</h4>
                <div className={`px-6 py-2 bg-white/10 rounded-full inline-block font-black text-sm ${gradeInfo.color}`}>
                  {gradeInfo.label}
                </div>
              </div>

              {isAnalyzing ? (
                <div className="bg-white p-10 rounded-[2.5rem] border-2 border-dashed border-[#009688] text-center space-y-6">
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <div 
                      className="bg-[#009688] h-full transition-all duration-500" 
                      style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}
                    />
                  </div>
                  <p className="font-black text-[#0d333f] animate-pulse">{progress.status}</p>
                  <p className="text-[10px] text-slate-400 font-bold">ملف {progress.current} من أصل {progress.total}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {!isViewOnly && (
                    <>
                      <button onClick={runAdvancedAnalysis} className="col-span-2 py-5 bg-[#009688] text-white rounded-2xl font-black shadow-lg">
                        🚀 تشغيل التحليل المتعدد (آمن وشامل)
                      </button>
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-5 bg-[#0d333f] text-white rounded-2xl font-black">
                        {isSaving ? 'جاري الحفظ...' : 'اعتماد الدرجات'}
                      </button>
                      <button onClick={() => window.print()} className="py-5 bg-white border border-slate-200 text-[#0d333f] rounded-2xl font-black">
                        🖨️ طباعة التقرير
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <p className="text-xs font-black text-slate-400 mb-4 uppercase">التقرير الفني للمدقق</p>
                <div className="text-sm font-bold leading-relaxed bg-slate-50 p-6 rounded-2xl h-60 overflow-y-auto whitespace-pre-wrap">
                  {justification || 'اضغط "تشغيل التحليل" لفحص كافة الملفات مجتمعة...'}
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