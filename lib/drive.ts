import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

// دعم شامل لكل أنواع الملفات المحتملة
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

/**
 * دالة استخراج معرف المجلد من الرابط
 */
function extractFolderId(url: string): string | null {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}

/**
 * دالة البحث التكراري (Recursive) داخل المجلدات
 */
async function listFilesRecursive(drive: any, folderId: string, folderPath: string = "") {
  let allFiles: any[] = [];
  
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100, // نطلب 100 لضمان رؤية كل شيء
    });

    const files = response.data.files || [];

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // إذا كان مجلد، ندخل بداخله (Recursion)
        // نمرر اسم المجلد الحالي كجزء من المسار
        const subFiles = await listFilesRecursive(drive, file.id, `${folderPath}${file.name}/`);
        allFiles = [...allFiles, ...subFiles];
      } else if (SUPPORTED_MIME_TYPES.includes(file.mimeType)) {
        // نسجل الملف مع مساره الكامل
        allFiles.push({ ...file, path: folderPath + file.name, folderName: folderPath });
      }
    }
  } catch (error: any) {
    console.error(`Warning: Could not access folder ${folderPath}:`, error.message);
    // لا نوقف العملية، بل نتجاوز المجلد التالف
  }
  return allFiles;
}

/**
 * الدالة الرئيسية لجلب الملفات
 */
export async function getDriveFiles(folderUrl: string) {
  // 1. التحقق من الرابط
  const folderId = extractFolderId(folderUrl);
  if (!folderId) throw new Error('رابط المجلد غير صحيح (تأكد من الرابط).');

  // 2. التحقق الذكي من المتغيرات (يدعم كل الاحتمالات)
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKeyRaw) {
    console.error("Missing Env Vars:", { 
      hasEmail: !!clientEmail, 
      hasKey: !!privateKeyRaw 
    });
    throw new Error('بيانات الاتصال بجوجل (Service Account) ناقصة في إعدادات Vercel.');
  }

  // معالجة المفتاح السري بدقة (لحل مشاكل النسخ واللصق)
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  try {
    // 3. الاتصال بجوجل
    const auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
      SCOPES
    );

    const drive = google.drive({ version: 'v3', auth });
    
    // 4. جلب "خريطة" لكل الملفات في كل المجلدات
    const allFilesMetadata = await listFilesRecursive(drive, folderId);
    
    if (allFilesMetadata.length === 0) {
      // إذا لم يجد شيئاً، قد يكون المجلد فارغاً أو الصلاحيات ناقصة
      return []; 
    }

    // 5. خوارزمية الانتقاء الذكي (Smart Sampling)
    // تجميع الملفات حسب المعيار (المجلد)
    const filesByFolder: Record<string, any[]> = {};
    allFilesMetadata.forEach(f => {
      const key = f.folderName || 'General';
      if (!filesByFolder[key]) filesByFolder[key] = [];
      filesByFolder[key].push(f);
    });

    let selectedFiles: any[] = [];
    const FILES_PER_FOLDER = 3; // نأخذ 3 ملفات من كل معيار
    const MAX_TOTAL_FILES = 45; // الحد الأقصى الكلي للأمان

    Object.keys(filesByFolder).forEach(folder => {
      const folderFiles = filesByFolder[folder].slice(0, FILES_PER_FOLDER);
      selectedFiles = [...selectedFiles, ...folderFiles];
    });

    // تقليص العدد إذا تجاوز الحد
    if (selectedFiles.length > MAX_TOTAL_FILES) {
      selectedFiles = selectedFiles.slice(0, MAX_TOTAL_FILES);
    }

    // 6. تحميل محتوى الملفات (Download Content)
    const downloadPromises = selectedFiles.map(async (file) => {
      try {
        const res = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        return {
          id: file.id,
          name: file.path, // الاسم يتضمن المسار
          mimeType: file.mimeType,
          buffer: new Uint8Array(res.data as ArrayBuffer),
        };
      } catch (err) {
        console.error(`Failed to download file ${file.name}`);
        return null;
      }
    });

    const results = await Promise.all(downloadPromises);
    const finalFiles = results.filter((f): f is NonNullable<typeof f> => f !== null);

    if (finalFiles.length === 0) {
        throw new Error('فشل تحميل محتوى الملفات (قد تكون تالفة أو كبيرة جداً).');
    }

    return finalFiles;

  } catch (error: any) {
    // تحسين رسائل الخطأ للمستخدم
    if (error.message.includes('404')) {
        throw new Error('المجلد غير موجود (404). تأكد أن الرابط صحيح.');
    }
    if (error.message.includes('403') || error.message.includes('client_email')) {
       throw new Error(`خطأ صلاحيات (403): يجب مشاركة المجلد مع الإيميل: ${clientEmail} وجعله "عارض" (Viewer).`);
    }
    console.error("Drive Error Details:", error);
    throw error;
  }
}
