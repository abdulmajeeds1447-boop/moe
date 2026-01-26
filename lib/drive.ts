import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const SUPPORTED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

function getDriveClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    SCOPES
  );
  return google.drive({ version: 'v3', auth });
}

export async function scanDriveFolder(folderUrl: string) {
  const folderId = extractFolderId(folderUrl);
  if (!folderId) throw new Error('رابط المجلد غير صحيح.');

  const drive = getDriveClient();
  
  // جلب الملفات من المجلد الرئيسي
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and (mimeType = 'application/pdf' or mimeType contains 'image/')`,
    fields: 'files(id, name, mimeType)',
    pageSize: 15
  });

  let files = res.data.files || [];

  // جلب المجلدات الفرعية للبحث فيها أيضاً
  const subFolders = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 5
  });

  if (subFolders.data.files) {
    for (const folder of subFolders.data.files) {
      const subRes = await drive.files.list({
        q: `'${folder.id}' in parents and trashed = false and (mimeType = 'application/pdf' or mimeType contains 'image/')`,
        fields: 'files(id, name, mimeType)',
        pageSize: 3
      });
      if (subRes.data.files) files.push(...subRes.data.files);
    }
  }

  return files.slice(0, 15); // نكتفي بـ 15 ملفاً كحد أقصى للجودة
}

export async function downloadDriveFile(fileId: string) {
  const drive = getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return new Uint8Array(res.data as ArrayBuffer);
}

function extractFolderId(url: string): string | null {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}