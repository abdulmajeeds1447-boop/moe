
import React, { useState, useEffect } from 'react';
import { Profile, Submission } from '../types';
import { supabase } from '../services/supabaseClient';
import ReportGenerator from './ReportGenerator';

interface TeacherDashboardProps { user: Profile; }

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user }) => {
  const [driveLink, setDriveLink] = useState('');
  const [subject, setSubject] = useState('');
  const [currentSubmission, setCurrentSubmission] = useState<Submission | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showReportGenerator, setShowReportGenerator] = useState(false);

  useEffect(() => { fetchActiveSubmission(); }, [user.id]);

  const fetchActiveSubmission = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('submissions')
        .select('*')
        .eq('teacher_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setCurrentSubmission(data as Submission);
        setSubject(data.subject || '');
        setDriveLink(data.drive_link || '');
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
    setIsLoading(false);
  };

  const handleSendToAdmin = async () => {
    if (!driveLink || !driveLink.includes('drive.google.com')) {
      alert('يرجى إدخال رابط قوقل درايف صحيح');
      return;
    }
    if (!subject) {
      alert('يرجى إدخال المادة الدراسية');
      return;
    }

    setIsSending(true);
    try {
      const payload = {
        teacher_id: user.id,
        subject: subject,
        drive_link: driveLink,
        status: 'pending',
        submitted_at: new Date().toISOString()
      };

      let error;
      if (currentSubmission?.id) {
        const { error: updateError } = await supabase.from('submissions').update(payload).eq('id', currentSubmission.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from('submissions').insert([payload]);
        error = insertError;
      }

      if (error) throw error;
      alert('🚀 تم إرسال الشواهد للمدير بنجاح!');
      fetchActiveSubmission();
    } catch (err: any) {
      alert(`عذراً، حدث خطأ: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#009688] border-t-transparent"></div>
      <p className="text-slate-500 font-bold">جاري التحميل...</p>
    </div>
  );

  const isPending = currentSubmission?.status === 'pending';
  const isEvaluated = currentSubmission?.status === 'evaluated';

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* القسم العلوي: المنصة الخارجية (الكارت الأخضر) */}
      <div className="bg-[#009688] rounded-[2.5rem] p-8 md:p-14 text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
          
          <div className="flex-1 space-y-6">
            <div className="inline-block px-4 py-1.5 bg-white text-[#009688] rounded-full text-[11px] font-black uppercase tracking-wider mb-2">
              الموقع المعتمد
            </div>
            <h2 className="text-3xl md:text-4xl font-black leading-tight">المنصة الخارجية لإعداد التقارير</h2>
            <p className="text-lg opacity-90 font-medium">استخدم هذه المنصة لتوليد تقاريرك المهنية بشكل آلي وذكي وفق معايير الجودة التعليمية.</p>
            
            <div className="space-y-4 pt-4">
               <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-1">i</div>
                  <p className="text-sm font-bold">آلية الاستخدام الصحيحة:</p>
               </div>
               
               <ul className="text-[14px] space-y-3 mr-4 list-disc opacity-95 font-medium leading-relaxed">
                  <li>قم بتعبئة بيانات التقرير في المنصة الخارجية.</li>
                  <li>قم <span className="text-yellow-300 font-black">بطباعة التقرير كـ PDF</span> وحفظه على جهازك.</li>
                  <li>ارفعه لمجلد <span className="underline decoration-white/40">Google Drive</span> الخاص بك.</li>
               </ul>
               
               {/* تنبيه تقني أصفر */}
               <div className="bg-yellow-400/20 border border-yellow-400/40 p-5 rounded-3xl mt-6">
                  <div className="flex items-center gap-2 text-yellow-300 mb-2">
                    <span className="text-xl">⚠️</span>
                    <p className="text-sm font-black">تنبيه تقني هام جداً:</p>
                  </div>
                  <p className="text-[13px] leading-relaxed text-yellow-50 font-medium">
                    لكي يتمكن المدير من الاطلاع على المجلد، يجب تعديل أذونات الوصول (وصول عام) وجعلها <span className="underline text-yellow-300 font-black">"أي شخص لديه الرابط"</span>.
                  </p>
               </div>
               
               <div className="flex items-start gap-3 pt-4">
                  <span className="w-2 h-2 bg-white rounded-full shrink-0 mt-2"></span>
                  <p className="text-[13px] font-bold opacity-80 leading-relaxed">
                    بعد جمع تقاريرك وفرزها داخل مجلد الأداء الوظيفي في قوقل درايف انسخ رابط المجلد وضعه في النموذج أدناه لتقديمه للمدير.
                  </p>
               </div>
            </div>
          </div>

          {/* زر المنصة الخارجية الأيقوني (مربع كبير مع سهم) */}
          <div className="flex flex-col items-center gap-4">
            <button 
              onClick={() => setShowReportGenerator(true)}
              className="w-32 h-32 md:w-44 md:h-44 bg-white/10 border-2 border-white/30 rounded-[3rem] flex items-center justify-center hover:bg-white/20 transition-all group shrink-0 shadow-2xl active:scale-95"
            >
              <svg className="w-16 h-16 text-white group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </button>
            <p className="text-xs font-black tracking-widest opacity-60 uppercase">فتح المنصة</p>
          </div>

        </div>
      </div>

      {/* القسم السفلي: إدراج الرابط (القسم الأبيض) */}
      <div className="bg-white rounded-[3.5rem] p-12 shadow-2xl border border-slate-100 space-y-10 relative">
        <div className="flex items-center gap-5">
           <div className="w-14 h-14 bg-teal-50 text-[#009688] rounded-2xl flex items-center justify-center shadow-sm">
             <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
             </svg>
           </div>
           <h3 className="text-2xl font-black text-[#0d333f]">إدراج رابط الشواهد النهائي</h3>
        </div>

        <div className="grid md:grid-cols-2 gap-10">
          <div className="space-y-3">
             <label className="text-xs font-black text-slate-500 mr-2 uppercase tracking-tight">المادة الدراسية / التخصص</label>
             <input 
               type="text" 
               value={subject} 
               onChange={e => setSubject(e.target.value)}
               disabled={isPending}
               placeholder="مثال: لغتي - المرحلة المتوسطة"
               className="w-full px-8 py-5 bg-slate-50 rounded-3xl border-none outline-none focus:ring-4 focus:ring-[#009688]/10 font-bold text-slate-700 transition-all placeholder:text-slate-300 disabled:opacity-50 text-lg"
             />
          </div>
          <div className="space-y-3">
             <label className="text-xs font-black text-slate-500 mr-2 uppercase tracking-tight">رابط المجلد من Google Drive</label>
             <input 
               type="url" 
               value={driveLink} 
               onChange={e => setDriveLink(e.target.value)}
               disabled={isPending}
               placeholder="https://drive.google.com/drive/folders/..."
               className="w-full px-8 py-5 bg-slate-50 rounded-3xl border-none outline-none focus:ring-4 focus:ring-[#009688]/10 text-left font-bold text-slate-700 transition-all placeholder:text-slate-300 disabled:opacity-50 text-lg"
             />
          </div>
        </div>

        <div className="pt-4">
          {isPending ? (
            <div className="bg-amber-50 border border-amber-100 p-8 rounded-[2.5rem] flex items-center justify-center gap-5 text-amber-700 font-black text-lg">
               <span className="w-10 h-10 bg-amber-500 text-white rounded-full flex items-center justify-center animate-pulse">⏳</span>
               ملفك قيد المراجعة حالياً من قبل مدير المدرسة
            </div>
          ) : isEvaluated ? (
            <div className="bg-green-50 border border-green-100 p-8 rounded-[2.5rem] flex items-center justify-center gap-5 text-green-700 font-black text-lg">
               <span className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center">✓</span>
               تم تقييم ملفك بنجاح، يمكنك الاطلاع على النتيجة في الإشعارات
            </div>
          ) : (
            <button 
              onClick={handleSendToAdmin}
              disabled={isSending}
              className="w-full md:w-auto px-20 py-6 bg-[#0d333f] text-white rounded-3xl font-black shadow-2xl hover:brightness-125 hover:-translate-y-1 active:translate-y-0 transition-all mx-auto block text-xl disabled:opacity-50"
            >
              {isSending ? 'جاري الإرسال...' : 'تأكيد إرسال الشواهد للمدير'}
            </button>
          )}
        </div>
      </div>

      {showReportGenerator && (
        <ReportGenerator 
          teacherName={user.full_name} 
          onClose={() => setShowReportGenerator(false)} 
        />
      )}
    </div>
  );
};

export default TeacherDashboard;
