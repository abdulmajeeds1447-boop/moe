
import React, { useState, useEffect } from 'react';
import { Profile, Submission } from '../types';
import { supabase } from '../services/supabaseClient';
import EvaluationModal from './EvaluationModal';

interface AdminDashboardProps {
  user: Profile;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ user }) => {
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<Profile | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'profile'>('list');

  // حالات التعديل
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editLink, setEditLink] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: teachersData } = await supabase.from('profiles').select('*').eq('role', 'teacher');
      const { data: subsData } = await supabase
        .from('submissions')
        .select('*, teacher:profiles(*)')
        .neq('status', 'draft') 
        .order('submitted_at', { ascending: false });
      
      if (teachersData) setTeachers(teachersData);
      if (subsData) setSubmissions(subsData as Submission[]);
    } catch (error) {
      console.error("Error loading admin data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الملف نهائياً؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    
    try {
      const { error } = await supabase.from('submissions').delete().eq('id', id);
      if (error) throw error;
      alert('تم الحذف بنجاح');
      loadData();
    } catch (err: any) {
      alert('فشل الحذف: ' + err.message);
    }
  };

  const startEditing = (sub: Submission) => {
    setEditingSubId(sub.id);
    setEditSubject(sub.subject);
    setEditLink(sub.drive_link);
  };

  const handleUpdateSubmission = async () => {
    try {
      const { error } = await supabase
        .from('submissions')
        .update({ subject: editSubject, drive_link: editLink })
        .eq('id', editingSubId);
      
      if (error) throw error;
      alert('تم تحديث البيانات بنجاح');
      setEditingSubId(null);
      loadData();
    } catch (err: any) {
      alert('فشل التحديث: ' + err.message);
    }
  };

  const getTeacherSubmissions = (teacherId: string) => {
    return submissions.filter(s => s.teacher_id === teacherId);
  };

  const stats = {
    totalTeachers: teachers.length,
    pendingSubmissions: submissions.filter(s => s.status === 'pending').length,
    completedSubmissions: submissions.filter(s => s.status === 'evaluated').length,
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#009688] border-t-transparent"></div>
      <p className="text-slate-500 font-bold">جاري تحميل لوحة تحكم الإدارة...</p>
    </div>
  );

  if (view === 'profile' && selectedTeacher) {
    const teacherSubs = getTeacherSubmissions(selectedTeacher.id);
    return (
      <div className="animate-in slide-in-from-left-8 duration-500 space-y-8">
        <button 
          onClick={() => { setView('list'); setSelectedTeacher(null); setEditingSubId(null); }}
          className="flex items-center gap-2 text-slate-500 font-bold hover:text-[#009688] transition-all bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100"
        >
          <svg className="w-5 h-5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          العودة لقائمة المعلمين
        </button>

        <div className="bg-white rounded-[3rem] shadow-xl overflow-hidden border border-slate-100">
          <div className="h-40 bg-gradient-to-r from-[#0d333f] to-[#009688] relative" />
          <div className="px-10 pb-10 -mt-16 relative">
            <div className="flex flex-col md:flex-row items-end gap-6 mb-10">
              <div className="w-40 h-40 rounded-[3rem] bg-white p-2 shadow-2xl border border-slate-50">
                <div className="w-full h-full rounded-[2.5rem] bg-teal-50 flex items-center justify-center text-6xl font-black text-[#009688]">
                  {selectedTeacher.full_name.charAt(0)}
                </div>
              </div>
              <div className="flex-1 pb-4 text-right">
                <h2 className="text-4xl font-black text-[#0d333f] mb-2">{selectedTeacher.full_name}</h2>
                <p className="text-slate-500 font-bold">{selectedTeacher.phone}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <h3 className="text-2xl font-black text-slate-800">الملفات المرسلة للتقييم</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  {teacherSubs.map(sub => (
                    <div key={sub.id} className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 hover:border-[#009688] transition-all group relative">
                      <div className={`absolute top-0 right-0 w-1.5 h-full ${sub.status === 'evaluated' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                      
                      {/* أزرار التحكم في أعلى الكارد */}
                      <div className="absolute top-4 left-4 flex gap-2 no-print">
                        <button 
                          onClick={() => startEditing(sub)}
                          className="w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-moe-teal transition-colors shadow-sm"
                          title="تعديل المحتوى"
                        >
                          ✎
                        </button>
                        <button 
                          onClick={() => handleDeleteSubmission(sub.id)}
                          className="w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors shadow-sm"
                          title="حذف الملف"
                        >
                          🗑
                        </button>
                      </div>

                      <div className="flex justify-between items-start mb-4">
                        <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black ${sub.status === 'evaluated' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {sub.status === 'evaluated' ? 'مكتمل' : 'بانتظار التحليل'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">{new Date(sub.submitted_at).toLocaleDateString('ar-SA')}</span>
                      </div>

                      {editingSubId === sub.id ? (
                        <div className="space-y-3 mb-6 animate-in fade-in zoom-in-95 duration-200">
                          <input 
                            type="text" 
                            value={editSubject} 
                            onChange={e => setEditSubject(e.target.value)}
                            className="w-full px-4 py-2 bg-white rounded-lg border border-slate-200 text-xs font-bold outline-none focus:ring-2 focus:ring-moe-teal"
                            placeholder="اسم المادة"
                          />
                          <input 
                            type="text" 
                            value={editLink} 
                            onChange={e => setEditLink(e.target.value)}
                            className="w-full px-4 py-2 bg-white rounded-lg border border-slate-200 text-xs font-bold text-left outline-none focus:ring-2 focus:ring-moe-teal"
                            placeholder="رابط الدرايف"
                          />
                          <div className="flex gap-2">
                            <button onClick={handleUpdateSubmission} className="flex-1 py-2 bg-moe-teal text-white rounded-lg text-[10px] font-black">حفظ</button>
                            <button onClick={() => setEditingSubId(null)} className="flex-1 py-2 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black">إلغاء</button>
                          </div>
                        </div>
                      ) : (
                        <h4 className="font-black text-slate-800 text-lg mb-6">{sub.subject}</h4>
                      )}

                      <button 
                        onClick={() => { setSelectedSubmission(sub); setIsModalOpen(true); }}
                        className="w-full py-4 bg-[#0d333f] text-white rounded-2xl text-xs font-black shadow-md hover:brightness-125 transition-all"
                      >
                        فتح وتحليل الملف الرقمي
                      </button>
                    </div>
                  ))}
                  {teacherSubs.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-slate-50 rounded-[3rem] border-2 border-dashed">
                      <p className="text-slate-400 font-bold">لا توجد ملفات مكتملة مرسلة حالياً</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-[#0d333f] p-8 rounded-[3rem] text-white self-start">
                 <h4 className="text-xl font-black mb-6">إحصائيات الملف</h4>
                 <div className="space-y-4">
                    <div className="flex justify-between"><span className="opacity-60">المرسل</span><span className="font-bold">{teacherSubs.length}</span></div>
                    <div className="flex justify-between"><span className="opacity-60">بانتظار التقييم</span><span className="font-bold text-amber-400">{teacherSubs.filter(s=>s.status==='pending').length}</span></div>
                 </div>
              </div>
            </div>
          </div>
        </div>
        {isModalOpen && selectedSubmission && (
          <EvaluationModal submission={selectedSubmission} onClose={() => { setIsModalOpen(false); loadData(); }} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="bg-[#0d333f] p-10 rounded-[3rem] text-white shadow-2xl">
          <p className="text-[#009688] text-[10px] font-black uppercase tracking-widest mb-3">إجمالي المعلمين</p>
          <h3 className="text-6xl font-black">{stats.totalTeachers}</h3>
        </div>
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-black mb-3">ملفات بانتظار التحليل</p>
          <h3 className="text-6xl font-black text-amber-500">{stats.pendingSubmissions}</h3>
        </div>
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-black mb-3">ملفات منتهية</p>
          <h3 className="text-6xl font-black text-green-500">{stats.completedSubmissions}</h3>
        </div>
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden p-10">
        <h2 className="text-3xl font-black text-[#0d333f] mb-10">معلمي المدرسة (الملفات الرقمية)</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {teachers.map(teacher => {
            const pendingCount = submissions.filter(s => s.teacher_id === teacher.id && s.status === 'pending').length;
            return (
              <div 
                key={teacher.id} 
                onClick={() => { setSelectedTeacher(teacher); setView('profile'); }}
                className="group bg-white border border-slate-100 rounded-[2.5rem] p-8 hover:border-[#009688] transition-all cursor-pointer relative"
              >
                {pendingCount > 0 && (
                  <span className="absolute -top-2 -left-2 bg-amber-500 text-white px-4 py-1 rounded-full text-[10px] font-black shadow-lg animate-bounce">
                    لديه {pendingCount} ملفات جديدة
                  </span>
                )}
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 rounded-3xl bg-teal-50 text-[#009688] flex items-center justify-center text-3xl font-black mb-4 group-hover:bg-[#009688] group-hover:text-white transition-all">
                    {teacher.full_name.charAt(0)}
                  </div>
                  <h4 className="font-black text-[#0d333f]">{teacher.full_name}</h4>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">عرض الملف الرقمي ←</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
