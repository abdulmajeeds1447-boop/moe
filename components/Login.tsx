import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient.ts';

const Login: React.FC<{ onLogin: (userData: any) => void }> = ({ onLogin }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!/^\d{10}$/.test(phone)) {
      alert('يرجى إدخال رقم جوال صحيح مكون من 10 أرقام');
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        const { data: existing } = await supabase.from('profiles').select('id').eq('phone', phone).maybeSingle();
        if (existing) {
          alert('هذا الرقم مسجل مسبقاً');
          setIsSignUp(false);
          setLoading(false);
          return;
        }
        const { error } = await supabase.from('profiles').insert([{
          full_name: fullName,
          phone: phone,
          password_plain: password,
          role: 'teacher',
          school_name: 'مدرسة الأمير عبدالمجيد الأولى'
        }]);
        if (error) throw error;
        alert('تم إنشاء الحساب بنجاح!');
        setIsSignUp(false);
      } else {
        const { data, error } = await supabase.from('profiles').select('*').eq('phone', phone).eq('password_plain', password).maybeSingle();
        if (error) throw error;
        if (!data) {
          alert('بيانات الدخول غير صحيحة');
          setLoading(false);
          return;
        }
        // بدلاً من تحديث الصفحة، نقوم بتحديث الـ State في المكون الأب فوراً
        onLogin(data);
      }
    } catch (err: any) {
      alert('حدث خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f7] p-4 font-['Tajawal']">
      <div className="bg-white w-full max-w-[450px] rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden">
        {/* الجزء العلوي الملون (مطابق للصورة) */}
        <div className="bg-[#009688] pt-12 pb-10 px-6 text-white text-center relative">
          <div className="bg-white/20 w-24 h-24 mx-auto rounded-2xl flex items-center justify-center backdrop-blur-md mb-6 border border-white/30 shadow-inner">
            <img src="https://up6.cc/2026/01/176840436497671.png" alt="Logo" className="h-16 object-contain" />
          </div>
          <h1 className="text-2xl font-black mb-1">نظام الأداء الوظيفي الرقمي</h1>
          <p className="text-sm font-medium opacity-90">بوابة الدخول الموحدة للمعلمين والمدراء</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-10 space-y-6">
          {isSignUp && (
            <div className="space-y-1">
              <label className="block text-sm font-bold text-slate-600 mr-2">الاسم الرباعي</label>
              <input 
                type="text" 
                value={fullName} 
                onChange={e => setFullName(e.target.value)} 
                className="w-full p-4 bg-[#f8fafc] rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#009688] transition-all" 
                placeholder="أدخل اسمك الكامل"
                required 
              />
            </div>
          )}
          
          <div className="space-y-1">
            <label className="block text-sm font-bold text-slate-600 mr-2">رقم الجوال</label>
            <input 
              type="tel" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              className="w-full p-4 bg-[#f8fafc] rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#009688] text-left transition-all placeholder:text-slate-300" 
              placeholder="05xxxxxxxx"
              required 
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-bold text-slate-600 mr-2">كلمة المرور</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="w-full p-4 bg-[#f8fafc] rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#009688] text-left transition-all placeholder:text-slate-300" 
              placeholder="••••••••"
              required 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full py-4 bg-[#009688] text-white rounded-2xl font-black shadow-lg shadow-[#009688]/20 hover:bg-[#00897b] active:scale-[0.98] transition-all disabled:opacity-50 mt-4"
          >
            {loading ? 'جاري التحقق...' : (isSignUp ? 'إنشاء حساب جديد' : 'دخول النظام')}
          </button>
          
          <button 
            type="button" 
            onClick={() => setIsSignUp(!isSignUp)} 
            className="w-full text-sm text-[#009688] font-bold mt-2 hover:underline"
          >
            {isSignUp ? 'لديك حساب؟ سجل دخولك' : 'ليس لديك حساب؟ سجل كمعلم جديد'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;