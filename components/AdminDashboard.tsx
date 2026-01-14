
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // جلب جميع المعلمين المسجلين في المدرسة
      const { data: teachersData } = await supabase.from('profiles').select('*').eq('role', 'teacher');
      // جلب جميع التقديمات والروابط
      const { data: subsData } = await supabase.from('submissions').select('*, teacher:profiles(*)').order('submitted_at', { ascending: false });
      
      if (teachersData) setTeachers(teachersData);
      if (subsData) setSubmissions(subsData as Submission[]);
    } catch (error) {
      console.error("Error loading admin data:", error);
    } finally {
      setLoading(false);
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

  // --- واجهة ملف المعلم الشخصي (عند الضغط على الاسم) ---
  if (view === 'profile' && selectedTeacher) {
    const teacherSubs = getTeacherSubmissions(selectedTeacher.id);
    return (
      <div className="animate-in slide-in-from-left-8 duration-500 space-y-8">
        <button 
          onClick={() => { setView('list'); setSelectedTeacher(null); }}
          className="flex items-center gap-2 text-slate-500 font-bold hover:text-[#009688] transition-all bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100"
        >
          <svg className="w-5 h-5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          العودة لقائمة المعلمين
        </button>

        <div className="bg-white rounded-[3rem] shadow-xl overflow-hidden border border-slate-100">
          <div className="h-40 bg-gradient-to-r from-[#0d333f] to-[#009688] relative">
            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
          </div>
          <div className="px-10 pb-10 -mt-16 relative">
            <div className="flex flex-col md:flex-row items-end gap-6 mb-10">
              <div className="w-40 h-40 rounded-[3rem] bg-white p-2 shadow-2xl border border-slate-50">
                <div className="w-full h-full rounded-[2.5rem] bg-teal-50 flex items-center justify-center text-6xl font-black text-[#009688] border-2 border-teal-100">
                  {selectedTeacher.full_name.charAt(0)}
                </div>
              </div>
              <div className="flex-1 pb-4 text-right">
                <h2 className="text-4xl font-black text-[#0d333f] mb-2">{selectedTeacher.full_name}</h2>
                <div className="flex items-center gap-6 text-slate-500 font-bold">
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                    {selectedTeacher.school_name}
                  </span>
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                    {selectedTeacher.phone}
                  </span>
                </div>
              </div>
              <div className="pb-4">
                 <a 
                   href={`https://wa.me/966${selectedTeacher.phone.substring(1)}`} 
                   target="_blank" 
                   className="px-8 py-4 bg-[#25D366] text-white rounded-2xl font-black shadow-lg shadow-green-200 hover:brightness-110 transition-all flex items-center gap-3"
                 >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    تواصل مباشر
                 </a>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* قائمة الروابط والشواهد */}
              <div className="lg:col-span-2 space-y-6">
                <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <span className="w-2 h-8 bg-[#009688] rounded-full"></span>
                  سجل الشواهد والروابط
                </h3>
                
                <div className="grid md:grid-cols-2 gap-6">
                  {teacherSubs.map(sub => (
                    <div key={sub.id} className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 hover:border-[#009688] hover:bg-white transition-all group relative overflow-hidden">
                      <div className={`absolute top-0 right-0 w-1.5 h-full ${sub.status === 'evaluated' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                      <div className="flex justify-between items-start mb-4">
                        <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase ${sub.status === 'evaluated' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {sub.status === 'evaluated' ? 'مكتمل' : 'بانتظار التحليل'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">{new Date(sub.submitted_at).toLocaleDateString('ar-SA')}</span>
                      </div>
                      <h4 className="font-black text-slate-800 text-lg mb-2 group-hover:text-[#009688] transition-colors">{sub.subject}</h4>
                      <p className="text-xs text-slate-400 mb-6 truncate font-medium">{sub.drive_link}</p>
                      <div className="flex gap-3">
                        <a href={sub.drive_link} target="_blank" className="flex-1 py-3 bg-white border border-slate-200 rounded-2xl text-center text-xs font-black text-slate-600 hover:bg-slate-50 transition-colors">فتح الدرايف</a>
                        <button 
                          onClick={() => { setSelectedSubmission(sub); setIsModalOpen(true); }}
                          className="flex-1 py-3 bg-[#0d333f] text-white rounded-2xl text-xs font-black shadow-md hover:brightness-125 transition-all"
                        >
                          بدء التقييم الذكي
                        </button>
                      </div>
                    </div>
                  ))}
                  {teacherSubs.length === 0 && (
                    <div className="col-span-full py-24 text-center bg-slate-50 rounded-[3rem] border-4 border-dashed border-slate-100">
                      <div className="text-6xl mb-4 opacity-20">📁</div>
                      <p className="text-slate-400 font-bold text-lg">لا يوجد روابط مرفوعة لهذا المعلم حتى الآن</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ملخص الحالة */}
              <div className="space-y-6">
                 <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <span className="w-2 h-8 bg-[#0d333f] rounded-full"></span>
                  إحصائيات المعلم
                </h3>
                <div className="bg-[#0d333f] p-8 rounded-[3rem] text-white space-y-8 shadow-xl shadow-slate-200">
                   <div className="flex justify-between items-center border-b border-white/10 pb-4">
                      <span className="font-bold opacity-60">إجمالي الروابط</span>
                      <span className="text-3xl font-black">{teacherSubs.length}</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-white/10 pb-4">
                      <span className="font-bold opacity-60">بانتظار التقييم</span>
                      <span className="text-3xl font-black text-amber-400">{teacherSubs.filter(s => s.status === 'pending').length}</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-white/10 pb-4">
                      <span className="font-bold opacity-60">الروابط المكتملة</span>
                      <span className="text-3xl font-black text-green-400">{teacherSubs.filter(s => s.status === 'evaluated').length}</span>
                   </div>
                   <div className="pt-4 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#009688]">نظام الأداء الرقمي الموحد</p>
                   </div>
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

  // --- واجهة قائمة المعلمين الرئيسية (Cards View) ---
  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* صناديق الإحصائيات العلوية */}
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="bg-[#0d333f] p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-[#009688] text-[10px] font-black uppercase tracking-[0.3em] mb-3">إجمالي الكادر التعليمي</p>
            <h3 className="text-6xl font-black">{stats.totalTeachers}</h3>
          </div>
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
        </div>
        
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col justify-between group hover:shadow-xl transition-all">
           <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-400 text-[10px] font-black uppercase mb-2">تقارير بانتظار المدير</p>
                <h3 className="text-5xl font-black text-amber-500">{stats.pendingSubmissions}</h3>
              </div>
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
           </div>
           <div className="w-full bg-slate-50 h-2 rounded-full mt-8 overflow-hidden">
              <div className="bg-amber-500 h-full transition-all duration-1000" style={{width: `${(stats.pendingSubmissions/Math.max(submissions.length, 1))*100}%`}}></div>
           </div>
        </div>

        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col justify-between group hover:shadow-xl transition-all">
           <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-400 text-[10px] font-black uppercase mb-2">تقارير منتهية التحليل</p>
                <h3 className="text-5xl font-black text-green-500">{stats.completedSubmissions}</h3>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
           </div>
           <div className="w-full bg-slate-50 h-2 rounded-full mt-8 overflow-hidden">
              <div className="bg-green-500 h-full transition-all duration-1000" style={{width: `${(stats.completedSubmissions/Math.max(submissions.length, 1))*100}%`}}></div>
           </div>
        </div>
      </div>

      {/* قائمة المعلمين التفاعلية */}
      <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-10 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#009688] rounded-xl flex items-center justify-center text-white shadow-lg">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            </div>
            <h2 className="text-3xl font-black text-[#0d333f]">قائمة معلمي المدرسة</h2>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
             <div className="relative flex-1">
                <input 
                  type="text" 
                  placeholder="ابحث عن معلم..." 
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 rounded-2xl text-sm border-none focus:ring-2 focus:ring-[#009688] outline-none font-bold" 
                />
                <svg className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
             </div>
             <button onClick={loadData} className="p-4 bg-slate-50 rounded-2xl text-slate-400 hover:text-[#009688] hover:bg-white border border-transparent hover:border-slate-100 transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
             </button>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 p-10">
          {teachers.map(teacher => {
            const teacherSubs = getTeacherSubmissions(teacher.id);
            const pendingCount = teacherSubs.filter(s => s.status === 'pending').length;
            
            return (
              <div 
                key={teacher.id} 
                onClick={() => { setSelectedTeacher(teacher); setView('profile'); }}
                className="group relative bg-white border border-slate-100 rounded-[2.5rem] p-8 hover:shadow-2xl hover:shadow-teal-900/5 hover:border-[#009688] transition-all cursor-pointer overflow-hidden"
              >
                {/* تنبيه بالبريد الجديد */}
                {pendingCount > 0 && (
                  <span className="absolute top-6 left-6 w-8 h-8 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-black border-4 border-white animate-bounce shadow-lg">
                    {pendingCount}
                  </span>
                )}
                
                <div className="flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-[2rem] bg-[#009688]/10 text-[#009688] flex items-center justify-center text-4xl font-black group-hover:bg-[#009688] group-hover:text-white transition-all duration-500 mb-6 group-hover:rotate-6 shadow-sm">
                    {teacher.full_name.charAt(0)}
                  </div>
                  <h4 className="font-black text-[#0d333f] text-xl mb-1 group-hover:text-[#009688] transition-colors">{teacher.full_name}</h4>
                  <p className="text-xs text-slate-400 font-bold mb-8 uppercase tracking-widest">{teacher.phone}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-50 p-4 rounded-3xl flex flex-col items-center group-hover:bg-white group-hover:border group-hover:border-slate-100 transition-all">
                      <span className="text-[10px] font-black text-slate-400 mb-1 uppercase">الروابط</span>
                      <span className="text-xl font-black text-[#0d333f]">{teacherSubs.length}</span>
                   </div>
                   <div className="bg-teal-50/30 p-4 rounded-3xl flex flex-col items-center group-hover:bg-[#009688]/5 transition-all">
                      <span className="text-[10px] font-black text-[#009688] mb-1 uppercase">المنجز</span>
                      <span className="text-xl font-black text-[#009688]">{teacherSubs.length - pendingCount}</span>
                   </div>
                </div>

                <div className="mt-8 flex justify-center opacity-0 group-hover:opacity-100 transition-all transform translate-y-4 group-hover:translate-y-0">
                   <div className="flex items-center gap-2 px-4 py-2 bg-[#0d333f] text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg">
                      عرض الملف الكامل
                      <svg className="w-3 h-3 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                   </div>
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
