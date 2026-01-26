import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

// دعمنا أنواع ملفات أكثر لضمان عدم تجاهل أي شاهد
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic', // دعم صور الآيفون
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // ملفات الوورد
];

// دالة لجلب الملفات بشكل تكراري من المجلدات الفرعية
async function listFilesRecursive(drive: any, folderId: string, folderPath: string = "") {
  let allFiles: any[] = [];
  
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100, // نزيد العدد في البحث الأولي لنرى كل شيء
    });

    const files = response.data.files || [];

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // إذا كان مجلد، ندخل بداخله (Recursion)
        const subFolderKey = file.name; // اسم المجلد (مثلاً: استراتيجيات التدريس)
        const subFiles = await listFilesRecursive(drive, file.id, `${folderPath}${subFolderKey}/`);
        allFiles = [...allFiles, ...subFiles];
      } else if (SUPPORTED_MIME_TYPES.includes(file.mimeType)) {
        // نضيف الملف مع مساره الكامل ليعرف الذكاء الاصطناعي تبعية الملف لأي معيار
        allFiles.push({ ...file, path: folderPath + file.name, folder: folderPath });
      }
    }
  } catch (error: any) {
    console.error(`Error accessing folder ${folderId}:`, error.message);
    // نتجاهل المجلدات التي لا نملك صلاحية عليها ونكمل الباقي
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
    
    // 1. جلب كل الملفات المتاحة
    const allFiles = await listFilesRecursive(drive, folderId);
    
    if (allFiles.length === 0) return [];

    // 2. خوارزمية "الانتقاء الذكي" (Smart Sampling)
    // الهدف: أخذ عينة متوازنة من كل مجلد (معيار) بدلاً من أخذ أول 10 ملفات فقط
    
    // تجميع الملفات حسب المجلد (المعيار)
    const filesByFolder: Record<string, any[]> = {};
    allFiles.forEach(f => {
      // اسم المجلد هو المفتاح (مثلاً: "استراتيجيات التدريس/")
      const key = f.folder || 'root';
      if (!filesByFolder[key]) filesByFolder[key] = [];
      filesByFolder[key].push(f);
    });

    // اختيار ملفين من كل مجلد لضمان تغطية المعايير الـ 11
    let selectedFiles: any[] = [];
    const FILES_PER_FOLDER = 2; // نأخذ ملفين من كل معيار
    const MAX_TOTAL_FILES = 25; // الحد الأقصى الكلي لضمان سرعة التحليل

    // نمر على المجلدات ونأخذ منها بالتساوي
    Object.keys(filesByFolder).forEach(folderName => {
      // نأخذ أول ملفين من هذا المجلد
      const folderFiles = filesByFolder[folderName].slice(0, FILES_PER_FOLDER);
      selectedFiles = [...selectedFiles, ...folderFiles];
    });

    // إذا تجاوزنا الحد الأقصى الكلي، نقلص العدد
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
          name: file.path, // الاسم هنا يتضمن المسار (المعيار) وهذا مهم جداً للتحليل
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
       throw new Error('مشكلة في الصلاحيات: تأكد من مشاركة المجلد مع إيميل الخدمة.');
    }
    throw error;
  }
}

function extractFolderId(url: string): string | null {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}
