
'use client';

import React, { useState, useEffect } from 'react';
import { Profile, Submission } from '../types';
import { supabase } from '../services/supabaseClient';
import EvaluationModal from './EvaluationModal';

interface TeacherDashboardProps { user: Profile; }

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user }) => {
  const [driveLink, setDriveLink] = useState('');
  const [subject, setSubject] = useState('');
  const [currentSubmission, setCurrentSubmission] = useState<Submission | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);

  useEffect(() => { fetchActiveSubmission(); }, [user.id]);

  const fetchActiveSubmission = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('submissions')
        .select('*, teacher:profiles(*)')
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
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-moe-teal border-t-transparent"></div>
      <p className="text-slate-500 font-bold">جاري تحميل بياناتك...</p>
    </div>
  );

  const isPending = currentSubmission?.status === 'pending';
  const isEvaluated = currentSubmission?.status === 'evaluated';

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20 animate-in fade-in duration-700">
      
      {/* المنصة الخارجية لإعداد التقارير (تصميم مطابق للصورة) */}
      <div className="bg-moe-teal rounded-[3rem] p-1 shadow-2xl overflow-hidden">
        <div className="bg-moe-teal p-8 md:p-12 text-white relative">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
            <div className="flex-1 space-y-6">
              <div className="inline-block px-4 py-1.5 bg-white text-moe-teal rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm">
                الموقع المعتمد
              </div>
              <h2 className="text-4xl font-black leading-tight">المنصة الخارجية لإعداد التقارير</h2>
              <p className="text-base opacity-90 font-bold leading-relaxed max-w-2xl">
                استخدم هذه المنصة لتوليد تقاريرك المهنية بشكل آلي وذكي وفق معايير الجودة التعليمية.
              </p>
              
              <div className="bg-black/10 backdrop-blur-sm p-6 rounded-3xl border border-white/10 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-white text-moe-teal rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-1">i</div>
                  <div className="text-[13px] font-bold space-y-3">
                    <p className="text-white/80">آلية الاستخدام الصحيحة:</p>
                    <ul className="list-disc list-inside space-y-2 text-white">
                      <li>قم بتعبئة بيانات التقرير في المنصة الخارجية.</li>
                      <li>قم <span className="text-yellow-300 underline">بطباعة التقرير كـ PDF</span> وحفظه على جهازك.</li>
                      <li>ارفعه لمجلد <span className="text-yellow-300">Google Drive</span> الخاص بك.</li>
                    </ul>
                  </div>
                </div>
                
                <div className="bg-yellow-400/10 border border-yellow-400/30 p-4 rounded-2xl flex items-start gap-3">
                  <span className="text-yellow-400 text-lg">⚠️</span>
                  <div>
                    <p className="text-yellow-400 font-black text-xs">تنبيه تقني هام جداً:</p>
                    <p className="text-white text-[11px] font-medium leading-relaxed mt-1">
                      لكي يتمكن المدير من الاطلاع على المجلد، يجب تعديل أذونات الوصول (وصول عام) وجعلها <span className="underline font-black text-yellow-300">"أي شخص لديه الرابط"</span>.
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-white/70 font-bold pt-2">
                  • بعد جمع تقاريرك وفرزها داخل مجلد الأداء الوظيفي في قوقل درايف، انسخ رابط المجلد وضعه في النموذج أدناه لتقديمه للمدير.
                </p>
              </div>
            </div>

            <a 
              href="https://majestic-basbousa-9de5cc.netlify.app/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-24 h-24 bg-white/10 hover:bg-white/20 rounded-3xl border-2 border-white/20 flex items-center justify-center backdrop-blur-md transition-all group shrink-0"
            >
              <svg className="w-10 h-10 text-white group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* نموذج إدراج الرابط (تصميم مطابق للصورة) */}
      <div className="bg-white rounded-[3.5rem] p-10 md:p-16 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-slate-100 space-y-12">
        <div className="flex items-center gap-6">
           <div className="w-14 h-14 bg-teal-50 text-moe-teal rounded-2xl flex items-center justify-center shadow-inner text-2xl">🔗</div>
           <div>
             <h3 className="text-2xl font-black text-moe-navy">إدراج رابط الشواهد النهائي</h3>
             <p className="text-xs text-slate-400 font-bold mt-1">تأكد من اكتمال كافة التقارير داخل المجلد قبل الإرسال</p>
           </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10">
          <div className="space-y-4">
             <label className="text-[11px] font-black text-slate-400 mr-2 uppercase tracking-widest">المادة الدراسية / التخصص</label>
             <input 
               type="text" 
               value={subject} 
               onChange={e => setSubject(e.target.value)}
               disabled={isPending || isEvaluated}
               placeholder="مثال: لغتي - المرحلة المتوسطة"
               className="w-full px-8 py-5 bg-slate-50 rounded-2xl border-2 border-transparent outline-none focus:border-moe-teal/20 focus:bg-white focus:ring-4 focus:ring-moe-teal/5 font-bold text-slate-700 transition-all text-sm disabled:opacity-50"
             />
          </div>
          <div className="space-y-4">
             <label className="text-[11px] font-black text-slate-400 mr-2 uppercase tracking-widest">رابط المجلد من Google Drive</label>
             <input 
               type="url" 
               value={driveLink} 
               onChange={e => setDriveLink(e.target.value)}
               disabled={isPending || isEvaluated}
               placeholder=".../https://drive.google.com/drive/folders"
               className="w-full px-8 py-5 bg-slate-50 rounded-2xl border-2 border-transparent outline-none focus:border-moe-teal/20 focus:bg-white focus:ring-4 focus:ring-moe-teal/5 text-left font-bold text-slate-700 transition-all text-sm disabled:opacity-50"
             />
          </div>
        </div>

        <div className="pt-6">
          {isPending ? (
            <div className="bg-amber-50 border-2 border-amber-100 p-10 rounded-[2.5rem] flex flex-col items-center gap-6 text-center">
               <div className="w-16 h-16 bg-amber-500 text-white rounded-full flex items-center justify-center text-3xl animate-bounce shadow-xl">⏳</div>
               <div className="space-y-2">
                 <p className="text-xl font-black text-amber-900">ملفك قيد المراجعة والتحليل</p>
                 <p className="text-sm font-bold text-amber-700/70">سيتم إشعارك فور اعتماد التقييم من قبل مدير المدرسة</p>
               </div>
            </div>
          ) : isEvaluated ? (
            <div className="bg-green-50 border-2 border-green-100 p-10 rounded-[2.5rem] flex flex-col items-center gap-6 text-center">
               <div className="w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center text-3xl shadow-xl">✓</div>
               <div className="space-y-2">
                 <p className="text-2xl font-black text-green-900">تم اعتماد تقييم الأداء بنجاح</p>
                 <p className="text-sm font-bold text-green-700/70">بإمكانك الآن تحميل نسختك الرسمية المعتمدة</p>
               </div>
               
               <div className="flex flex-wrap justify-center gap-4 mt-4">
                 <button 
                   onClick={() => setShowEvaluationModal(true)}
                   className="px-12 py-5 bg-moe-navy text-white rounded-2xl font-black shadow-xl hover:scale-105 transition-all flex items-center gap-3"
                 >
                   📄 عرض وتحميل التقرير الرسمي
                 </button>
                 <button 
                   onClick={() => { setCurrentSubmission(null); setDriveLink(''); setSubject(''); }} 
                   className="px-8 py-5 bg-white text-slate-400 border border-slate-200 rounded-2xl font-black hover:bg-slate-50 transition-all"
                 >
                   تقديم رابط جديد
                 </button>
               </div>
            </div>
          ) : (
            <button 
              onClick={handleSendToAdmin}
              disabled={isSending}
              className="w-full md:w-auto px-24 py-6 bg-moe-navy text-white rounded-2xl font-black shadow-2xl hover:bg-[#1a4a58] hover:-translate-y-1 active:translate-y-0 transition-all mx-auto block text-lg disabled:opacity-50 disabled:translate-y-0"
            >
              {isSending ? 'جاري الإرسال...' : 'تأكيد إرسال الشواهد للمدير'}
            </button>
          )}
        </div>
      </div>

      {showEvaluationModal && currentSubmission && (
        <EvaluationModal 
          submission={currentSubmission} 
          onClose={() => setShowEvaluationModal(false)}
          isViewOnly={true} 
        />
      )}
    </div>
  );
};

export default TeacherDashboard;
