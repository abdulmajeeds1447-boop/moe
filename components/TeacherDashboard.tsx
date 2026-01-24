
'use client';

import React, { useState, useEffect } from 'react';
import { Profile, Submission } from '../types';
import { supabase } from '../services/supabaseClient';
import EvaluationModal from './EvaluationModal';

interface TeacherDashboardProps { user: Profile; }

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user }) => {
  const [driveLink, setDriveLink] = useState('');
  const [subject, setSubject] = useState('');
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { fetchSubmissions(); }, [user.id]);

  const fetchSubmissions = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('submissions')
        .select('*, teacher:profiles(*)')
        .eq('teacher_id', user.id)
        .order('submitted_at', { ascending: false });

      if (data) {
        setAllSubmissions(data as Submission[]);
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
      if (editingId) {
        const { error: updateError } = await supabase.from('submissions').update(payload).eq('id', editingId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from('submissions').insert([payload]);
        error = insertError;
      }

      if (error) throw error;
      alert(editingId ? '✅ تم تحديث بيانات الملف بنجاح' : '✅ تم إرسال رابط الشواهد لمدير المدرسة بنجاح!');
      setEditingId(null);
      setDriveLink('');
      setSubject('');
      fetchSubmissions();
    } catch (err: any) {
      alert(`عذراً، حدث خطأ: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الملف؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    try {
      const { error } = await supabase.from('submissions').delete().eq('id', id);
      if (error) throw error;
      alert('تم حذف الملف بنجاح');
      fetchSubmissions();
    } catch (err: any) {
      alert('فشل الحذف: ' + err.message);
    }
  };

  const handleEdit = (sub: Submission) => {
    setEditingId(sub.id);
    setSubject(sub.subject);
    setDriveLink(sub.drive_link);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-moe-teal border-t-transparent"></div>
      <p className="text-slate-500 font-bold">جاري تحميل بياناتك...</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20 animate-in fade-in duration-700">
      
      {/* المنصة الخارجية لإعداد التقارير */}
      <div className="bg-moe-teal rounded-[3rem] p-1 shadow-2xl overflow-hidden no-print">
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
                    <p className="text-white/80 font-black">آلية الاستخدام الصحيحة:</p>
                    <ul className="list-disc list-inside space-y-2 text-white">
                      <li>قم بتعبئة بيانات التقرير في المنصة الخارجية.</li>
                      <li>قم بطباعة التقرير كـ PDF وحفظه على جهازك.</li>
                      <li>ارفعه لمجلد Google Drive الخاص بك.</li>
                    </ul>
                  </div>
                </div>
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

      {/* نموذج إدراج الرابط */}
      <div className="bg-white rounded-[3.5rem] p-10 md:p-16 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-slate-100 space-y-12">
        <div className="flex items-center gap-6">
           <div className="w-14 h-14 bg-teal-50 text-moe-teal rounded-2xl flex items-center justify-center shadow-inner text-2xl">
             {editingId ? '✎' : '🔗'}
           </div>
           <div>
             <h3 className="text-2xl font-black text-moe-navy">
               {editingId ? 'تعديل بيانات الملف الرقمي' : 'إدراج رابط الشواهد الجديد'}
             </h3>
             <p className="text-xs text-slate-400 font-bold mt-1">
               {editingId ? 'قم بتحديث البيانات المطلوبة ثم اضغط حفظ' : 'تأكد من اكتمال كافة التقارير داخل المجلد قبل الإرسال'}
             </p>
           </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10">
          <div className="space-y-4">
             <label className="text-[11px] font-black text-slate-400 mr-2 uppercase tracking-widest">المادة الدراسية / التخصص</label>
             <input 
               type="text" 
               value={subject} 
               onChange={e => setSubject(e.target.value)}
               placeholder="مثال: لغتي - المرحلة المتوسطة"
               className="w-full px-8 py-5 bg-slate-50 rounded-2xl border-2 border-transparent outline-none focus:border-moe-teal/20 focus:bg-white focus:ring-4 focus:ring-moe-teal/5 font-bold text-slate-700 transition-all text-sm"
             />
          </div>
          <div className="space-y-4">
             <label className="text-[11px] font-black text-slate-400 mr-2 uppercase tracking-widest">رابط المجلد من Google Drive</label>
             <input 
               type="url" 
               value={driveLink} 
               onChange={e => setDriveLink(e.target.value)}
               placeholder=".../https://drive.google.com/drive/folders"
               className="w-full px-8 py-5 bg-slate-50 rounded-2xl border-2 border-transparent outline-none focus:border-moe-teal/20 focus:bg-white focus:ring-4 focus:ring-moe-teal/5 text-left font-bold text-slate-700 transition-all text-sm"
             />
          </div>
        </div>

        <div className="flex gap-4 pt-6">
          <button 
            onClick={handleSendToAdmin}
            disabled={isSending}
            className="flex-1 py-6 bg-moe-navy text-white rounded-2xl font-black shadow-2xl hover:bg-[#1a4a58] transition-all text-lg disabled:opacity-50"
          >
            {isSending ? 'جاري المعالجة...' : (editingId ? 'حفظ التعديلات' : 'تأكيد إرسال الشواهد للمدير')}
          </button>
          {editingId && (
            <button 
              onClick={() => { setEditingId(null); setSubject(''); setDriveLink(''); }}
              className="px-10 py-6 bg-slate-200 text-slate-600 rounded-2xl font-black hover:bg-slate-300 transition-all"
            >
              إلغاء التعديل
            </button>
          )}
        </div>
      </div>

      {/* سجل الملفات المرسلة */}
      <div className="space-y-6">
        <h3 className="text-2xl font-black text-moe-navy flex items-center gap-3">
          <span className="w-8 h-8 bg-moe-teal/10 text-moe-teal rounded-lg flex items-center justify-center text-sm">📋</span>
          سجل الملفات الرقمية المرسلة
        </h3>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allSubmissions.map(sub => (
            <div key={sub.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-2 h-full ${sub.status === 'evaluated' ? 'bg-green-500' : 'bg-amber-500'}`} />
              
              <div className="flex justify-between items-start mb-6">
                <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black ${sub.status === 'evaluated' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                  {sub.status === 'evaluated' ? 'تم الاعتماد' : 'بانتظار التقييم'}
                </span>
                <span className="text-[10px] font-bold text-slate-400">{new Date(sub.submitted_at).toLocaleDateString('ar-SA')}</span>
              </div>

              <h4 className="text-xl font-black text-moe-navy mb-2">{sub.subject}</h4>
              <p className="text-[11px] text-slate-400 font-bold mb-8 line-clamp-1">{sub.drive_link}</p>

              <div className="flex flex-col gap-3">
                {sub.status === 'evaluated' ? (
                  <button 
                    onClick={() => { setSelectedSubmission(sub); setShowEvaluationModal(true); }}
                    className="w-full py-4 bg-moe-teal text-white rounded-2xl font-black shadow-lg hover:brightness-110 transition-all text-xs"
                  >
                    📄 عرض التقرير المعتمد
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleEdit(sub)}
                      className="flex-1 py-4 bg-slate-100 text-moe-navy rounded-2xl font-black hover:bg-white hover:border-moe-navy border border-transparent transition-all text-xs"
                    >
                      ✎ تعديل
                    </button>
                    <button 
                      onClick={() => handleDelete(sub.id)}
                      className="flex-1 py-4 bg-red-50 text-red-500 rounded-2xl font-black hover:bg-red-500 hover:text-white transition-all text-xs"
                    >
                      🗑 حذف
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {allSubmissions.length === 0 && (
            <div className="col-span-full py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-4">
              <div className="text-4xl">📂</div>
              <p className="text-slate-400 font-bold">لا يوجد لديك ملفات مرسلة حالياً</p>
            </div>
          )}
        </div>
      </div>

      {showEvaluationModal && selectedSubmission && (
        <EvaluationModal 
          submission={selectedSubmission} 
          onClose={() => setShowEvaluationModal(false)}
          isViewOnly={true} 
        />
      )}
    </div>
  );
};

export default TeacherDashboard;
