
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

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

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (mimeType = 'application/pdf' or mimeType contains 'image/')`,
      fields: 'files(id, name, mimeType)',
    });

    const files = response.data.files || [];
    
    // تحسين: تحميل جميع الملفات بالتوازي لزيادة السرعة
    const downloadPromises = files.map(async (file) => {
      if (!file.id) return null;
      try {
        const res = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        return {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          buffer: new Uint8Array(res.data as ArrayBuffer),
        };
      } catch (err) {
        console.error(`Error downloading file ${file.name}:`, err);
        return null;
      }
    });

    const results = await Promise.all(downloadPromises);
    return results.filter((f): f is NonNullable<typeof f> => f !== null);

  } catch (error: any) {
    console.error('Google Drive Error:', error.message);
    throw new Error('فشل الوصول إلى ملفات Google Drive. تأكد من مشاركة المجلد بشكل صحيح.');
  }
}

function extractFolderId(url: string): string | null {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}
