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

  useEffect(() => { 
    loadExistingEvaluation(); 
  }, [submission.id]);

  const loadExistingEvaluation = async () => {
    const { data } = await supabase.from('evaluations').select('*').eq('submission_id', submission.id).maybeSingle();
    if (data) {
      setJustification(data.ai_analysis || '');
      if (data.scores) {
        const normalized: Record<number, number> = {};
        Object.entries(data.scores).forEach(([k, v]) => normalized[Number(k)] = Number(v));
        setScores(normalized);
      }
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
    if (t >= 90) return { label: 'ممتاز / رائد', value: 5, color: 'text-emerald-200' };
    if (t >= 80) return { label: 'جيد جداً / قوي', value: 4, color: 'text-blue-200' };
    if (t >= 70) return { label: 'جيد', value: 3, color: 'text-cyan-200' };
    if (t >= 60) return { label: 'مرضي / مقبول', value: 2, color: 'text-amber-200' };
    return { label: 'غير مرضي / ضعيف', value: 1, color: 'text-red-200' };
  };

  const totalScore = calculateTotal();
  const gradeInfo = getGradeInfo(totalScore);

  const runAIAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setAnalysisStatus('جاري تحليل الشواهد بدقة تربوية صارمة...');
    
    try {
      const data = await analyzeTeacherReport(submission.drive_link);
      if (data) {
        setJustification(data.justification || '');
        if (data.suggested_scores) {
          const newScores = { ...scores };
          Object.entries(data.suggested_scores).forEach(([k, v]) => {
            const numKey = Number(k);
            if (numKey >= 1 && numKey <= 11) {
              newScores[numKey] = Number(v);
            }
          });
          setScores(newScores);
        }
      }
    } catch (err: any) {
      alert(`عذراً، فشل التحليل: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
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
      alert('✅ تم اعتماد تقييم الأداء بنجاح');
      onClose();
    } catch (err) { alert('خطأ في حفظ البيانات'); } finally { setIsSaving(false); }
  };

  const handlePrint = () => { window.print(); };

  const sendWhatsApp = () => {
    const teacherName = submission.teacher?.full_name || 'الزميل المعلم';
    const cleanJustification = (justification || '').replace(/\*\*/g, '').replace(/\*/g, '-');
    const message = `*تقرير الأداء الوظيفي* 📄%0A%0A` +
      `*المعلم:* ${teacherName}%0A` +
      `*النتيجة النهائية:* ${totalScore}%%0A` +
      `*المعدل:* ${gradeInfo.value} من 5%0A` +
      `*التقدير:* ${gradeInfo.label}%0A%0A` +
      `*أبرز الملحوظات:*%0A${cleanJustification}%0A%0A` +
      `مدير المدرسة: نايف أحمد الشهري`;
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-lg overflow-y-auto">
      
      {/* 🔴 هام جداً: هذا الكود يمنع ظهور الصفحة الثانية بإجبار المتصفح على إلغاء الهوامش */}
      <style type="text/css" media="print">
        {`
          @page { size: A4; margin: 0; }
          body { margin: 0; padding: 0; }
          /* إخفاء أي شيء ليس له علاقة بالتقرير المطبوع */
          body * { visibility: hidden; }
          .print-content, .print-content * { visibility: visible; }
          .print-content { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
        `}
      </style>

      {/* --- قسم الطباعة (A4) --- */}
      {/* إضافة كلاس 'print-content' هنا لربطه بكود الـ style أعلاه */}
      <div className="print-content hidden print:flex flex-col w-[210mm] h-[297mm] bg-white p-[12mm] text-black font-['Tajawal'] overflow-hidden border relative">
        
        {/* الترويسة */}
        <div className="flex justify-between items-center border-b-2 border-moe-navy pb-3 mb-4 shrink-0">
          <div className="text-[9px] font-bold space-y-0.5">
            <p>المملكة العربية السعودية</p>
            <p>وزارة التعليم</p>
            <p>ثانوية الأمير عبدالمجيد الأولى</p>
          </div>
          <div className="text-center">
             <img src="https://up6.cc/2026/01/176840436497671.png" className="h-12 object-contain mb-1 mx-auto" alt="Logo" />
             <h2 className="text-[11px] font-black text-moe-navy">بطاقة الأداء الوظيفي الرقمي</h2>
          </div>
          <div className="text-[9px] font-bold text-left space-y-0.5">
            <p>التاريخ: {new Date().toLocaleDateString('ar-SA')}</p>
            <p>العام الدراسي: 1446هـ</p>
          </div>
        </div>

        {/* بيانات المعلم */}
        <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-lg mb-4 border border-slate-100 text-[9px] shrink-0">
          <p><strong>الاسم:</strong> {submission.teacher?.full_name}</p>
          <p><strong>المادة:</strong> {submission.subject}</p>
          <p><strong>الدرجة:</strong> <span className="font-black">{totalScore}/100 ({gradeInfo.label})</span></p>
        </div>

        {/* جدول الدرجات المطبوع */}
        <div className="mb-4 shrink-0">
          <table className="w-full border-collapse border border-slate-400 text-[8.5px]">
            <thead>
              <tr className="bg-slate-100 font-black">
                <th className="border border-slate-400 p-1 text-right">المعيار</th>
                <th className="border border-slate-400 p-1 text-center w-14">الوزن</th>
                <th className="border border-slate-400 p-1 text-center w-20">المستحق</th>
              </tr>
            </thead>
            <tbody>
              {EVALUATION_CRITERIA.map(c => {
                const rawScore = Number(scores[c.id] || 0);
                const weightedScore = (rawScore / 5) * c.weight;
                return (
                  <tr key={c.id}>
                    <td className="border border-slate-400 p-0.5 px-1.5 font-bold">{c.label}</td>
                    <td className="border border-slate-400 p-0.5 text-center">{c.weight}</td>
                    <td className="border border-slate-400 p-0.5 text-center font-black">
                       {Number.isInteger(weightedScore) ? weightedScore : weightedScore.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-moe-navy text-white font-black">
                <td className="border border-moe-navy p-1.5 text-[10px]" colSpan={2}>المجموع النهائي</td>
                <td className="border border-moe-navy p-1.5 text-center text-[14px]">{totalScore}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* التبريرات */}
        <div className="flex-1 overflow-hidden flex flex-col">
           <h3 className="font-black text-[10px] text-moe-navy mb-1 underline shrink-0">رأي الخبير التربوي:</h3>
           <div className="flex-1 border p-2 relative">
             <p className="text-[9px] leading-relaxed text-slate-700 italic text-justify whitespace-pre-wrap absolute inset-0 p-2 overflow-hidden">
               {justification}
             </p>
           </div>
        </div>

        {/* التواقيع */}
        <div className="mt-4 pt-4 flex justify-between items-end text-center shrink-0">
          <div className="w-48 border-t border-dotted border-black pt-2">
            <p className="font-black text-[9px]">توقيع المعلم</p>
          </div>
          <div className="w-48 border-t border-dotted border-black pt-2">
            <p className="font-black text-[9px]">مدير المدرسة: نايف الشهري</p>
          </div>
        </div>
      </div>

      {/* --- الواجهة التفاعلية (Modal) - مخفية أثناء الطباعة بواسطة CSS --- */}
      <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden no-print">
        {/* رأس النافذة */}
        <div className="p-6 bg-moe-navy text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-moe-teal rounded-2xl flex items-center justify-center text-2xl shadow-lg">🤖</div>
            <div>
              <h2 className="text-xl font-black">نظام التحليل التربوي الذكي</h2>
              <p className="text-[10px] text-moe-teal font-bold tracking-widest">إشراف: نايف أحمد الشهري</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-2xl transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50">
          <div className="grid lg:grid-cols-2 gap-12">
            
            {/* القائمة اليمنى: المعايير */}
            <div className="space-y-4">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">تقدير المعايير (0-5)</h3>
              <div className="grid gap-2">
                {EVALUATION_CRITERIA.map(c => (
                  <div key={c.id} className="p-3.5 bg-white rounded-xl border border-slate-100 flex justify-between items-center group hover:border-moe-teal transition-all shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-slate-700">{c.label}</span>
                      <span className="text-[9px] text-slate-400 font-bold">الوزن: {c.weight}%</span>
                    </div>
                    <select 
                      disabled={isViewOnly}
                      value={scores[c.id]} 
                      onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                      className="bg-slate-50 px-3 py-1 rounded-lg text-xs font-black text-moe-teal outline-none focus:ring-2 focus:ring-moe-teal/20"
                    >
                      {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* القائمة اليسرى: النتائج والأزرار */}
            <div className="space-y-8">
              
              <div className="bg-gradient-to-br from-moe-navy to-moe-teal p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden flex flex-col items-center text-center justify-center gap-4">
                <div className="relative z-10">
                  <h4 className="text-8xl font-black tracking-tighter drop-shadow-lg">{totalScore}%</h4>
                </div>
                <div className="w-full h-0.5 bg-white/20 rounded-full max-w-[200px]"></div>
                <div className="flex flex-col items-center gap-1 z-10">
                  <div className="bg-white/10 backdrop-blur-md px-6 py-2 rounded-2xl border border-white/10 mb-2">
                    <p className="text-sm font-bold opacity-90">المعدل: <span className="text-xl font-black text-white mx-1">{gradeInfo.value}</span> من 5</p>
                  </div>
                  <h3 className={`text-3xl font-black ${gradeInfo.color} drop-shadow-md mt-1`}>
                    {gradeInfo.label}
                  </h3>
                </div>
              </div>

              {/* أزرار التحكم */}
              {isAnalyzing ? (
                <div className="bg-white p-8 rounded-[2rem] border-2 border-moe-teal text-center space-y-4 shadow-xl">
                  <div className="animate-spin text-3xl mx-auto">🌀</div>
                  <p className="text-sm font-black text-moe-teal">{analysisStatus}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <a 
                    href={submission.drive_link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="col-span-2 py-4 bg-blue-50 text-blue-600 border-2 border-blue-100 rounded-2xl font-black transition-all hover:bg-blue-100 hover:border-blue-200 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span className="text-xl">📂</span>
                    عرض مجلد الشواهد (Drive)
                  </a>

                  {!isViewOnly && (
                    <>
                      <button onClick={runAIAnalysis} className="col-span-2 py-5 bg-white border-2 border-moe-teal text-moe-teal rounded-2xl font-black hover:bg-moe-teal hover:text-white transition-all shadow-md active:scale-95">
                        ⚡ تحليل الخبير التربوي (AI)
                      </button>
                      
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-5 bg-moe-navy text-white rounded-2xl font-black shadow-lg hover:brightness-110 active:scale-95">
                        {isSaving ? 'جاري الحفظ...' : 'اعتماد الدرجات'}
                      </button>

                      <button onClick={sendWhatsApp} className="py-5 bg-[#25D366] text-white rounded-2xl font-black shadow-lg hover:bg-[#20bd5a] transition-all flex items-center justify-center gap-2 active:scale-95">
                        واتساب
                      </button>
                    </>
                  )}

                  <button 
                    onClick={handlePrint} 
                    className="col-span-2 py-5 bg-slate-100 text-moe-navy border-2 border-slate-200 rounded-2xl font-black transition-all hover:bg-white active:scale-95 flex items-center justify-center gap-2"
                  >
                    📄 طباعة التقرير
                  </button>
                </div>
              )}

              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <h4 className="text-[11px] font-black text-slate-400 mb-4 uppercase">تبريرات التقييم:</h4>
                <div className="w-full h-40 text-xs font-bold leading-relaxed bg-slate-50/50 p-4 rounded-xl overflow-y-auto whitespace-pre-wrap text-slate-700 border border-slate-100">
                  {justification || 'سيقوم الخبير التربوي بكتابة التبريرات هنا...'}
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
