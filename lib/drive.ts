import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

// دعم أنواع ملفات أكثر لضمان عدم تجاهل أي شاهد مهم
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic', // لدعم صور الآيفون
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // ملفات الوورد
];

// دالة لجلب الملفات بشكل تكراري من المجلدات الفرعية
async function listFilesRecursive(drive: any, folderId: string, folderPath: string = "") {
  let allFiles: any[] = [];
  
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100, // نطلب عدد كبير هنا لنرى كل المحتوى داخل المجلد
    });

    const files = response.data.files || [];

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // إذا وجدنا مجلد فرعي (مثل "استراتيجيات التدريس")، ندخل بداخله
        // نضيف اسم المجلد للمسار ليعرف الذكاء الاصطناعي تبعية الملف
        const subFiles = await listFilesRecursive(drive, file.id, `${folderPath}${file.name}/`);
        allFiles = [...allFiles, ...subFiles];
      } else if (SUPPORTED_MIME_TYPES.includes(file.mimeType)) {
        // نضيف الملف للقائمة مع مساره الكامل (اسم المجلد/اسم الملف)
        allFiles.push({ ...file, path: folderPath + file.name, folderName: folderPath });
      }
    }
  } catch (error: any) {
    console.error(`تجاوز المجلد ${folderPath}:`, error.message);
    // نتجاوز المجلدات التي بها مشاكل ونكمل للبقية
  }
  return allFiles;
}

export async function getDriveFiles(folderUrl: string) {
  const folderId = extractFolderId(folderUrl);
  if (!folderId) throw new Error('رابط المجلد غير صحيح.');

  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('بيانات الاتصال (Service Account) غير مكتملة في إعدادات Vercel.');
  }

  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      SCOPES
    );

    const drive = google.drive({ version: 'v3', auth });
    
    // 1. جلب فهرس كامل لكل الملفات في كل المجلدات
    const allFilesMetadata = await listFilesRecursive(drive, folderId);
    
    if (allFilesMetadata.length === 0) return [];

    // 2. خوارزمية الانتقاء الذكي (Smart Sampling)
    // الهدف: أخذ عينة متوازنة من كل مجلد (معيار) لضمان تغطية الـ 11 معيار
    
    // تجميع الملفات حسب المجلد الذي تنتمي إليه
    const filesByFolder: Record<string, any[]> = {};
    allFilesMetadata.forEach(f => {
      const key = f.folderName || 'root';
      if (!filesByFolder[key]) filesByFolder[key] = [];
      filesByFolder[key].push(f);
    });

    let selectedFiles: any[] = [];
    const FILES_PER_FOLDER = 3; // نأخذ 3 ملفات من كل مجلد (كافية جداً للتقييم)
    const MAX_TOTAL_FILES = 45; // الحد الأقصى الكلي للملفات (للحماية من توقف السيرفر)

    // نمر على كل مجلد ونأخذ حصته
    Object.keys(filesByFolder).forEach(folder => {
      const folderFiles = filesByFolder[folder].slice(0, FILES_PER_FOLDER);
      selectedFiles = [...selectedFiles, ...folderFiles];
    });

    // تقليص العدد الكلي إذا تجاوز الحد المسموح
    if (selectedFiles.length > MAX_TOTAL_FILES) {
      selectedFiles = selectedFiles.slice(0, MAX_TOTAL_FILES);
    }

    // 3. تنزيل محتوى الملفات المختارة فقط
    const downloadPromises = selectedFiles.map(async (file) => {
      try {
        const res = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        return {
          id: file.id,
          name: file.path, // الاسم هنا يتضمن اسم المجلد (المعيار) وهذا يساعد الذكاء الاصطناعي جداً
          mimeType: file.mimeType,
          buffer: new Uint8Array(res.data as ArrayBuffer),
        };
      } catch (err) {
        return null;
      }
    });

    const results = await Promise.all(downloadPromises);
    return results.filter((f): f is NonNullable<typeof f> => f !== null);

  } catch (error: any) {
    if (error.message.includes('404')) throw new Error('المجلد غير موجود.');
    if (error.message.includes('403') || error.message.includes('client_email')) {
       throw new Error('مشكلة صلاحيات: تأكد من مشاركة المجلد مع إيميل الخدمة.');
    }
    throw error;
  }
}

function extractFolderId(url: string): string | null {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}
