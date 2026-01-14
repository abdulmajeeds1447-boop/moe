
import React from 'react';
import { Profile } from '../types';

interface HeaderProps {
  user: Profile;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  return (
    <header className="relative bg-[#0d333f] text-white no-print">
      {/* الخط العلوي الملون (هوية الوزارة) */}
      <div className="h-1.5 w-full bg-gradient-to-r from-[#00a19b] via-[#00737a] to-[#00a19b]"></div>
      
      <div className="container mx-auto px-4 py-8">
        {/* التوزيع الثلاثي: يمين (نصوص)، وسط (شعار)، يسار (خروج) */}
        <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-6">
          
          {/* النصوص الرسمية يمين */}
          <div className="text-[13px] font-medium space-y-1 text-center md:text-right leading-relaxed order-2 md:order-1">
            <p>المملكة العربية السعودية</p>
            <p>وزارة التعليم</p>
            <p>الإدارة العامة للتعليم بمحافظة جدة</p>
            <p className="font-bold text-lg">ثانوية الأمير عبدالمجيد الأولى</p>
          </div>
          
          {/* شعار الوزارة في الوسط تماماً */}
          <div className="flex justify-center order-1 md:order-2">
            <img 
              src="https://up6.cc/2026/01/176840436497671.png" 
              alt="وزارة التعليم" 
              className="h-28 md:h-32 object-contain transition-transform hover:scale-105 duration-500" 
            />
          </div>

          {/* زر تسجيل الخروج يسار */}
          <div className="flex justify-center md:justify-start order-3">
             <button 
               onClick={onLogout}
               className="text-[11px] uppercase font-black border border-white/20 px-6 py-2.5 rounded-xl hover:bg-white hover:text-[#0d333f] transition-all shadow-lg active:scale-95"
             >
               تسجيل الخروج
             </button>
          </div>
        </div>

        {/* تسمية القسم الملونة */}
        <div className="flex justify-center mt-8">
          <div className="inline-block px-12 py-3 bg-[#08222a] border border-teal-800/50 rounded-2xl text-sm font-bold shadow-inner text-teal-100 backdrop-blur-md">
             ( {user.role === 'admin' ? 'بوابة مدير المدرسة' : 'بوابة المعلم - نظام الأداء الرقمي'} )
          </div>
        </div>
      </div>
      
      {/* الانحناء السفلي للهيدر */}
      <div className="h-10 w-full bg-[#f8fafc] rounded-t-[4rem] -mt-5 relative z-10"></div>
    </header>
  );
};

export default Header;
