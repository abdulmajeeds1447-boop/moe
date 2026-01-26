'use client';

import React, { useState, useEffect } from 'react';
import { Submission, EVALUATION_CRITERIA } from '../types'; // تأكد من المسار
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

  // ✅ دالة الحساب الدقيقة بناءً على الأوزان في ملف types.ts
  const calculateTotal = () => {
    let total = 0;
    EVALUATION_CRITERIA.forEach(c => { 
      const rawScore = Number(scores[c.id] || 0); // الدرجة من 5
      const weightedScore = (rawScore / 5) * c.weight; // معادلة الوزن النسبي
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
    const cleanJustification = (justification || '').replace(/\*\*/g, '').replace(/\*/g, '-').slice(0, 500) + '...';
    
    const message = 
      `*نتيجة الأداء الوظيفي* 📄%0A` +
      `*المدرسة:* ثانوية الأمير عبدالمجيد الأولى%0A` +
      `*المعلم:* ${teacherName}%0A` +
      `------------------%0A` +
      `*الدرجة المستحقة:* ${totalScore}%0A` +
      `*التقدير:* ${gradeInfo.label}%0A` +
      `------------------%0A` +
      `*ملحوظات المدير:*%0A${cleanJustification}%0A%0A` +
      `*مدير المدرسة:* نايف الشهري`;
      
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-lg overflow-y-auto">
      
      {/* --- تنسيقات الطباعة --- */}
      <style type="text/css" media="print">
        {`
          @page { size: A4; margin: 0; }
          body { visibility: hidden; background: white; }
          .print-container, .print-container * { visibility: visible; }
          .print-container {
            display: flex !important;
            flex-direction: column;
            position: fixed;
            top: 0; left: 0; width: 210mm; height: 297mm;
            background: white; z-index: 9999; padding: 15mm;
          }
          .print-table th { background-color: #f0f0f0 !important; border: 1px solid #000 !important; font-weight: 900 !important; }
          .print-table td { border: 1px solid #000 !important; padding: 4px; }
          .print-box { border: 1px solid #000; border-radius: 8px; padding: 10px; }
        `}
      </style>

      {/* --- محتوى الطباعة --- */}
      <div className="print-container hidden font-['Tajawal'] text-black">
        <div className="flex justify-between items-center mb-6 border-b-2 border-black pb-4">
          <div className="text-[10px] font-bold text-center w-1/3">
            <p>المملكة العربية السعودية</p> <p>وزارة التعليم</p> <p>ثانوية الأمير عبدالمجيد الأولى</p>
          </div>
          <div className="text-center w-1/3">
             <h1 className="text-xl font-black border-2 border-black px-4 py-1 rounded-lg inline-block">بطاقة الأداء الوظيفي</h1>
          </div>
          <div className="text-[10px] font-bold text-left w-1/3">
            <p>التاريخ: {new Date().toLocaleDateString('ar-SA')}</p> <p>1446هـ</p>
          </div>
        </div>

        <div className="flex gap-4 mb-4">
          <div className="flex-1 print-box bg-slate-50">
             <table className="w-full text-[11px]">
               <tbody>
                 <tr><td className="font-bold w-24">اسم المعلم:</td><td>{submission.teacher?.full_name}</td></tr>
                 <tr><td className="font-bold">المادة:</td><td>{submission.subject}</td></tr>
                 <tr><td className="font-bold">المقيم:</td><td>مدير المدرسة (نايف الشهري)</td></tr>
               </tbody>
             </table>
          </div>
          <div className="w-32 border-2 border-black rounded-lg flex flex-col items-center justify-center bg-slate-50 p-2">
             <p className="text-[9px] font-bold">الدرجة النهائية</p>
             <h2 className="text-3xl font-black">{totalScore}</h2>
             <p className="text-[9px] font-bold">{gradeInfo.label}</p>
          </div>
        </div>

        <div className="mb-4">
          <table className="print-table w-full border-collapse text-[10px] text-center">
            <thead>
              <tr className="h-8 bg-gray-100">
                <th className="w-8">م</th>
                <th className="text-right px-2">عناصر التقييم</th>
                <th className="w-12">الوزن</th>
                <th className="w-16">الدرجة المستحقة</th>
              </tr>
            </thead>
            <tbody>
              {EVALUATION_CRITERIA.map((c, idx) => {
                const rawScore = Number(scores[c.id] || 0);
                const weightedScore = (rawScore / 5) * c.weight;
                return (
                  <tr key={c.id}>
                    <td className="font-bold">{idx + 1}</td>
                    <td className="text-right px-2">{c.label}</td>
                    <td>{c.weight}%</td>
                    <td className="font-bold">
                       {Number.isInteger(weightedScore) ? weightedScore : weightedScore.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-200 font-black h-8 border-t-2 border-black">
                <td colSpan={2} className="text-right px-2">المجموع النهائي</td>
                <td>100%</td>
                <td className="text-[12px]">{totalScore}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="print-box h-24 mb-4 relative">
           <h3 className="font-bold text-[10px] underline mb-1">الملاحظات:</h3>
           <p className="text-[9px] leading-relaxed text-justify">{justification}</p>
        </div>

        <div className="flex justify-between px-10 mt-auto">
          <div className="text-center"><p className="font-bold text-[10px] mb-8">توقيع المعلم</p><p className="text-[9px]">{submission.teacher?.full_name}</p></div>
          <div className="text-center"><p className="font-bold text-[10px] mb-8">مدير المدرسة</p><p className="font-black text-[10px]">نايف أحمد الشهري</p></div>
        </div>
      </div>

      {/* --- واجهة الويب (Modal) --- */}
      <div className="print:hidden bg-white w-full max-w-6xl rounded-[2rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden">
        {/* الهيدر */}
        <div className="p-5 bg-moe-navy text-white flex justify-between items-center">
          <h2 className="text-lg font-black flex items-center gap-2">
            <span>🤖</span> تقييم الأداء الوظيفي - نظام الخبير
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
          <div className="grid lg:grid-cols-2 gap-8">
            
            {/* القائمة اليمنى: المعايير */}
            <div className="space-y-3">
              {EVALUATION_CRITERIA.map(c => (
                <div key={c.id} className="p-3 bg-white rounded-xl border border-slate-200 flex justify-between items-center shadow-sm hover:border-moe-teal transition-colors">
                  <div>
                    <span className="block text-sm font-bold text-slate-800">{c.label}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${c.weight === 5 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      الوزن: {c.weight}%
                    </span>
                  </div>
                  <select 
                    disabled={isViewOnly}
                    value={scores[c.id]} 
                    onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 text-sm font-bold text-moe-navy focus:ring-2 focus:ring-moe-teal outline-none"
                  >
                    {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* القائمة اليسرى: النتائج والتحكم */}
            <div className="space-y-6">
              <div className="bg-moe-navy text-white p-6 rounded-3xl text-center shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                  <h4 className="text-6xl font-black mb-2">{totalScore}</h4>
                  <p className={`text-2xl font-bold ${gradeInfo.color} bg-white/90 inline-block px-4 py-1 rounded-lg`}>{gradeInfo.label}</p>
                </div>
              </div>

              {/* الأزرار */}
              {isAnalyzing ? (
                <div className="bg-white p-6 rounded-2xl border-2 border-moe-teal text-center animate-pulse">
                  <p className="font-bold text-moe-teal">جاري تحليل الملفات...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <a href={submission.drive_link} target="_blank" className="col-span-2 py-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-center border border-blue-200 hover:bg-blue-100">📂 فتح مجلد الشواهد</a>
                  
                  {!isViewOnly && (
                    <>
                      <button onClick={runAIAnalysis} className="col-span-2 py-3 bg-white text-moe-teal border-2 border-moe-teal rounded-xl font-bold hover:bg-moe-teal hover:text-white transition-colors">⚡ تحليل الذكاء الاصطناعي</button>
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-3 bg-moe-navy text-white rounded-xl font-bold hover:bg-opacity-90">💾 اعتماد</button>
                      <button onClick={sendWhatsApp} className="py-3 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600">📱 واتساب</button>
                      <button onClick={handlePrint} className="col-span-2 py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300">🖨️ طباعة التقرير</button>
                    </>
                  )}
                </div>
              )}

              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <h4 className="text-xs font-bold text-slate-400 mb-2">تبرير المدير/الخبير:</h4>
                <div className="text-sm leading-relaxed text-slate-700 max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {justification || 'لا يوجد تحليل حتى الآن.'}
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
