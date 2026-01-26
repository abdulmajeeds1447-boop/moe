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
  
  // 1. جلب قائمة المجلدات الفرعية بسرعة كبيرة
  const subFoldersResponse = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 10
  });

  const subFolders = subFoldersResponse.data.files || [];
  let filesToDownload: any[] = [];

  if (subFolders.length > 0) {
    // 2. البحث في المجلدات الفرعية بالتوازي (Parallel Search)
    const folderPromises = subFolders.slice(0, 4).map(folder => 
      drive.files.list({
        q: `'${folder.id}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
        pageSize: 1
      })
    );
    
    const results = await Promise.all(folderPromises);
    results.forEach(res => {
      if (res.data.files && res.data.files[0]) {
        const f = res.data.files[0];
        if (SUPPORTED_MIME_TYPES.includes(f.mimeType!)) filesToDownload.push(f);
      }
    });
  }

  // إذا لم نجد شيئاً في المجلدات الفرعية، نبحث في الرئيسي
  if (filesToDownload.length === 0) {
    const rootRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 3
    });
    filesToDownload = (rootRes.data.files || []).filter(f => SUPPORTED_MIME_TYPES.includes(f.mimeType!));
  }

  if (filesToDownload.length === 0) return [];

  // 3. تحميل محتوى الملفات بالتوازي (أهم خطوة للسرعة)
  // نكتفي بـ 2-3 ملفات فقط لضمان عدم تجاوز الوقت
  const downloadPromises = filesToDownload.slice(0, 3).map(async (file) => {
    try {
      const res = await drive.files.get(
        { fileId: file.id!, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        buffer: new Uint8Array(res.data as ArrayBuffer),
      };
    } catch (e) {
      return null;
    }
  });

  const finalFiles = await Promise.all(downloadPromises);
  return finalFiles.filter(f => f !== null);
}

function extractFolderId(url: string): string | null {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}