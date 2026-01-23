
-- تفعيل ملحق التشفير وتوليد المعرفات
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. جدول الحسابات (Profiles)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    password_plain TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher',
    school_name TEXT DEFAULT 'ثانوية الأمير عبدالمجيد الأولى',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول التقديمات (Submissions)
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    subject TEXT NOT NULL DEFAULT 'عام',
    drive_link TEXT,
    evidence_by_criteria JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'draft',
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- إصلاح القيود (Constraints) لضمان عدم حدوث خطأ status_check
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_status_check CHECK (status IN ('draft', 'pending', 'evaluated'));

-- 3. جدول التقييمات (Evaluations)
CREATE TABLE IF NOT EXISTS evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    ai_analysis TEXT,
    scores JSONB DEFAULT '{}'::jsonb,
    total_score INTEGER DEFAULT 0,
    overall_grade TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- تفعيل سياسات الوصول (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access" ON profiles;
CREATE POLICY "Public Access" ON profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access" ON submissions;
CREATE POLICY "Public Access" ON submissions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access" ON evaluations;
CREATE POLICY "Public Access" ON evaluations FOR ALL USING (true) WITH CHECK (true);
