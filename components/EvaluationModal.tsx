
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
    EVALUATION_CRITERIA.forEach(c => { total += (scores[c.id] || 0) * (c.weight / 5); });
    return Math.round(total);
  };

  const getGrade = (t: number) => {
    if (t >= 90) return 'ممتاز';
    if (t >= 80) return 'جيد جداً';
    if (t >= 70) return 'جيد';
    if (t >= 60) return 'مرضي';
    return 'غير مرضي';
  };

  const totalScore = calculateTotal();
  const currentGrade = getGrade(totalScore);

  const runAIAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setAnalysisStatus('جاري تحليل الأدلة بمساعدة الخبير التربوي...');
    
    try {
      const data = await analyzeTeacherReport(submission.drive_link);
      if (data) {
        setJustification(data.justification || '');
        if (data.suggested_scores) {
          const newScores = { ...scores };
          Object.entries(data.suggested_scores).forEach(([k, v]) => {
            newScores[Number(k)] = Number(v);
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
      const { error } = await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: justification,
        scores: scores,
        total_score: total,
        overall_grade: getGrade(total),
      }, { onConflict: 'submission_id' });
      
      if (error) throw error;
      await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      alert('✅ تم اعتماد تقييم الأستاذ نايف أحمد الشهري بنجاح');
    } catch (err) { alert('خطأ في حفظ البيانات'); } finally { setIsSaving(false); }
  };

  const handlePrint = () => { window.print(); };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-lg overflow-y-auto">
      
      {/* التقرير المطبوع - صفحة A4 واحدة إجبارية */}
      <div className="hidden print:flex flex-col w-[210mm] h-[297mm] bg-white p-[12mm] text-black font-['Tajawal'] overflow-hidden border">
        
        {/* الترويسة الرسمية */}
        <div className="flex justify-between items-center border-b-2 border-moe-navy pb-3 mb-4 shrink-0">
          <div className="text-[9px] font-bold space-y-0.5">
            <p>المملكة العربية السعودية</p>
            <p>وزارة التعليم</p>
            <p>ثانوية الأمير عبدالمجيد الأولى</p>
          </div>
          <div className="text-center">
             <img src="https://up6.cc/2026/01/176840436497671.png" className="h-12 object-contain mb-1 mx-auto" alt="Logo" />
             <h2 className="text-[11px] font-black text-moe-navy">بطاقة تقييم الأداء الوظيفي الرقمي</h2>
          </div>
          <div className="text-[9px] font-bold text-left space-y-0.5">
            <p>التاريخ: {new Date().toLocaleDateString('ar-SA')}</p>
            <p>العام الدراسي: 1446هـ</p>
          </div>
        </div>

        {/* بيانات المعلم */}
        <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-lg mb-4 border border-slate-100 text-[9px] shrink-0">
          <p><strong>اسم المعلم/ة:</strong> {submission.teacher?.full_name}</p>
          <p><strong>المادة / التخصص:</strong> {submission.subject}</p>
          <p><strong>الدرجة النهائية:</strong> <span className="font-black">{totalScore}/100 ({currentGrade})</span></p>
        </div>

        {/* جدول التقييم المدمج */}
        <div className="mb-4 shrink-0">
          <table className="w-full border-collapse border border-slate-400 text-[8.5px]">
            <thead>
              <tr className="bg-slate-100 font-black">
                <th className="border border-slate-400 p-1 text-right">المعيار الأساسي للتقييم</th>
                <th className="border border-slate-400 p-1 text-center w-14">الوزن</th>
                <th className="border border-slate-400 p-1 text-center w-14">الدرجة</th>
              </tr>
            </thead>
            <tbody>
              {EVALUATION_CRITERIA.map(c => (
                <tr key={c.id}>
                  <td className="border border-slate-400 p-0.5 px-1.5 font-bold">{c.label}</td>
                  <td className="border border-slate-400 p-0.5 text-center">{c.weight}</td>
                  <td className="border border-slate-400 p-0.5 text-center font-black">{(scores[c.id] || 0) * (c.weight / 5)}</td>
                </tr>
              ))}
              <tr className="bg-moe-navy text-white font-black">
                <td className="border border-moe-navy p-1.5 text-[10px]" colSpan={2}>النسبة المئوية النهائية للتقرير الرقمي</td>
                <td className="border border-moe-navy p-1.5 text-center text-[14px]">{totalScore}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* التبريرات (مساحة متغيرة لكن ضمن الصفحة) */}
        <div className="flex-1 overflow-hidden">
          <div className="border-r-2 border-moe-teal pr-4 h-full">
            <h3 className="font-black text-[10px] text-moe-navy mb-1 underline">تحليل الخبير التربوي للملف الرقمي:</h3>
            <p className="text-[9px] leading-relaxed text-slate-700 italic text-justify line-clamp-[12]">
              {justification || 'تم رصد الدرجات بناءً على الشواهد والأدلة الرقمية المرفوعة، مع التحقق من معايير وزارة التعليم السعودية والمهام الوظيفية الموكلة للمعلم.'}
            </p>
          </div>
        </div>

        {/* التواقيع في قاع الصفحة إجبارياً */}
        <div className="mt-auto pt-6 flex justify-between items-end text-center shrink-0">
          <div className="w-48">
            <p className="font-black text-[9px] mb-8">توقيع المعلم</p>
            <div className="border-t border-dotted border-black pt-1">
              <p className="text-[8.5px]">{submission.teacher?.full_name}</p>
            </div>
          </div>
          <div className="w-48">
            <p className="font-black text-[9px] mb-8">يعتمد مدير المدرسة</p>
            <div className="border-t border-dotted border-black pt-1">
              <p className="font-black text-[9px]">نايف أحمد الشهري</p>
              <p className="text-[6px] text-slate-400 mt-0.5">ختم رسمي إلكتروني معتمد</p>
            </div>
          </div>
        </div>
      </div>

      {/* واجهة العرض التفاعلية (Modal) */}
      <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden no-print">
        <div className="p-6 bg-moe-navy text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-moe-teal rounded-2xl flex items-center justify-center text-2xl shadow-lg">🤖</div>
            <div>
              <h2 className="text-xl font-black">نظام التحليل التربوي الذكي</h2>
              <p className="text-[10px] text-moe-teal font-bold tracking-widest">إشراف المدير: نايف أحمد الشهري</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-2xl transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50">
          <div className="grid lg:grid-cols-2 gap-12">
            
            <div className="space-y-4">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">تقدير المعايير (0-5)</h3>
              <div className="grid gap-2">
                {EVALUATION_CRITERIA.map(c => (
                  <div key={c.id} className="p-3.5 bg-white rounded-xl border border-slate-100 flex justify-between items-center group hover:border-moe-teal transition-all shadow-sm">
                    <span className="text-[11px] font-black text-slate-700">{c.label}</span>
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

            <div className="space-y-8">
              <div className="bg-gradient-to-br from-moe-navy to-moe-teal p-10 rounded-[2.5rem] text-white shadow-xl flex justify-between items-center relative overflow-hidden">
                <div className="relative z-10">
                  <p className="text-[10px] opacity-70 font-black mb-1">النتيجة النهائية</p>
                  <h4 className="text-7xl font-black">{totalScore}%</h4>
                </div>
                <div className="text-center z-10 bg-white/10 backdrop-blur-md px-8 py-5 rounded-[2rem] border border-white/20">
                  <p className="text-[10px] opacity-70 font-black mb-1">التقدير</p>
                  <p className="text-2xl font-black">{currentGrade}</p>
                </div>
              </div>

              {isAnalyzing ? (
                <div className="bg-white p-8 rounded-[2rem] border-2 border-moe-teal text-center space-y-4 shadow-xl">
                  <div className="animate-spin text-3xl mx-auto">🌀</div>
                  <p className="text-sm font-black text-moe-teal">{analysisStatus}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {!isViewOnly && (
                    <>
                      <button onClick={runAIAnalysis} className="col-span-2 py-5 bg-white border-2 border-moe-teal text-moe-teal rounded-2xl font-black hover:bg-moe-teal hover:text-white transition-all shadow-md">
                        ⚡ بدء تحليل الخبير التربوي (Gemini AI)
                      </button>
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-5 bg-moe-navy text-white rounded-2xl font-black shadow-lg hover:brightness-110">
                        {isSaving ? 'جاري الحفظ...' : 'اعتماد وحفظ الدرجات'}
                      </button>
                    </>
                  )}
                  <button onClick={handlePrint} className={`py-5 bg-slate-100 text-moe-navy border-2 border-slate-200 rounded-2xl font-black transition-all ${isViewOnly ? 'col-span-2' : ''} hover:bg-white`}>
                    📄 طباعة التقرير (A4 واحدة فقط)
                  </button>
                </div>
              )}

              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                <h4 className="text-[11px] font-black text-slate-400 mb-4 uppercase">تبريرات التقييم (بناءً على الشواهد):</h4>
                <textarea 
                  readOnly={isViewOnly}
                  value={justification} 
                  onChange={e=>setJustification(e.target.value)} 
                  className="w-full h-40 text-xs font-bold border-none resize-none leading-relaxed bg-transparent focus:ring-0" 
                  placeholder="سيقوم الذكاء الاصطناعي برصد المبررات هنا..." 
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationModal;
