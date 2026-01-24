
import pdf from 'pdf-parse';
// Import Buffer to resolve TypeScript "Cannot find name 'Buffer'" error
import { Buffer } from 'buffer';

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

export async function parseFileContent(file: { name: string; mimeType: string; buffer: Uint8Array }): Promise<ProcessedContent | null> {
  try {
    if (file.mimeType === 'application/pdf') {
      const nodeBuffer = Buffer.from(file.buffer);
      const data = await (pdf as any)(nodeBuffer);
      
      // تحسين الأداء: تقليص النص لتقليل عبء معالجة الذكاء الاصطناعي
      const textContent = data.text.length > 15000 
        ? data.text.substring(0, 15000) + "... [تم تقليص النص لطوله الزائد]" 
        : data.text;

      return {
        type: 'text',
        content: textContent,
        name: file.name
      };
    } else if (file.mimeType.startsWith('image/')) {
      return {
        type: 'image',
        content: encodeToBase64(file.buffer),
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
