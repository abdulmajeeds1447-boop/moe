// types.ts

export interface Teacher {
  id: string;
  full_name: string;
  // ... any other fields
}

export interface Submission {
  id: string;
  teacher_id: string;
  teacher?: Teacher;
  subject: string;
  drive_link: string;
  status: string;
  // ... any other fields
}

// ⚠️ هام جداً: هنا تم ضبط الأوزان بدقة حسب ملف الـ PDF المرفق
export const EVALUATION_CRITERIA = [
  { id: 1, label: 'أداء الواجبات الوظيفية', weight: 10 },
  { id: 2, label: 'التفاعل مع المجتمع المهني', weight: 10 },
  { id: 3, label: 'التواصل الفعال مع أولياء الأمور', weight: 10 },
  { id: 4, label: 'التنويع في استراتيجيات التدريس', weight: 10 },
  { id: 5, label: 'تحسين نتائج المتعلمين', weight: 10 },
  { id: 6, label: 'إعداد وتنفيذ خطة التعلم', weight: 10 },
  { id: 7, label: 'توظيف تقنيات ووسائل التعلم', weight: 10 },
  { id: 8, label: 'تهيئة البيئة التعليمية', weight: 5 },  // وزن 5%
  { id: 9, label: 'الإدارة الصفية', weight: 5 },          // وزن 5%
  { id: 10, label: 'تحليل نتائج المتعلمين', weight: 10 },
  { id: 11, label: 'تنوع أساليب التقويم', weight: 10 },
];
