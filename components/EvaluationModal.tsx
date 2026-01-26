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
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '', step: 1 });
  const [isSaving, setIsSaving] = useState(false);
  
  const [scores, setScores] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
  });

  // مصفوفة المبررات التفصيلية (للعرض في الجدول)
  const [justificationsList, setJustificationsList] = useState<string[]>([]);

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
      // استخراج المبررات من النص إذا كانت محفوظة بتنسيق معين
      const lines = (data.ai_analysis || '').split('\n');
      const jusPart = lines.find(l => l.startsWith('المبررات:'))?.replace('المبررات:', '').trim();
      if (jusPart) setJustificationsList(jusPart.split(' | '));
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

  // وظائف مساعدة للتحكم في الضغط
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  const fetchWithRetry = async (url: string, options: any, retries = 5): Promise<any> => {
    const res = await fetch(url, options);
    if (res.status === 429) {
      if (retries > 0) {
        setProgress(p => ({ ...p, status: 'تهدئة السرعة لتجنب حظر الخدمة.. سأكمل خلال 10 ثوانٍ...' }));
        await delay(10000);
        return fetchWithRetry(url, options, retries - 1);
      }
      throw new Error("تجاوزت حد الطلبات المسموح. يرجى المحاولة بعد دقيقة.");
    }
    if (!res.ok) throw new Error("فشل الاتصال بالخادم الذكي");
    return res.json();
  };

  const runAIAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setProgress({ current: 0, total: 0, status: 'جاري فحص مجلد الشواهد...', step: 1 });

    try {
      // 1. مسح المجلد
      const scanRes = await fetch('/api/drive/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: submission.drive_link })
      });
      const scanData = await scanRes.json();
      const files = scanData.files || [];
      
      if (files.length === 0) throw new Error("المجلد فارغ من الشواهد المدعومة");

      // 2. تحليل الملفات تتابعياً
      let allFindings = "";
      setProgress({ current: 0, total: files.length, status: `تم العثور على ${files.length} ملفات. جاري التحليل التتابعي...`, step: 2 });

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(p => ({ ...p, current: i + 1, status: `تحليل المستند: ${file.name}...` }));
        
        // تريث لمدة 4 ثوانٍ بين كل طلب لتجنب الـ 429
        if (i > 0) await delay(4000);

        const data = await fetchWithRetry('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'partial', fileId: file.id, mimeType: file.mimeType, fileName: file.name })
        });
        
        if (data.findings) {
          allFindings += `[مستند: ${file.name}]\n${data.findings}\n\n`;
        }
      }

      // 3. إصدار القرار التربوي النهائي
      setProgress(p => ({ ...p, status: 'جاري صياغة المحضر والدرجات النهائية...', step: 3 }));
      await delay(2000);

      const finalResult = await fetchWithRetry('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'final', previousFindings: allFindings })
      });

      if (finalResult.scores) {
        setJustification(finalResult.recommendation || '');
        setJustificationsList(finalResult.justifications || []);
        
        const newScores: Record<number, number> = {};
        Object.entries(finalResult.scores).forEach(([k, v]) => newScores[Number(k)] = Number(v));
        setScores(newScores);

        // بناء تقرير نصي كامل للتخزين
        const fullReport = `المبررات: ${(finalResult.justifications || []).join(' | ')}\nنقاط القوة: ${(finalResult.strengths || []).join(', ')}\nنقاط التطوير: ${(finalResult.weaknesses || []).join(', ')}\nالتوصية: ${finalResult.recommendation || ''}`;
        setJustification(fullReport);
      }

    } catch (err: any) {
      alert(`تنبيه: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
      setProgress({ current: 0, total: 0, status: '', step: 1 });
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
    const cleanJustification = (justification || '').split('\n').pop() || ''; // نأخذ آخر سطر (التوصية)
    const message = `*نتيجة الأداء الوظيفي* 📄%0A%0A` +
      `*المعلم:* ${teacherName}%0A` +
      `*الدرجة النهائية:* ${totalScore}% (${gradeInfo.label})%0A%0A` +
      `*توصية المدير:*%0A${cleanJustification}%0A%0A` +
      `إدارة المدرسة`;
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-lg overflow-y-auto">
      
      <style type="text/css" media="print">
        {`
          @page { size: A4; margin: 0; }
          body { visibility: hidden; background: white; }
          .print-container, .print-container * { visibility: visible; }
          .print-container {
            display: flex !important;
            flex-direction: column;
            position: fixed;
            top: 0;
            left: 0;
            width: 210mm;
            height: 297mm;
            background: white;
            z-index: 9999;
            padding: 15mm;
            box-sizing: border-box;
          }
          .print-header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
          .print-table th { background-color: #f0f0f0 !important; color: black !important; border: 1px solid #000 !important; font-weight: 900 !important; -webkit-print-color-adjust: exact; }
          .print-table td { border: 1px solid #000 !important; color: black !important; padding: 4px; }
          .print-box { border: 1px solid #000; border-radius: 8px; padding: 10px; }
        `}
      </style>

      {/* --- محتوى الطباعة --- */}
      <div className="print-container hidden font-['Tajawal'] text-black">
        <div className="print-header flex justify-between items-center shrink-0">
          <div className="text-[10px] font-bold text-center leading-relaxed w-1/3">
            <p>المملكة العربية السعودية</p>
            <p>وزارة التعليم</p>
            <p>ثانوية الأمير عبدالمجيد الأولى</p>
          </div>
          <div className="text-center w-1/3">
             <img src="https://up6.cc/2026/01/176840436497671.png" className="h-16 object-contain mx-auto grayscale" alt="Logo" />
             <h1 className="text-lg font-black mt-2 border-2 border-black px-4 py-1 rounded-lg inline-block">بطاقة الأداء الوظيفي</h1>
          </div>
          <div className="text-[10px] font-bold text-left w-1/3">
            <p>التاريخ: {new Date().toLocaleDateString('ar-SA')}</p>
            <p>رقم الملف: {submission.id.slice(0, 8)}</p>
          </div>
        </div>

        <div className="flex gap-4 mb-4 shrink-0">
          <div className="flex-1 print-box bg-slate-50">
             <table className="w-full text-[10px]">
               <tbody>
                 <tr><td className="py-1 font-bold w-20 border-0 text-right">اسم المعلم:</td><td className="border-0 text-right">{submission.teacher?.full_name}</td></tr>
                 <tr><td className="py-1 font-bold border-0 text-right">المادة:</td><td className="border-0 text-right">{submission.subject}</td></tr>
               </tbody>
             </table>
          </div>
          <div className="w-32 border-2 border-black rounded-lg flex flex-col items-center justify-center bg-slate-50 p-2">
             <p className="text-[9px] font-bold">الدرجة</p>
             <h2 className="text-3xl font-black">{totalScore}</h2>
             <p className="text-[9px] font-bold">{gradeInfo.label}</p>
          </div>
        </div>

        <div className="mb-4 flex-1">
          <table className="print-table w-full border-collapse text-[9px] text-center">
            <thead>
              <tr className="h-8">
                <th className="w-8">م</th>
                <th className="text-right px-2">معيار التقييم</th>
                <th className="w-12">الوزن</th>
                <th className="w-16">الدرجة</th>
              </tr>
            </thead>
            <tbody>
              {EVALUATION_CRITERIA.map((c, idx) => {
                const rawScore = Number(scores[c.id] || 0);
                const weightedScore = (rawScore / 5) * c.weight;
                return (
                  <tr key={c.id}>
                    <td>{idx + 1}</td>
                    <td className="text-right px-2 font-bold">{c.label}</td>
                    <td>{c.weight}</td>
                    <td className="font-black">{Number.isInteger(weightedScore) ? weightedScore : weightedScore.toFixed(1)}</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-200 font-black h-8 border-t-2 border-black">
                <td colSpan={2} className="text-right px-2">المجموع الكلي</td>
                <td>100</td>
                <td>{totalScore}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="print-box h-28 mb-4 relative shrink-0 overflow-hidden">
           <h3 className="font-black text-[10px] border-b border-black inline-block mb-2">المبررات والتوصيات:</h3>
           <p className="text-[8px] leading-relaxed text-justify whitespace-pre-wrap">
             {justification || 'بانتظار التحليل...'}
           </p>
        </div>

        <div className="flex justify-between items-end mt-auto px-6 pb-2 shrink-0">
          <div className="text-center w-40">
            <p className="font-bold text-[10px] mb-6">توقيع المعلم/ة</p>
            <p className="text-[9px] border-t border-dotted border-black">{submission.teacher?.full_name}</p>
          </div>
          <div className="text-center w-40">
            <p className="font-bold text-[10px] mb-6">اعتماد مدير المدرسة</p>
            <p className="font-black text-[10px] border-t border-dotted border-black">نايف أحمد الشهري</p>
          </div>
        </div>
      </div>

      {/* --- الواجهة التفاعلية --- */}
      <div className="print:hidden bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden relative">
        
        {/* واجهة شريط التقدم أثناء التحليل */}
        {isAnalyzing && (
          <div className="absolute inset-0 z-[300] bg-moe-navy/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-12 text-white">
             <div className="w-32 h-32 border-8 border-white/5 rounded-full flex items-center justify-center relative mb-8">
                <div className="absolute inset-0 border-8 border-moe-teal border-t-transparent rounded-full animate-spin"></div>
                <span className="text-4xl">🔍</span>
             </div>
             <h2 className="text-3xl font-black mb-4">
                {progress.step === 1 ? 'جاري جلب الملفات...' : progress.step === 2 ? 'المحلل يقرأ الشواهد...' : 'اعتماد القرار التربوي...'}
             </h2>
             <div className="bg-white/10 px-8 py-4 rounded-3xl border border-white/10 mb-8 max-w-lg">
                <p className="text-moe-teal text-lg font-bold animate-pulse">{progress.status}</p>
             </div>
             <div className="w-full max-w-md bg-white/5 h-4 rounded-full overflow-hidden p-1 border border-white/10">
                <div 
                  className="bg-gradient-to-r from-moe-teal to-emerald-400 h-full rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(0,150,136,0.5)]" 
                  style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }} 
                />
             </div>
             <p className="text-xs text-white/40 mt-10 italic">"شكراً لصبرك.. نقوم بالتحليل بهدوء لضمان دقة النتيجة وعدم تجاوز حدود الخدمة المجانية"</p>
          </div>
        )}

        <div className="p-6 bg-moe-navy text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-moe-teal rounded-2xl flex items-center justify-center text-2xl">⚖️</div>
            <div>
              <h2 className="text-xl font-black">نظام التحليل التربوي الذكي</h2>
              <p className="text-[10px] text-moe-teal font-bold">إشراف: نايف أحمد الشهري</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-2xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50">
          <div className="grid lg:grid-cols-2 gap-12">
            
            <div className="space-y-4">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">مصفوفة الدرجات</h3>
              <div className="grid gap-2">
                {EVALUATION_CRITERIA.map((c, idx) => (
                  <div key={c.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex flex-col gap-3 shadow-sm hover:border-moe-teal transition-all">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-black text-slate-700">{c.label}</span>
                      <select 
                        disabled={isViewOnly}
                        value={scores[c.id]} 
                        onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                        className="bg-slate-50 px-4 py-1.5 rounded-xl text-xs font-black text-moe-teal outline-none border border-slate-200"
                      >
                        {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    {justificationsList[idx] && (
                      <div className="p-3 bg-slate-50 rounded-xl text-[9px] font-bold text-slate-500 italic leading-relaxed">
                        🔍 {justificationsList[idx]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-moe-navy p-10 rounded-[3rem] text-white text-center shadow-xl relative overflow-hidden">
                <p className="text-xs font-bold opacity-60 mb-2 uppercase tracking-widest">المعدل العام</p>
                <h4 className="text-8xl font-black tracking-tighter mb-4">{totalScore}%</h4>
                <div className={`px-10 py-3 rounded-full inline-block font-black text-sm shadow-2xl ${gradeInfo.color} bg-white/10 border border-white/5`}>
                  {gradeInfo.label}
                </div>
              </div>

              <div className="grid gap-4">
                  <a href={submission.drive_link} target="_blank" className="py-4 bg-blue-50 text-blue-600 border-2 border-blue-100 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-blue-100 transition-all">
                    📂 عرض مجلد الشواهد
                  </a>

                  {!isViewOnly && (
                    <>
                      <button onClick={runAIAnalysis} className="py-5 bg-moe-teal text-white rounded-2xl font-black shadow-lg hover:brightness-110 transition-all">
                        ⚡ بدء التحليل التتابعي الذكي
                      </button>
                      <div className="grid grid-cols-2 gap-4">
                        <button onClick={saveEvaluation} className="py-5 bg-moe-navy text-white rounded-2xl font-black shadow-lg hover:brightness-125">حفظ واعتماد</button>
                        <button onClick={sendWhatsApp} className="py-5 bg-[#25D366] text-white rounded-2xl font-black shadow-lg">واتساب</button>
                      </div>
                      <button onClick={handlePrint} className="py-5 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black hover:bg-slate-50">🖨️ طباعة محضر A4</button>
                    </>
                  )}
              </div>

              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <h4 className="text-[11px] font-black text-slate-400 mb-4 uppercase">التوصيات النهائية:</h4>
                <div className="w-full h-32 text-xs font-bold leading-relaxed bg-slate-50/50 p-5 rounded-2xl overflow-y-auto whitespace-pre-wrap text-slate-700">
                  {justification || 'سيتم إدراج التوصية هنا بعد التحليل...'}
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
