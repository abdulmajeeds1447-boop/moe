
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
];

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
      } else if (SUPPORTED_MIME_TYPES.includes(file.mimeType)) {
        allFiles.push({ ...file, path: folderPath + file.name });
      }
    }
  } catch (error: any) {
    throw new Error(`خطأ أثناء قراءة ملفات المجلد: ${error.message}`);
  }
  return allFiles;
}

export async function getDriveFiles(folderUrl: string) {
  const folderId = extractFolderId(folderUrl);
  if (!folderId) throw new Error('رابط المجلد غير صحيح. تأكد من نسخ الرابط كاملاً من المتصفح.');

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('بيانات الوصول لـ Google Drive (Service Account) غير مكتملة في السيرفر.');
  }

  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      SCOPES
    );

    const drive = google.drive({ version: 'v3', auth });
    const filesMetadata = await listFilesRecursive(drive, folderId);
    
    if (filesMetadata.length === 0) return [];

    const downloadPromises = filesMetadata.slice(0, 10).map(async (file) => {
      try {
        const res = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        return {
          id: file.id,
          name: file.path,
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
    if (error.message.includes('404')) throw new Error('المجلد غير موجود أو الرابط خاطئ.');
    if (error.message.includes('403')) throw new Error('لا نملك صلاحية الوصول. اجعل المجلد (أي شخص لديه الرابط).');
    throw error;
  }
}

function extractFolderId(url: string): string | null {
  // دعم روابط المجلدات المباشرة وروابط المشاركة
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}
