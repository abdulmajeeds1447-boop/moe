import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

function extractFolderId(url: string): string | null {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}

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
  } catch (error: any) {
    console.error(`Warning accessing folder ${folderPath}:`, error.message);
  }
  return allFiles;
}

export async function getDriveFiles(folderUrl: string) {
  const folderId = extractFolderId(folderUrl);
  if (!folderId) throw new Error('رابط المجلد غير صحيح.');

  // ✅ التعديل الاحترافي: يقبل أي اسم للمتغير في Vercel
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error('بيانات الاتصال بجوجل (Service Account) ناقصة في إعدادات Vercel.');
  }

  try {
    const auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey.replace(/\\n/g, '\n'), // إصلاح مشكلة الأسطر
      SCOPES
    );

    const drive = google.drive({ version: 'v3', auth });
    const allFilesMetadata = await listFilesRecursive(drive, folderId);
    
    if (allFilesMetadata.length === 0) return [];

    // Smart Sampling (العينة الذكية)
    const filesByFolder: Record<string, any[]> = {};
    allFilesMetadata.forEach(f => {
      const key = f.folderName || 'General';
      if (!filesByFolder[key]) filesByFolder[key] = [];
      filesByFolder[key].push(f);
    });

    let selectedFiles: any[] = [];
    const FILES_PER_FOLDER = 3; 
    const MAX_TOTAL_FILES = 45; 

    Object.keys(filesByFolder).forEach(folder => {
      const folderFiles = filesByFolder[folder].slice(0, FILES_PER_FOLDER);
      selectedFiles = [...selectedFiles, ...folderFiles];
    });

    if (selectedFiles.length > MAX_TOTAL_FILES) {
      selectedFiles = selectedFiles.slice(0, MAX_TOTAL_FILES);
    }

    const downloadPromises = selectedFiles.map(async (file) => {
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
    if (error.message.includes('404')) throw new Error('المجلد غير موجود.');
    if (error.message.includes('403') || error.message.includes('client_email')) {
       throw new Error(`مشكلة صلاحيات: يجب مشاركة المجلد مع ${clientEmail} كـ "عارض".`);
    }
    throw error;
  }
}
