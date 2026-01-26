import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

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
  let allFiles: any[] = [];

  // دالة للبحث المتكرر في المجلدات والمجلدات الفرعية
  async function fetchFilesRecursive(id: string, depth = 0) {
    if (depth > 3) return; // تحديد العمق لـ 3 مستويات لتجنب البطء الشديد

    const res = await drive.files.list({
      q: `'${id}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100
    });

    const items = res.data.files || [];
    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        // إذا وجد مجلداً فرعياً، يبحث بداخله
        await fetchFilesRecursive(item.id, depth + 1);
      } else if (item.mimeType === 'application/pdf' || item.mimeType?.startsWith('image/')) {
        // إضافة الملفات المدعومة فقط
        allFiles.push(item);
      }
    }
  }

  await fetchFilesRecursive(folderId);

  // نحدد الحد الأقصى بـ 15 ملفاً لضمان عدم تجاوز سعة المعالجة
  return allFiles.slice(0, 15);
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
