
import React, { useState, useEffect } from 'react';
import { Submission, EVALUATION_CRITERIA } from '../types';
import { analyzeTeacherReport } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

const EvaluationModal: React.FC<{ submission: Submission; onClose: () => void }> = ({ submission, onClose }) => {
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [scores, setScores] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
  });

  useEffect(() => { loadExistingEvaluation(); }, [submission.id]);

  const loadExistingEvaluation = async () => {
    const { data } = await supabase.from('evaluations').select('*').eq('submission_id', submission.id).maybeSingle();
    if (data) {
      setAiAnalysis(data.ai_analysis);
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

  const runAIAnalysis = async () => {
    if (!submission.drive_link) {
      alert('لا يوجد رابط Google Drive لتحليله');
      return;
    }
    
    setIsAnalyzing(true);
    setAnalysisStatus('جاري الاتصال بـ Google Drive...');
    
    // تغيير رسائل الحالة كل بضع ثوانٍ لإعطاء شعور بالتقدم
    const statusInterval = setInterval(() => {
      const statuses = [
        'جاري تحميل الملفات والصور من المجلد...',
        'جاري استخراج النصوص من ملفات الـ PDF...',
        'الذكاء الاصطناعي يقوم بمراجعة الشواهد الآن...',
        'جاري مطابقة الأدلة مع معايير الأداء الوظيفي...',
        'لحظات.. يتم صياغة المبررات والدرجات المقترحة...'
      ];
      setAnalysisStatus(prev => {
        const currentIndex = statuses.indexOf(prev);
        return statuses[(currentIndex + 1) % statuses.length];
      });
    }, 4000);

    try {
      const data = await analyzeTeacherReport(submission.drive_link);
      if (data) {
        setAiAnalysis(data.reasons || data.summary);
        if (data.suggested_scores) {
          setScores(data.suggested_scores); 
        }
      }
    } catch (err: any) {
      console.error("AI Error:", err);
      alert(`حدث خطأ أثناء تحليل الرابط: ${err.message}`);
    } finally {
      clearInterval(statusInterval);
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const saveEvaluation = async () => {
    setIsSaving(true);
    try {
      await supabase.from('evaluations').upsert({
        submission_id: submission.id,
        teacher_id: submission.teacher_id,
        ai_analysis: aiAnalysis,
        scores: scores,
        total_score: calculateTotal(),
        overall_grade: getGrade(calculateTotal()),
        created_at: new Date().toISOString()
      }, { onConflict: 'submission_id' });

      await supabase.from('submissions').update({ status: 'evaluated' }).eq('id', submission.id);
      alert('✅ تم حفظ ورصد الدرجات بنجاح.');
      onClose();
    } catch (err) {
      alert('خطأ في الحفظ');
    } finally {
      setIsSaving(false);
    }
  };

  const getGrade = (t: number) => {
    if (t >= 90) return 'ممتاز';
    if (t >= 80) return 'جيد جداً';
    if (t >= 70) return 'جيد';
    if (t >= 60) return 'مرضي';
    return 'غير مرضي';
  };

  const totalScore = calculateTotal();
  const grade = getGrade(totalScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto font-['Tajawal']">
      <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        <div className="p-8 bg-[#0d333f] text-white flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-black">تحليل ملف الشواهد الرقمي</h2>
            <p className="text-[11px] text-teal-400 mt-1 font-bold">المعلم: {submission.teacher?.full_name} | المادة: {submission.subject}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-all text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
          <div className="grid lg:grid-cols-2 gap-10">
            
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">بطاقة الأداء الوظيفي</h3>
                <a href={submission.drive_link} target="_blank" rel="noreferrer" className="text-[10px] font-black text-[#009688] underline">فتح مجلد الشواهد يدوياً</a>
              </div>
              
              <div className="space-y-4">
                {EVALUATION_CRITERIA.map(c => {
                  const score = scores[c.id] || 0;
                  return (
                    <div key={c.id} className={`p-5 rounded-3xl border bg-white transition-all shadow-sm ${score === 0 ? 'border-red-50' : 'border-slate-100'}`}>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-slate-700 leading-tight flex-1 ml-4">{c.id}. {c.label}</span>
                        <select 
                          value={score} 
                          onChange={e => setScores(p => ({...p, [c.id]: parseInt(e.target.value)}))}
                          className={`px-4 py-2 rounded-xl text-sm font-black outline-none border-2 transition-all ${score === 0 ? 'bg-red-50 border-red-100 text-red-500' : 'bg-slate-50 border-slate-100 text-[#009688]'}`}
                        >
                          {[5,4,3,2,1,0].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-8 lg:sticky lg:top-0">
              <div className="bg-gradient-to-br from-[#009688] to-[#00737a] p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
                <div className="relative z-10 flex justify-between items-center">
                  <div>
                    <p className="text-[11px] opacity-80 font-black mb-1">الدرجة النهائية المستحقة</p>
                    <h4 className="text-5xl font-black">{totalScore}%</h4>
                  </div>
                  <div className="text-center px-6 py-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30">
                    <p className="text-[10px] opacity-80 font-black uppercase mb-1">التقدير العام</p>
                    <p className="text-xl font-black">{grade}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <button 
                  onClick={runAIAnalysis} 
                  disabled={isAnalyzing} 
                  className="w-full py-6 bg-white border-2 border-[#009688] text-[#009688] rounded-3xl font-black hover:bg-[#009688] hover:text-white transition-all disabled:opacity-50 flex flex-col items-center justify-center gap-2 shadow-xl group"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#009688] border-t-transparent group-hover:border-white"></div>
                      <span className="text-sm font-bold">{analysisStatus}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xl">🤖</span>
                      <span className="text-sm">بدء التحليل الذكي لرابط Google Drive</span>
                    </>
                  )}
                </button>
                <p className="text-[10px] text-center text-slate-400 font-bold italic">ملاحظة: التحليل قد يستغرق من 30 ثانية إلى دقيقة حسب عدد ملفات الـ PDF.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-[#009688] flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#009688] rounded-full"></span>
                  توصيات ومبررات التقييم (تظهر للمعلم):
                </h4>
                <textarea 
                  value={aiAnalysis} 
                  onChange={e => setAiAnalysis(e.target.value)} 
                  className="w-full h-64 text-sm leading-relaxed font-bold bg-slate-50/50 p-4 rounded-2xl border-none outline-none resize-none focus:ring-2 focus:ring-[#009688]/10" 
                  placeholder="سيتم كتابة المبررات هنا آلياً بعد التحليل..." 
                />
              </div>

              <div className="flex gap-4">
                <button onClick={saveEvaluation} disabled={isSaving || isAnalyzing} className="flex-1 py-5 bg-[#0d333f] text-white rounded-2xl font-black shadow-2xl hover:brightness-125 transition-all text-lg disabled:opacity-50">
                  {isSaving ? 'جاري الاعتماد...' : 'اعتماد ورصد الدرجات'}
                </button>
                <button 
                  onClick={() => {
                    const teacherPhone = submission.teacher?.phone || '';
                    const message = `السلام عليكم أ/ ${submission.teacher?.full_name}%0Aتم رصد تقييم ملفكم الرقمي بنسبة: ${totalScore}% (%20${grade}).%0Aشكراً لكم.`;
                    window.open(`https://wa.me/966${teacherPhone.startsWith('0') ? teacherPhone.substring(1) : teacherPhone}?text=${message}`, '_blank');
                  }} 
                  className="w-20 py-5 bg-green-500 text-white rounded-2xl font-black shadow-xl hover:bg-green-600 transition-all flex items-center justify-center text-2xl"
                  title="إرسال النتيجة عبر واتساب"
                >
                  💬
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationModal;
