
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
      
      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* النصوص الرسمية يمين (مطابق للصورة) */}
          <div className="text-[13px] font-medium space-y-1 text-right leading-relaxed order-2 md:order-1">
            <p>المملكة العربية السعودية</p>
            <p>وزارة التعليم</p>
            <p>الإدارة العامة للتعليم بمحافظة جدة</p>
            <p className="font-bold text-lg">ثانوية الأمير عبدالمجيد الأولى</p>
          </div>
          
          {/* شعار الوزارة الأبيض (الرابط الجديد) */}
          <div className="order-1 md:order-2">
            <img 
              src="https://up6.cc/2026/01/176840436497671.png" 
              alt="وزارة التعليم" 
              className="h-24 object-contain" 
            />
          </div>
        </div>

        {/* تسمية القسم الملونة (مطابق للصورة تماماً) */}
        <div className="flex justify-center mt-6">
          <div className="inline-block px-12 py-2.5 bg-[#08222a] border border-teal-800/50 rounded-lg text-sm font-bold shadow-inner text-teal-100">
             ( {user.role === 'admin' ? 'بوابة مدير المدرسة' : 'بوابة المعلم - نظام الأداء الرقمي'} )
          </div>
        </div>

        {/* زر خروج جانبي */}
        <div className="absolute top-10 left-6">
           <button 
             onClick={onLogout}
             className="text-[10px] uppercase font-black border border-white/20 px-4 py-2 rounded-xl hover:bg-white hover:text-[#0d333f] transition-all"
           >
             تسجيل الخروج
           </button>
        </div>
      </div>
      
      {/* الانحناء السفلي للهيدر لمحاكاة الصورة */}
      <div className="h-8 w-full bg-[#f8fafc] rounded-t-[3rem] -mt-4 relative z-10"></div>
    </header>
  );
};

export default Header;
