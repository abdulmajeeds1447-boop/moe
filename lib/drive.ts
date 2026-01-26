import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const SUPPORTED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

// دالة استخراج المعرف
function extractFolderId(url: string): string | null {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}

// دالة البحث داخل المجلدات
async function listFilesRecursive(drive: any, folderId: string, folderPath: string = "") {
  let allFiles: any[] = [];
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100,
    });
    const files = response.data.files || [];
    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        const subFiles = await listFilesRecursive(drive, file.id, `${folderPath}${file.name}/`);
        allFiles = [...allFiles, ...subFiles];
      } else if (SUPPORTED_MIME_TYPES.includes(file.mimeType)) {
        allFiles.push({ ...file, path: folderPath + file.name, folderName: folderPath });
      }
    }
  } catch (error) { console.error("Skip folder:", folderPath); }
  return allFiles;
}

export async function getDriveFiles(folderUrl: string) {
  const folderId = extractFolderId(folderUrl);
  if (!folderId) throw new Error('رابط المجلد غير صحيح.');

  // دعم المتغيرين معاً لتجنب الأخطاء
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) throw new Error('بيانات الاتصال بجوجل ناقصة في Vercel.');

  const auth = new google.auth.JWT(clientEmail, null, privateKey.replace(/\\n/g, '\n'), SCOPES);
  const drive = google.drive({ version: 'v3', auth });

  try {
    const allFiles = await listFilesRecursive(drive, folderId);
    if (allFiles.length === 0) return [];

    // Smart Sampling (3 ملفات من كل مجلد)
    const filesByFolder: Record<string, any[]> = {};
    allFiles.forEach(f => {
      const key = f.folderName || 'Root';
      if (!filesByFolder[key]) filesByFolder[key] = [];
      filesByFolder[key].push(f);
    });

    let selected: any[] = [];
    Object.values(filesByFolder).forEach(files => selected.push(...files.slice(0, 3)));
    
    // حد أقصى 45 ملف
    if (selected.length > 45) selected = selected.slice(0, 45);

    const downloads = await Promise.all(selected.map(async (f) => {
      try {
        const res = await drive.files.get({ fileId: f.id, alt: 'media' }, { responseType: 'arraybuffer' });
        return { id: f.id, name: f.path, mimeType: f.mimeType, buffer: new Uint8Array(res.data as ArrayBuffer) };
      } catch (e) { return null; }
    }));

    return downloads.filter((f): f is NonNullable<typeof f> => f !== null);
  } catch (error: any) {
    if (error.message.includes('403')) throw new Error(`يجب مشاركة المجلد مع: ${clientEmail}`);
    if (error.message.includes('404')) throw new Error('المجلد غير موجود.');
    throw error;
  }
}
