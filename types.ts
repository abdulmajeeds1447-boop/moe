
export type UserRole = 'teacher' | 'admin';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  school_name: string;
  phone: string;
  password_plain: string;
}

export interface EvidenceFile {
  data: string; // base64 string
  type: string; // mime type: image/jpeg or application/pdf
  name: string;
}

export interface Submission {
  id: string;
  teacher_id: string;
  drive_link: string;
  subject: string;
  submitted_at: string;
  status: 'draft' | 'pending' | 'evaluated';
  evidence_by_criteria?: Record<number, EvidenceFile[]>; 
  teacher?: Profile;
}

export interface Evaluation {
  id: string;
  submission_id: string;
  teacher_id: string;
  ai_analysis: string;
  overall_grade: string;
  total_score: number;
  scores: Record<number, number>;
  created_at: string;
}

export const EVALUATION_CRITERIA = [
  { id: 1, label: 'أداء الواجبات الوظيفية', weight: 10, examples: 'التقيد بالدوام، تأدية الحصص، المشاركة في الإشراف...' },
  { id: 2, label: 'التفاعل مع المجتمع', weight: 10, examples: 'مجتمعات التعلم المهنية، تبادل الزيارات...' },
  { id: 3, label: 'التفاعل مع أولياء الأمور', weight: 10, examples: 'التواصل الفعال، إيصال الملاحظات...' },
  { id: 4, label: 'التنويع في استراتيجيات التدريس', weight: 10, examples: 'استخدام استراتيجيات متنوعة، مراعاة الفروق...' },
  { id: 5, label: 'تحسين نتائج المتعلمين', weight: 10, examples: 'معالجة الفاقد، الخطط العلاجية، تكريم المتميزين...' },
  { id: 6, label: 'إعداد وتنفيذ خطة التعلم', weight: 10, examples: 'توزيع المنهج، إعداد الدروس والواجبات...' },
  { id: 7, label: 'توظيف تقنيات ووسائل التعلم', weight: 10, examples: 'دمج التقنية، التنويع في الوسائل...' },
  { id: 8, label: 'تهيئة البيئة التعليمية', weight: 5, examples: 'مراعاة حاجات الطلاب، التهيئة النفسية...' },
  { id: 9, label: 'الإدارة الصفية', weight: 5, examples: 'ضبط السلوك، شد الانتباه، متابعة الحضور...' },
  { id: 10, label: 'تحليل نتائج المتعلمين', weight: 10, examples: 'تحليل نتائج الاختبارات، تحديد نقاط القوة...' },
  { id: 11, label: 'تنوع أساليب التقويم', weight: 10, examples: 'تطبيق اختبارات ورقية وإلكترونية، ملفات الإنجاز...' },
];
