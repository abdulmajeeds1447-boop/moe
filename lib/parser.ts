
import pdf from 'pdf-parse';

// وظيفة ترميز البيانات لـ Base64 يدوياً حسب متطلبات GenAI
function encodeToBase64(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface ProcessedContent {
  type: 'text' | 'image';
  content: string;
  name: string;
  mimeType?: string;
}

/**
 * تحويل ملفات الـ Buffer إلى بيانات قابلة للقراءة من قبل الذكاء الاصطناعي
 */
export async function parseFileContent(file: { name: string; mimeType: string; buffer: Uint8Array }): Promise<ProcessedContent | null> {
  try {
    if (file.mimeType === 'application/pdf') {
      // استخراج النص من ملفات PDF (استخدام any لتجنب مشاكل تعريفات ESM)
      const data = await (pdf as any)(file.buffer);
      return {
        type: 'text',
        content: data.text,
        name: file.name
      };
    } else if (file.mimeType.startsWith('image/')) {
      // تحويل الصور إلى Base64
      const base64 = encodeToBase64(file.buffer);
      return {
        type: 'image',
        content: base64,
        mimeType: file.mimeType,
        name: file.name
      };
    }
    return null;
  } catch (error) {
    console.error(`Error parsing file ${file.name}:`, error);
    return null;
  }
}
