import { google } from 'googleapis';

export async function getDriveFiles(folderLink: string) {
  try {
    // 1. استخراج معرف المجلد من الرابط
    const folderIdMatch = folderLink.match(/[-\w]{25,}/);
    if (!folderIdMatch) {
      throw new Error('رابط المجلد غير صالح');
    }
    const folderId = folderIdMatch[0];

    // 2. إعداد المصادقة (Auth)
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // 3. جلب قائمة الملفات داخل المجلد
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 10, // نكتفي بـ 10 ملفات للسرعة
    });

    const files = res.data.files;
    if (!files || files.length === 0) return [];

    // 4. تنزيل محتوى كل ملف (Buffer) - هذه الخطوة هي الأهم للذكاء الاصطناعي
    const filesWithContent = await Promise.all(
      files.map(async (file) => {
        // نتجاهل المجلدات الفرعية
        if (file.mimeType === 'application/vnd.google-apps.folder') return null;

        try {
          const fileRes = await drive.files.get(
            { fileId: file.id!, alt: 'media' },
            { responseType: 'arraybuffer' }
          );
          
          return {
            name: file.name,
            mimeType: file.mimeType,
            buffer: Buffer.from(fileRes.data as ArrayBuffer),
          };
        } catch (err) {
          console.error(`فشل تنزيل الملف ${file.name}:`, err);
          return null;
        }
      })
    );

    // تصفية الملفات التالفة أو المجلدات
    return filesWithContent.filter((f) => f !== null);

  } catch (error: any) {
    console.error('خطأ في Drive:', error);
    throw new Error('فشل الاتصال بـ Google Drive: ' + error.message);
  }
}
