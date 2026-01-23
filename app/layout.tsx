
import React from 'react';
import './globals.css';

export const metadata = {
  title: 'نظام تقييم الأداء الوظيفي | وزارة التعليم',
  description: 'منصة تقييم الأداء الرقمي الذكية - تصميم أ. عبدالله الشهري',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="icon" href="https://up6.cc/2026/01/176840436497671.png" />
      </head>
      <body className="antialiased font-tajawal">
        {children}
      </body>
    </html>
  );
}
