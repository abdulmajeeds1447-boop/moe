
import React, { useState } from 'react';

interface ReportGeneratorProps {
  onClose: () => void;
  teacherName: string;
}

const ReportGenerator: React.FC<ReportGeneratorProps> = ({ onClose, teacherName }) => {
  const [reportType, setReportType] = useState('حصة انتظار');
  const [reportData, setReportData] = useState({
    subject: '',
    class: '',
    date: new Date().toISOString().split('T')[0],
    content: '',
    goals: '',
    outcomes: ''
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col font-['Tajawal'] animate-in fade-in duration-300">
      {/* هيدر المنصة */}
      <div className="bg-[#0d333f] text-white p-6 flex justify-between items-center no-print">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#009688] rounded-xl flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-black">محرر التقارير الذكي</h2>
            <p className="text-[#009688] text-xs font-bold">إعداد شواهد الأداء المهني</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="px-6 py-2 bg-red-500/10 text-red-500 rounded-xl font-bold hover:bg-red-500 hover:text-white transition-all"
        >
          إغلاق المحرر
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row no-print">
        {/* لوحة التحكم الجانبية */}
        <div className="w-full md:w-80 bg-slate-50 border-l border-slate-200 p-6 overflow-y-auto space-y-6">
          <div>
            <label className="block text-xs font-black text-slate-400 mb-2 uppercase">نوع التقرير</label>
            <select 
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full p-3 rounded-xl border-2 border-slate-200 focus:border-[#009688] outline-none font-bold text-slate-700"
            >
              <option>حصة انتظار</option>
              <option>مجتمعات تعلم مهنية</option>
              <option>استراتيجية تدريس</option>
              <option>تواصل مع ولي أمر</option>
              <option>برنامج تقني</option>
            </select>
          </div>

          <div className="space-y-4">
            <label className="block text-xs font-black text-slate-400 uppercase">بيانات التقرير</label>
            <input 
              type="text" 
              placeholder="المادة الدراسية"
              className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-[#009688]"
              value={reportData.subject}
              onChange={(e) => setReportData({...reportData, subject: e.target.value})}
            />
            <input 
              type="text" 
              placeholder="الصف / الفصل"
              className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-[#009688]"
              value={reportData.class}
              onChange={(e) => setReportData({...reportData, class: e.target.value})}
            />
            <input 
              type="date" 
              className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-[#009688]"
              value={reportData.date}
              onChange={(e) => setReportData({...reportData, date: e.target.value})}
            />
          </div>

          <div className="pt-6 border-t border-slate-200">
             <button 
               onClick={handlePrint}
               className="w-full py-4 bg-[#009688] text-white rounded-2xl font-black shadow-lg shadow-[#009688]/20 hover:brightness-110 flex items-center justify-center gap-2"
             >
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
               طباعة التقرير (PDF)
             </button>
             <p className="text-[10px] text-slate-400 mt-4 leading-relaxed text-center">قم بطباعة التقرير كـ PDF ثم ارفعه لمجلد Google Drive الخاص بك لتتمكن من تقديمه للمدير.</p>
          </div>
        </div>

        {/* مساحة العمل (المعاينة) */}
        <div className="flex-1 bg-slate-200 p-4 md:p-10 overflow-y-auto flex justify-center">
          <div className="w-full max-w-[210mm] min-h-[297mm] bg-white shadow-2xl p-[20mm] flex flex-col">
            {/* الهيدر الرسمي في المعاينة */}
            <div className="flex justify-between items-start border-b-4 border-[#0d333f] pb-6 mb-8">
              <div className="text-right text-[12px] font-bold space-y-1">
                <p>المملكة العربية السعودية</p>
                <p>وزارة التعليم</p>
                <p>ثانوية الأمير عبدالمجيد الأولى</p>
              </div>
              <img src="https://up6.cc/2026/01/176840436497671.png" className="h-20 object-contain" alt="Logo" />
            </div>

            <div className="text-center mb-10">
              <h1 className="text-2xl font-black text-[#0d333f] underline underline-offset-8 decoration-[#009688]">
                تقرير: {reportType}
              </h1>
            </div>

            <div className="flex-1 space-y-8">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <div className="flex gap-2"><span className="font-black text-[#009688]">المعلم:</span> <span>{teacherName}</span></div>
                <div className="flex gap-2"><span className="font-black text-[#009688]">التاريخ:</span> <span>{reportData.date}</span></div>
                <div className="flex gap-2"><span className="font-black text-[#009688]">المادة:</span> <span>{reportData.subject || '---'}</span></div>
                <div className="flex gap-2"><span className="font-black text-[#009688]">الصف:</span> <span>{reportData.class || '---'}</span></div>
              </div>

              <div className="space-y-4">
                <h3 className="font-black text-lg border-r-4 border-[#009688] pr-3">وصف الإجراء المنفذ:</h3>
                <textarea 
                  className="w-full p-4 bg-slate-50 rounded-xl border-none focus:ring-0 text-sm leading-relaxed h-32 no-print"
                  placeholder="اكتب هنا تفاصيل ما قمت به..."
                  value={reportData.content}
                  onChange={(e) => setReportData({...reportData, content: e.target.value})}
                />
                <div className="hidden print:block text-sm leading-relaxed whitespace-pre-wrap min-h-[100px]">
                  {reportData.content}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-black text-lg border-r-4 border-[#009688] pr-3">الأهداف المحققة:</h3>
                <textarea 
                  className="w-full p-4 bg-slate-50 rounded-xl border-none focus:ring-0 text-sm leading-relaxed h-24 no-print"
                  placeholder="ما هي الأهداف التي تم تحقيقها؟"
                  value={reportData.goals}
                  onChange={(e) => setReportData({...reportData, goals: e.target.value})}
                />
                <div className="hidden print:block text-sm leading-relaxed whitespace-pre-wrap min-h-[60px]">
                  {reportData.goals}
                </div>
              </div>
            </div>

            <div className="mt-auto pt-10 flex justify-between items-center border-t border-slate-100">
               <div className="text-center w-40">
                  <p className="font-black text-sm mb-6">توقيع المعلم</p>
                  <p className="font-bold text-slate-400">........................</p>
               </div>
               <div className="text-center w-40">
                  <p className="font-black text-sm mb-6">يعتمد مدير المدرسة</p>
                  <p className="font-black text-slate-800 text-xs">نايف أحمد الشهري</p>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportGenerator;
