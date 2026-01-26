import React, { useState, useEffect } from 'react';
import { Profile } from './types.ts';
import Login from './components/Login.tsx';
import TeacherDashboard from './components/TeacherDashboard.tsx';
import AdminDashboard from './components/AdminDashboard.tsx';
import Header from './components/Header.tsx';
import { supabase } from './services/supabaseClient.ts';

const App: React.FC = () => {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const savedUser = localStorage.getItem('moe_user_session');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
      setLoading(false);
    };
    checkUser();
  }, []);

  const handleLoginSuccess = (userData: Profile) => {
    localStorage.setItem('moe_user_session', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = async () => {
    localStorage.removeItem('moe_user_session');
    setUser(null);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#009688] border-t-transparent"></div>
    </div>
  );

  if (!user) {
    return <Login onLogin={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-['Tajawal']">
      <Header user={user} onLogout={handleLogout} />
      <main className="container mx-auto px-4 py-8 flex-grow">
        {user.role === 'teacher' ? (
          <TeacherDashboard user={user} />
        ) : (
          <AdminDashboard user={user} />
        )}
      </main>
      
      <footer className="bg-white border-t border-slate-100 py-12 mt-20 no-print">
        <div className="container mx-auto px-4 flex flex-col items-center">
          <div className="group flex flex-col items-center cursor-default">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-[#009688]/10 rounded-2xl flex items-center justify-center text-[#009688] transition-all duration-500 group-hover:bg-[#009688] group-hover:text-white group-hover:rotate-[360deg] shadow-sm">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-[#009688] uppercase tracking-[0.3em] mb-1">Creative Tech</span>
                <span className="text-xl font-black text-[#0d333f] group-hover:text-[#009688] transition-colors duration-300">تصميم الأستاذ: عبدالله الشهري</span>
              </div>
            </div>
            <div className="relative w-64 h-1 bg-slate-100 rounded-full overflow-hidden mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#009688] to-transparent w-full -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            </div>
            <div className="flex items-center gap-3 text-slate-400 font-bold text-xs mb-4">
              <span>ثانوية الأمير عبدالمجيد الأولى</span>
              <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
              <span>الإدارة العامة للتعليم بجدة</span>
            </div>
            <p className="text-[10px] text-slate-300 font-medium">حقوق الملكية الفكرية والتقنية © {new Date().getFullYear()}</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;