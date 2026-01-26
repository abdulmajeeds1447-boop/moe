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
  
  // 1. جلب قائمة بالمجلدات الفرعية أولاً (مجلدات المعايير)
  const subFoldersResponse = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 15
  });

  const subFolders = subFoldersResponse.data.files || [];
  let allFilesToProcess: any[] = [];

  if (subFolders.length > 0) {
    // 2. إذا وجدنا مجلدات فرعية، نأخذ ملفاً واحداً من أول 5 مجلدات لضمان السرعة
    for (const folder of subFolders.slice(0, 5)) {
      const filesInSub = await drive.files.list({
        q: `'${folder.id}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
        pageSize: 1
      });
      if (filesInSub.data.files && filesInSub.data.files.length > 0) {
        const f = filesInSub.data.files[0];
        if (SUPPORTED_MIME_TYPES.includes(f.mimeType!)) {
          allFilesToProcess.push(f);
        }
      }
    }
  } else {
    // 3. إذا لم توجد مجلدات فرعية، نبحث في المجلد الرئيسي مباشرة
    const rootFiles = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 3
    });
    allFilesToProcess = (rootFiles.data.files || []).filter(f => SUPPORTED_MIME_TYPES.includes(f.mimeType!));
  }

  if (allFilesToProcess.length === 0) return [];

  // 4. تحميل محتوى الملفات (بحد أقصى ملفين لضمان عدم تجاوز الـ 10 ثوانٍ)
  const results = [];
  for (const file of allFilesToProcess.slice(0, 2)) {
    try {
      const res = await drive.files.get(
        { fileId: file.id!, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      results.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        buffer: new Uint8Array(res.data as ArrayBuffer),
      });
    } catch (e) { console.error("Error downloading file", file.name); }
  }

  return results;
}

function extractFolderId(url: string): string | null {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}