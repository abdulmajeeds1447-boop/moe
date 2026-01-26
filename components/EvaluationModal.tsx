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
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '', step: 1, isCoolingDown: false });
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
    if (t >= 90) return { label: 'ممتاز / رائد', value: 5, color: 'text-emerald-600' };
    if (t >= 80) return { label: 'جيد جداً / قوي', value: 4, color: 'text-blue-600' };
    if (t >= 70) return { label: 'جيد', value: 3, color: 'text-cyan-600' };
    if (t >= 60) return { label: 'مرضي / مقبول', value: 2, color: 'text-amber-600' };
    return { label: 'غير مرضي / ضعيف', value: 1, color: 'text-red-600' };
  };

  const totalScore = calculateTotal();
  const gradeInfo = getGradeInfo(totalScore);

  // وظائف التحكم في الضغط (Rate Limit Handling)
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  const fetchWithRetry = async (url: string, options: any, retries = 3): Promise<any> => {
    const res = await fetch(url, options);
    
    if (res.status === 429) {
      if (retries > 0) {
        setProgress(p => ({ ...p, isCoolingDown: true, status: 'تجاوزنا سرعة التحليل المسموحة.. جاري الانتظار 20 ثانية للتبريد...' }));
        await delay(20000); // انتظار طويل عند حدوث 429
        setProgress(p => ({ ...p, isCoolingDown: false }));
        return fetchWithRetry(url, options, retries - 1);
      }
      throw new Error("عذراً، الخادم مزدحم جداً. يرجى الانتظار دقيقة والمحاولة لاحقاً.");
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "فشل في معالجة الطلب.");
    }

    return res.json();
  };

  const runAIAnalysis = async () => {
    if (isViewOnly) return;
    setIsAnalyzing(true);
    setProgress({ current: 0, total: 0, status: 'جاري فحص المجلد والمجلدات الفرعية...', step: 1, isCoolingDown: false });

    try {
      // المرحلة 1: مسح كافة الملفات (بما في ذلك المجلدات الفرعية)
      const scanRes = await fetch('/api/drive/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: submission.drive_link })
      });
      const scanData = await scanRes.json();
      if (!scanRes.ok) throw new Error(scanData.error || "فشل مسح المجلد");

      const files = scanData.files || [];
      if (files.length === 0) throw new Error("لم نجد أي ملفات مدعومة داخل المجلد المرفق.");

      // المرحلة 2: التحليل التتابعي مع فواصل زمنية
      let allEvidence = "";
      setProgress({ current: 0, total: files.length, status: `تم اكتشاف ${files.length} ملفات. جاري التحليل التتابعي...`, step: 2, isCoolingDown: false });

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(p => ({ ...p, current: i + 1, status: `تحليل الشاهد (${i+1} من ${files.length}): ${file.name}...` }));
        
        // تريث إجباري (6 ثوانٍ) لمنع الخطأ 429
        if (i > 0) await delay(6000);

        const data = await fetchWithRetry('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'partial', fileId: file.id, mimeType: file.mimeType, fileName: file.name })
        });
        
        if (data.findings) {
          allEvidence += `[شاهد: ${file.name}]\n${data.findings}\n\n`;
        }
      }

      // المرحلة 3: استخراج النتيجة النهائية
      setProgress(p => ({ ...p, status: 'جاري صياغة المحضر النهائي والدرجات المستحقة...', step: 3, isCoolingDown: false }));
      await delay(3000);

      const finalResult = await fetchWithRetry('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'final', previousFindings: allEvidence })
      });

      if (finalResult.scores) {
        const newScores: Record<number, number> = {};
        Object.entries(finalResult.scores).forEach(([k, v]) => newScores[Number(k)] = Number(v));
        setScores(newScores);

        const fullReport = `المبررات: ${(finalResult.justifications || []).join(' | ')}\nنقاط القوة: ${(finalResult.strengths || []).join(', ')}\nنقاط التطوير: ${(finalResult.weaknesses || []).join(', ')}\nالتوصية: ${finalResult.recommendation || ''}`;
        setJustification(fullReport);
      }

    } catch (err: any) {
      alert(`تنبيه: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
      setProgress({ current: 0, total: 0, status: '', step: 1, isCoolingDown: false });
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
    const message = `*نتيجة الأداء الوظيفي* 📄%0A%0A` +
      `*المعلم:* ${teacherName}%0A` +
      `*الدرجة النهائية:* ${totalScore}% (${gradeInfo.label})%0A` +
      `*المعدل:* ${gradeInfo.value} من 5%0A%0A` +
      `*ملحوظات المدير:*%0A${cleanJustification}%0A%0A` +
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
            <p>الإدارة العامة للتعليم بجدة</p>
            <p>ثانوية الأمير عبدالمجيد الأولى</p>
          </div>
          <div className="text-center w-1/3">
             <img src="https://up6.cc/2026/01/176840436497671.png" className="h-16 object-contain mb-1 mx-auto grayscale" alt="Logo" />
             <h1 className="text-lg font-black mt-2 border-2 border-black px-4 py-1 rounded-lg inline-block text-center">بطاقة الأداء الوظيفي</h1>
          </div>
          <div className="text-[10px] font-bold text-left leading-relaxed w-1/3">
            <p>التاريخ: {new Date().toLocaleDateString('ar-SA')}</p>
            <p>العام الدراسي: 1446هـ</p>
            <p>رقم الملف: {submission.id.slice(0, 8)}</p>
          </div>
        </div>

        <div className="flex gap-4 mb-4 shrink-0">
          <div className="flex-1 print-box bg-slate-50">
             <table className="w-full text-[10px]">
               <tbody>
                 <tr><td className="py-1 font-bold w-20 border-0">اسم المعلم:</td><td className="border-0">{submission.teacher?.full_name}</td></tr>
                 <tr><td className="py-1 font-bold border-0">المادة:</td><td className="border-0">{submission.subject}</td></tr>
                 <tr><td className="py-1 font-bold border-0">المقيم:</td><td className="border-0 text-slate-500">مدير المدرسة (نايف الشهري)</td></tr>
               </tbody>
             </table>
          </div>
          <div className="w-32 border-2 border-black rounded-lg flex flex-col items-center justify-center bg-slate-50 p-2 text-center">
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
                const weightedScore = (Number(scores[c.id] || 0) / 5) * c.weight;
                return (
                  <tr key={c.id}>
                    <td className="font-bold">{idx + 1}</td>
                    <td className="text-right px-2 font-semibold">{c.label}</td>
                    <td>{c.weight}</td>
                    <td className="font-black bg-slate-50">{Number.isInteger(weightedScore) ? weightedScore : weightedScore.toFixed(1)}</td>
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

        <div className="print-box h-28 mb-2 relative shrink-0">
           <h3 className="font-black text-[10px] border-b border-black inline-block mb-1">المبررات والتوصيات:</h3>
           <p className="text-[9px] leading-relaxed text-justify whitespace-pre-wrap">
             {justification || 'سيتم إدراج المبررات آلياً.'}
           </p>
        </div>

        <div className="flex justify-between items-end mt-auto px-6 pb-2 shrink-0">
          <div className="text-center w-40">
            <p className="font-bold text-[10px] mb-6">توقيع المعلم/ة</p>
            <div className="border-t border-dotted border-black pt-1">
              <p className="text-[9px]">{submission.teacher?.full_name}</p>
            </div>
          </div>
          <div className="text-center w-40">
            <p className="font-bold text-[10px] mb-6">اعتماد مدير المدرسة</p>
            <div className="border-t border-dotted border-black pt-1">
              <p className="font-black text-[10px]">نايف أحمد الشهري</p>
            </div>
          </div>
        </div>
      </div>

      {/* --- الواجهة التفاعلية --- */}
      <div className="print:hidden bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden relative">
        
        {/* شاشة التحليل والانتظار */}
        {isAnalyzing && (
          <div className="absolute inset-0 z-[300] bg-moe-navy/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-12 text-white">
             <div className="w-32 h-32 border-8 border-white/5 rounded-full flex items-center justify-center relative mb-8 shadow-xl">
                <div className={`absolute inset-0 border-8 ${progress.isCoolingDown ? 'border-amber-500' : 'border-moe-teal'} border-t-transparent rounded-full animate-spin transition-colors`}></div>
                <span className="text-5xl">{progress.isCoolingDown ? '⏳' : '🔍'}</span>
             </div>
             <h2 className="text-3xl font-black mb-4">
                {progress.isCoolingDown ? 'وضع التبريد الذكي...' : progress.step === 1 ? 'جاري جلب الملفات...' : 'يتم تحليل الشواهد الآن...'}
             </h2>
             <div className={`px-8 py-4 rounded-3xl border border-white/10 mb-8 max-w-lg ${progress.isCoolingDown ? 'bg-amber-500/10' : 'bg-white/10'}`}>
                <p className={`text-lg font-bold animate-pulse ${progress.isCoolingDown ? 'text-amber-400' : 'text-moe-teal'}`}>{progress.status}</p>
             </div>
             <div className="w-full max-w-md bg-white/5 h-4 rounded-full overflow-hidden p-1">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ${progress.isCoolingDown ? 'bg-amber-500' : 'bg-moe-teal'}`} 
                  style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }} 
                />
             </div>
          </div>
        )}

        <div className="p-6 bg-moe-navy text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-moe-teal rounded-2xl flex items-center justify-center text-2xl shadow-lg">🤖</div>
            <div>
              <h2 className="text-xl font-black">نظام التحليل التربوي الذكي</h2>
              <p className="text-[10px] text-moe-teal font-bold tracking-widest">إشراف: نايف أحمد الشهري</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-2xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50">
          <div className="grid lg:grid-cols-2 gap-12">
            
            <div className="space-y-4">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">تقدير المعايير (0-5)</h3>
              <div className="grid gap-2">
                {EVALUATION_CRITERIA.map(c => (
                  <div key={c.id} className="p-3.5 bg-white rounded-xl border border-slate-100 flex justify-between items-center group hover:border-moe-teal shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-slate-700">{c.label}</span>
                      <span className="text-[9px] text-slate-400 font-bold">الوزن: {c.weight}%</span>
                    </div>
                    <select 
                      disabled={isViewOnly}
                      value={scores[c.id]} 
                      onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                      className="bg-slate-50 px-3 py-1 rounded-lg text-xs font-black text-moe-teal outline-none border border-slate-200"
                    >
                      {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-gradient-to-br from-moe-navy to-moe-teal p-8 rounded-[2.5rem] text-white shadow-xl flex flex-col items-center justify-center gap-4">
                <h4 className="text-8xl font-black tracking-tighter drop-shadow-lg">{totalScore}%</h4>
                <div className={`px-6 py-2 rounded-2xl border border-white/10 ${gradeInfo.color} bg-white font-black text-sm`}>
                  {gradeInfo.label}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <a href={submission.drive_link} target="_blank" className="col-span-2 py-4 bg-blue-50 text-blue-600 border-2 border-blue-100 rounded-2xl font-black text-center">
                    📂 عرض مجلد الشواهد (Drive)
                  </a>

                  {!isViewOnly && (
                    <>
                      <button onClick={runAIAnalysis} className="col-span-2 py-5 bg-moe-teal text-white rounded-2xl font-black shadow-lg">
                        ⚡ بدء التحليل التتابعي الهادئ (AI)
                      </button>
                      <button onClick={saveEvaluation} disabled={isSaving} className="py-5 bg-moe-navy text-white rounded-2xl font-black shadow-lg">
                        {isSaving ? 'جاري الحفظ...' : 'اعتماد الدرجات'}
                      </button>
                      <button onClick={sendWhatsApp} className="py-5 bg-[#25D366] text-white rounded-2xl font-black shadow-lg">واتساب</button>
                      <button onClick={handlePrint} className="col-span-2 py-5 bg-slate-100 text-moe-navy rounded-2xl font-black">📄 طباعة التقرير (A4)</button>
                    </>
                  )}
              </div>

              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <h4 className="text-[11px] font-black text-slate-400 mb-4 uppercase">تبريرات التقييم:</h4>
                <div className="w-full h-40 text-xs font-bold leading-relaxed bg-slate-50/50 p-4 rounded-xl overflow-y-auto whitespace-pre-wrap text-slate-700">
                  {justification || 'سيتم إدراج المبررات هنا بعد إتمام التحليل...'}
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
