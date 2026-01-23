
'use client';

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
      alert('يرجى إدخال رابط قوقل درايف صحيح لمجلد الشواهد');
      return;
    }
    if (!subject) {
      alert('يرجى تحديد المادة أو التخصص');
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
      alert('✅ تم إرسال رابط الشواهد لمدير المدرسة بنجاح!');
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
      <p className="text-slate-500 font-bold">جاري تحميل بياناتك...</p>
    </div>
  );

  const isPending = currentSubmission?.status === 'pending';
  const isEvaluated = currentSubmission?.status === 'evaluated';

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* القسم العلوي: دعوة للعمل */}
      <div className="bg-[#009688] rounded-[2.5rem] p-8 md:p-14 text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="flex-1 space-y-6">
            <div className="inline-block px-4 py-1.5 bg-white text-[#009688] rounded-full text-[11px] font-black uppercase tracking-wider mb-2">
              بوابة المعلم الذكية
            </div>
            <h2 className="text-3xl md:text-4xl font-black leading-tight">تقديم ملف الأداء الرقمي</h2>
            <p className="text-lg opacity-90 font-medium leading-relaxed">
              قم بجمع شواهدك في مجلد على <span className="font-black text-yellow-300">Google Drive</span>، 
              وتأكد من ضبط خصوصية الرابط إلى <span className="underline">"أي شخص لديه الرابط"</span>، ثم أدرج الرابط أدناه.
            </p>
            
            <div className="flex flex-wrap gap-4 pt-4">
              <button 
                onClick={() => setShowReportGenerator(true)}
                className="px-8 py-4 bg-[#0d333f] text-white rounded-2xl font-black text-sm hover:scale-105 transition-all shadow-xl"
              >
                فتح محرر التقارير والشواهد
              </button>
            </div>
          </div>

          <div className="w-48 h-48 bg-white/10 rounded-[3rem] border-2 border-white/20 flex items-center justify-center backdrop-blur-md">
             <img src="https://up6.cc/2026/01/176840436497671.png" alt="MOE" className="h-28 object-contain opacity-90" />
          </div>
        </div>
      </div>

      {/* القسم السفلي: إدراج الرابط */}
      <div className="bg-white rounded-[3.5rem] p-10 md:p-16 shadow-2xl border border-slate-100 space-y-12 relative">
        <div className="flex items-center gap-6">
           <div className="w-16 h-16 bg-teal-50 text-[#009688] rounded-3xl flex items-center justify-center shadow-inner">
             <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
             </svg>
           </div>
           <div>
             <h3 className="text-2xl font-black text-[#0d333f]">إدراج رابط الشواهد</h3>
             <p className="text-xs text-slate-400 font-bold mt-1">سيتم تحليل الملفات آلياً بواسطة الذكاء الاصطناعي</p>
           </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10">
          <div className="group space-y-3">
             <label className="text-[11px] font-black text-slate-400 mr-2 uppercase tracking-widest transition-colors group-focus-within:text-[#009688]">التخصص / المادة الدراسية</label>
             <input 
               type="text" 
               value={subject} 
               onChange={e => setSubject(e.target.value)}
               disabled={isPending}
               placeholder="مثال: تربية إسلامية - ثانوي"
               className="w-full px-8 py-5 bg-slate-50 rounded-3xl border-2 border-transparent outline-none focus:border-[#009688]/20 focus:bg-white focus:ring-4 focus:ring-[#009688]/5 font-bold text-slate-700 transition-all text-lg"
             />
          </div>
          <div className="group space-y-3">
             <label className="text-[11px] font-black text-slate-400 mr-2 uppercase tracking-widest transition-colors group-focus-within:text-[#009688]">رابط مجلد Google Drive</label>
             <input 
               type="url" 
               value={driveLink} 
               onChange={e => setDriveLink(e.target.value)}
               disabled={isPending}
               placeholder="https://drive.google.com/drive/folders/..."
               className="w-full px-8 py-5 bg-slate-50 rounded-3xl border-2 border-transparent outline-none focus:border-[#009688]/20 focus:bg-white focus:ring-4 focus:ring-[#009688]/5 text-left font-bold text-slate-700 transition-all text-lg"
             />
          </div>
        </div>

        <div className="pt-6">
          {isPending ? (
            <div className="bg-amber-50 border-2 border-amber-100 p-10 rounded-[3rem] flex flex-col items-center gap-6 text-center">
               <div className="w-16 h-16 bg-amber-500 text-white rounded-full flex items-center justify-center text-3xl animate-bounce shadow-xl">⏳</div>
               <div className="space-y-2">
                 <p className="text-xl font-black text-amber-900">ملفك قيد المراجعة الذكية</p>
                 <p className="text-sm font-bold text-amber-700 opacity-80">سيقوم مدير المدرسة بالاطلاع على التحليل ورصد الدرجة قريباً</p>
               </div>
            </div>
          ) : isEvaluated ? (
            <div className="bg-green-50 border-2 border-green-100 p-10 rounded-[3rem] flex flex-col items-center gap-6 text-center animate-in zoom-in-95 duration-500">
               <div className="w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center text-3xl shadow-xl">✓</div>
               <div className="space-y-2">
                 <p className="text-xl font-black text-green-900">تم الانتهاء من التقييم ورصد الدرجة</p>
                 <p className="text-sm font-bold text-green-700 opacity-80">يمكنك مراجعة تقرير الأداء في الإشعارات أو مع مدير المدرسة</p>
               </div>
               <button 
                 onClick={() => { setCurrentSubmission(null); setDriveLink(''); setSubject(''); }} 
                 className="mt-4 text-xs font-black text-green-600 underline"
               >
                 تقديم ملف جديد للفصل القادم
               </button>
            </div>
          ) : (
            <button 
              onClick={handleSendToAdmin}
              disabled={isSending}
              className="w-full md:w-auto px-24 py-7 bg-[#0d333f] text-white rounded-[2.5rem] font-black shadow-2xl hover:bg-[#1a4a58] hover:-translate-y-2 active:translate-y-0 transition-all mx-auto block text-xl disabled:opacity-50 disabled:translate-y-0"
            >
              {isSending ? (
                <span className="flex items-center gap-3">
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  جاري الإرسال...
                </span>
              ) : 'إرسال الشواهد للمدير'}
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
