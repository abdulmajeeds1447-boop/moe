
import React from 'react';
import './globals.css';

export const metadata = {
  title: 'نظام تقييم الأداء الوظيفي | وزارة التعليم',
  description: 'منصة تقييم الأداء الرقمي الذكية',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased bg-[#f0f4f7]">
        {children}
      </body>
    </html>
  );
}
