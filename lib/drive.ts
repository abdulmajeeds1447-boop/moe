
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

// أنواع الملفات التي يمكننا التعامل معها مباشرة أو تحويلها
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
];

const GOOGLE_DOCS_MIME_TYPES: Record<string, string> = {
  'application/vnd.google-apps.document': 'application/pdf',
  'application/vnd.google-apps.spreadsheet': 'application/pdf',
  'application/vnd.google-apps.presentation': 'application/pdf'
};

async function listFilesRecursive(drive: any, folderId: string, folderPath: string = "") {
  let allFiles: any[] = [];
  
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
    });

    const files = response.data.files || [];

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        const subFiles = await listFilesRecursive(drive, file.id, `${folderPath}${file.name} / `);
        allFiles = [...allFiles, ...subFiles];
      } else if (SUPPORTED_MIME_TYPES.includes(file.mimeType) || GOOGLE_DOCS_MIME_TYPES[file.mimeType]) {
        allFiles.push({ ...file, path: folderPath + file.name });
      }
    }
  } catch (error: any) {
    console.error(`Error listing files in folder ${folderId}:`, error.message);
    throw error;
  }
  return allFiles;
}

export async function getDriveFiles(folderUrl: string) {
  try {
    const folderId = extractFolderId(folderUrl);
    if (!folderId) throw new Error('رابط مجلد Google Drive غير صالح. يرجى التأكد من نسخ الرابط من شريط العنوان.');

    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      SCOPES
    );

    const drive = google.drive({ version: 'v3', auth });

    const filesMetadata = await listFilesRecursive(drive, folderId);
    
    if (filesMetadata.length === 0) return [];

    // جلب أول 15 ملف فقط لضمان سرعة الاستجابة
    const limitedFiles = filesMetadata.slice(0, 15);
    const downloadPromises = limitedFiles.map(async (file) => {
      try {
        let res;
        if (GOOGLE_DOCS_MIME_TYPES[file.mimeType]) {
          // إذا كان ملف من تطبيقات قوقل، نقوم بتصديره كـ PDF
          res = await drive.files.export(
            { fileId: file.id, mimeType: 'application/pdf' },
            { responseType: 'arraybuffer' }
          );
          return {
            id: file.id,
            name: file.path + ".pdf",
            mimeType: 'application/pdf',
            buffer: new Uint8Array(res.data as ArrayBuffer),
          };
        } else {
          // ملفات عادية (PDF أو صور)
          res = await drive.files.get(
            { fileId: file.id, alt: 'media' },
            { responseType: 'arraybuffer' }
          );
          return {
            id: file.id,
            name: file.path,
            mimeType: file.mimeType,
            buffer: new Uint8Array(res.data as ArrayBuffer),
          };
        }
      } catch (err: any) {
        console.warn(`Could not download file ${file.name}:`, err.message);
        return null;
      }
    });

    const results = await Promise.all(downloadPromises);
    return results.filter((f): f is NonNullable<typeof f> => f !== null);

  } catch (error: any) {
    console.error('Google Drive Global Error:', error.message);
    if (error.message.includes('404') || error.message.includes('not found')) {
      throw new Error('لم يتم العثور على المجلد. تأكد من أن الرابط صحيح ومن تفعيل خيار (أي شخص لديه الرابط).');
    }
    if (error.message.includes('403') || error.message.includes('permission')) {
      throw new Error('فشل الوصول: المجلد خاص. يرجى تغيير إعدادات المشاركة إلى (أي شخص لديه الرابط).');
    }
    throw error;
  }
}

function extractFolderId(url: string): string | null {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}
