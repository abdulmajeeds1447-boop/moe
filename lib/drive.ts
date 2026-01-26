import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const SUPPORTED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export async function getDriveFiles(folderUrl: string) {
  const folderId = extractFolderId(folderUrl);
  if (!folderId) throw new Error('رابط المجلد غير صحيح.');

  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    SCOPES
  );

  const drive = google.drive({ version: 'v3', auth });

  // تنفيذ البحث في المجلد الرئيسي والمجلدات الفرعية بالتوازي لربح الوقت
  const [rootFilesRes, subFoldersRes] = await Promise.all([
    drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (mimeType = 'application/pdf' or mimeType contains 'image/')`,
      fields: 'files(id, name, mimeType)',
      pageSize: 2
    }),
    drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 2 // نكتفي بفحص أول مجلدين فرعيين فقط
    })
  ]);

  let candidates = [...(rootFilesRes.data.files || [])];

  // إذا لم نجد ملفات كافية في الرئيسي، نبحث في أول مجلدين فرعيين بالتوازي
  if (candidates.length < 2 && subFoldersRes.data.files?.length) {
    const subFilesPromises = subFoldersRes.data.files.map(folder =>
      drive.files.list({
        q: `'${folder.id}' in parents and trashed = false and (mimeType = 'application/pdf' or mimeType contains 'image/')`,
        fields: 'files(id, name, mimeType)',
        pageSize: 1
      })
    );
    const subResults = await Promise.all(subFilesPromises);
    subResults.forEach(res => {
      if (res.data.files?.[0]) candidates.push(res.data.files[0]);
    });
  }

  // نأخذ أول ملفين فقط ونحملهما بالتوازي
  const finalSelection = candidates.slice(0, 2);
  if (finalSelection.length === 0) return [];

  const downloadPromises = finalSelection.map(async (file) => {
    try {
      const res = await drive.files.get(
        { fileId: file.id!, alt: 'media' },
        { responseType: 'arraybuffer', timeout: 4000 } // مهلة تحميل 4 ثوان للملف الواحد
      );
      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        buffer: new Uint8Array(res.data as ArrayBuffer),
      };
    } catch (e) { return null; }
  });

  return (await Promise.all(downloadPromises)).filter(f => f !== null);
}

function extractFolderId(url: string): string | null {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}