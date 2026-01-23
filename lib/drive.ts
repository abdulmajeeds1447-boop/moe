
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

async function listFilesRecursive(drive: any, folderId: string, folderPath: string = "") {
  let allFiles: any[] = [];
  
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
  });

  const files = response.data.files || [];

  for (const file of files) {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      // إذا كان مجلداً، ادخل بداخله
      const subFiles = await listFilesRecursive(drive, file.id, `${folderPath}${file.name} / `);
      allFiles = [...allFiles, ...subFiles];
    } else if (file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/')) {
      // إذا كان ملفاً مدعوماً، أضفه مع مساره
      allFiles.push({ ...file, path: folderPath + file.name });
    }
  }
  return allFiles;
}

export async function getDriveFiles(folderUrl: string) {
  try {
    const folderId = extractFolderId(folderUrl);
    if (!folderId) throw new Error('رابط مجلد Google Drive غير صالح');

    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      SCOPES
    );

    const drive = google.drive({ version: 'v3', auth });

    // جلب كافة الملفات من المجلد الرئيسي والفرعي
    const filesMetadata = await listFilesRecursive(drive, folderId);
    
    if (filesMetadata.length === 0) return [];

    // تحميل محتوى الملفات (أول 15 ملف فقط لضمان سرعة الـ API)
    const limitedFiles = filesMetadata.slice(0, 15);
    const downloadPromises = limitedFiles.map(async (file) => {
      try {
        const res = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        return {
          id: file.id,
          name: file.path, // نستخدم المسار الكامل كاسم ليعرفه الذكاء الاصطناعي
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
    console.error('Google Drive Error:', error.message);
    throw new Error('فشل الوصول لمجلد الشواهد. تأكد من مشاركة المجلد بشكل صحيح.');
  }
}

function extractFolderId(url: string): string | null {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}
