import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // تأكد أن ملف الـ CSS لديك بهذا الاسم، أو غيره إلى index.css إذا كان ذلك هو اسم ملفك

const inter = Inter({ subsets: ["latin"] }); // تم التحديث

export const metadata: Metadata = {
  title: "نظام تقييم الأداء الوظيفي",
  description: "نظام ذكي لتقييم المعلمين",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
