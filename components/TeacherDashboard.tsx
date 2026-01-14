
import React, { useState, useEffect } from 'react';
import { Profile, Submission } from '../types';
import { supabase } from '../services/supabaseClient';

interface TeacherDashboardProps {
  user: Profile;
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user }) => {
  const [driveLink, setDriveLink] = useState('');
  const [subject, setSubject] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchSubmissions();
  }, [user.id]);

  const fetchSubmissions = async () => {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('teacher_id', user.id)
      .order('submitted_at', { ascending: false });
    
    if (!error && data) setSubmissions(data as Submission[]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const { error } = await supabase.from('submissions').insert([
      {
        teacher_id: user.id,
        drive_link: driveLink,
        subject: subject,
      }
    ]);

    if (!error) {
      alert('تم إدراج الرابط بنجاح');
      setDriveLink('');
      setSubject('');
      fetchSubmissions();
    } else {
      alert('حدث خطأ أثناء الإرسال');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* المنصة الخارجية لإعداد التقارير - التصميم الجديد والأخضر المميز */}
      <div className="no-print">
        <div 
          onClick={() => window.open('https://majestic-basbousa-9de5cc.netlify.app/', '_blank')}
          className="bg-gradient-to-br from-[#009688] to-[#00737a] p-10 rounded-[2.5rem] text-white shadow-2xl hover:shadow-[#009688]/30 transition-all group cursor-pointer border border-white/20 relative overflow-hidden"
        >
          {/* تأثير ضوئي خلفي */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/10 transition-colors"></div>
          
          <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
            <div className="w-24 h-24 bg-white/10 rounded-[2rem] flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner backdrop-blur-xl border border-white/20">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </div>
            
            <div className="flex-1 text-center md:text-right">
              <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
                <h3 className="text-3xl font-black">المنصة الخارجية لإعداد التقارير</h3>
                <span className="bg-white text-[#00737a] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest inline-block w-fit mx-auto md:mx-0 shadow-sm">الموقع المعتمد</span>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm opacity-95 font-bold leading-relaxed">
                  استخدم هذه المنصة لتوليد تقاريرك المهنية بشكل آلي وذكي وفق معايير الجودة التعليمية.
                </p>
                
                {/* الشرح التفصيلي المطلوب */}
                <div className="bg-black/20 p-6 rounded-[2rem] border border-white/10 backdrop-blur-sm">
                  <p className="text-xs font-black text-teal-100 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                    </svg>
                    آلية الاستخدام الصحيحة:
                  </p>
                  <ul className="text-sm space-y-2 text-white font-medium list-disc list-inside">
                    <li>قم بتعبئة بيانات التقرير في المنصة الخارجية.</li>
                    <li><span className="text-yellow-300 font-black">قم بطباعة التقرير كـ PDF</span> وحفظه على جهازك.</li>
                    <li>ارفعه لمجلد <span className="underline">Google Drive</span> الخاص بك.</li>
                    <li>انسخ رابط الملف وضعه في النموذج أدناه لتقديمه للمدير.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* نموذج إرسال الرابط */}
      <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 no-print">
        <h2 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-4">
          <div className="w-10 h-10 bg-[#009688]/10 rounded-xl flex items-center justify-center text-[#009688]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
          </div>
          إدراج رابط الشواهد النهائي
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="block text-sm font-bold text-slate-700 mr-2">المادة الدراسية / التخصص</label>
              <input 
                type="text" 
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl bg-[#f8fafc] border-2 border-transparent focus:border-[#009688] focus:bg-white outline-none transition-all placeholder:text-slate-300 font-bold"
                placeholder="مثال: لغتي - المرحلة المتوسطة"
              />
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-bold text-slate-700 mr-2">رابط الملف من Google Drive</label>
              <input 
                type="url" 
                required
                value={driveLink}
                onChange={(e) => setDriveLink(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl bg-[#f8fafc] border-2 border-transparent focus:border-[#009688] focus:bg-white outline-none transition-all placeholder:text-slate-300 text-left font-bold"
                placeholder="https://drive.google.com/..."
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full md:w-auto px-16 py-5 bg-[#0d333f] text-white rounded-[2rem] font-black shadow-xl shadow-[#0d333f]/10 hover:brightness-125 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'جاري الحفظ...' : 'تأكيد إرسال الشواهد للمدير'}
          </button>
        </form>
      </div>

      {/* الجدول */}
      <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
        <h2 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
           <span className="w-2 h-6 bg-amber-500 rounded-full"></span>
           أرشيف الروابط والتقارير المقدمة
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-6 font-black text-slate-400 text-xs uppercase tracking-widest">المادة الدراسية</th>
                <th className="pb-6 font-black text-slate-400 text-xs text-center">تاريخ التقديم</th>
                <th className="pb-6 font-black text-slate-400 text-xs text-center">حالة الاعتماد</th>
                <th className="pb-6 font-black text-slate-400 text-xs text-left">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {submissions.map(sub => (
                <tr key={sub.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="py-6 font-bold text-slate-700">{sub.subject}</td>
                  <td className="py-6 text-center text-slate-500 text-sm font-medium">
                    {new Date(sub.submitted_at).toLocaleDateString('ar-SA')}
                  </td>
                  <td className="py-6 text-center">
                    <span className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase ${
                      sub.status === 'evaluated' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {sub.status === 'evaluated' ? 'معتمد ومقيم' : 'بانتظار المراجعة'}
                    </span>
                  </td>
                  <td className="py-6 text-left">
                    <a href={sub.drive_link} target="_blank" className="inline-flex items-center gap-2 text-[#009688] font-black text-xs hover:bg-[#009688] hover:text-white px-4 py-2 rounded-lg border border-[#009688]/20 transition-all">
                      عرض الشاهد
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {submissions.length === 0 && (
            <div className="py-20 text-center text-slate-300 font-bold italic">لا توجد سجلات سابقة</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
