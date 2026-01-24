
import { NextResponse } from 'next/server';
import { getDriveFiles } from '../../../lib/drive';
import { parseFileContent } from '../../../lib/parser';
import { GoogleGenAI, Type } from "@google/genai";

export async function POST(req: Request) {
  try {
    const { link } = await req.json();

    if (!link) return NextResponse.json({ error: 'رابط المجلد مطلوب' }, { status: 400 });

    let driveFiles;
    try {
      driveFiles = await getDriveFiles(link);
    } catch (driveError: any) {
      return NextResponse.json({ error: driveError.message }, { status: 403 });
    }

    if (driveFiles.length === 0) {
      return NextResponse.json({ 
        error: 'المجلد فارغ أو لا يحتوي على ملفات مدعومة (PDF، صور، أو مستندات قوقل). يرجى التأكد من رفع الشواهد داخل المجلد.' 
      }, { status: 404 });
    }

    const validContents = [];
    for (const file of driveFiles) {
      const content = await parseFileContent(file);
      if (content) validContents.push(content);
    }

    if (validContents.length === 0) {
      return NextResponse.json({ error: 'لم نتمكن من قراءة محتوى الملفات الموجودة. تأكد من أنها ليست تالفة.' }, { status: 422 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `
أنت مساعد تقني وخبير تربوي تعمل مع مدير المدرسة "نايف أحمد الشهري". مهمتك هي تحليل الأدلة والملفات المقدمة من المعلمين لتقييم أدائهم الوظيفي بناءً على معايير وزارة التعليم السعودية بدقة وموضوعية.

عند تحليل الملفات (مثل خطط الدروس، سجلات المتابعة، أو تقارير الأنشطة)، يجب عليك التحقق من وجود أدلة تثبت تحقق المهام الفرعية التالية لكل معيار من المعايير الـ 11:

1. أداء الواجبات الوظيفية: هل يوجد دليل على التقيد بالدوام الرسمي وتأدية الحصص؟ هل هناك مشاركة في الإشراف والمناوبة وحصص الانتظار؟ هل يتم إعداد ومتابعة الدروس والواجبات والاختبارات بانتظام؟
2. التفاعل مع المجتمع (مجتمعات التعلم المهنية): هل شارك المعلم في مجتمعات التعلم المهنية أو تبادل الزيارات؟ هل نفذ دروساً تطبيقية أو بحث الدرس؟ هل حضر دورات وورش تدريبية؟
3. التفاعل مع أولياء الأمور: هل يوجد تواصل فعال مع أولياء الأمور بالتنسيق مع الموجه الطلابي؟ هل يتم تزويدهم بمستويات الطلاب والملاحظات الهامة؟ هل تم تفعيل الخطة الأسبوعية والمشاركة في الجمعية العمومية؟
4. التنويع في استراتيجيات التدريس: هل يستخدم استراتيجيات متنوعة تناسب المستويات المختلفة؟ هل توجد أدلة على مراعاة الفروق الفردية داخل الفصل؟
5. تحسين نتائج المتعلمين: هل توجد خطط لمعالجة الفاقد التعليمي وخطط علاجية للطلاب الضعاف؟ هل توجد خطط إثرائية وتكريم للمتميزين؟
6. إعداد وتنفيذ خطة التعلم: هل توزيع المنهج وإعداد الدروس والواجبات موثق ومنفذ؟
7. توظيف تقنيات ووسائل التعلم المناسبة: هل تم دمج التقنية في التعليم? هل يوجد تنويع في الوسائل التعليمية المستخدمة؟
8. تهيئة البيئة التعليمية: هل تمت مراعاة حاجات الطلاب والتهيئة النفسية لهم؟ هل يتم استخدام التحفيز المادي والمعنوي وتوفير متطلبات الدرس؟
9. الإدارة الصفية: هل يوجد ما يشير لضبط سلوك الطلاب وشد انتباههم؟ هل تتم متابعة الحضور والغياب بدقة؟
10. تحليل نتائج المتعلمين وتشخيص مستوياتهم: هل تم تحليل نتائج الاختبارات الفترية والنهائية؟ هل تم تصنيف الطلاب وتحديد نقاط القوة والضعف؟
11. تنوع أساليب التقويم: هل تم تطبيق اختبارات (ورقية/إلكترونية)؟ هل تم تفعيل المشاريع الطلابية، المهام الأدائية، وملفات الإنجاز؟

المطلوب: بناءً على الأدلة الموجودة في الملفات المدخلة، قم بتقدير درجة لكل معيار (من 1 إلى 5). إذا لم يوجد دليل كافٍ لمهمة معينة، خفض الدرجة.

يجب أن تكون مخرجاتك بصيغة JSON فقط كالتالي:
{
  "suggested_scores": {
    "1": number, "2": number, "3": number, "4": number, "5": number, "6": number, "7": number, "8": number, "9": number, "10": number, "11": number
  },
  "justification": "شرح مختصر لأسباب التقييم بناء على الأدلة المرفقة"
}
`;

    const promptParts: any[] = [];
    validContents.forEach(item => {
      if (item.type === 'text') {
        promptParts.push({ text: `محتوى الملف (${item.name}):\n${item.content}\n---\n` });
      } else if (item.type === 'image') {
        promptParts.push({ inlineData: { data: item.content, mimeType: item.mimeType } });
      }
    });

    promptParts.push({ text: "بناءً على الشواهد المرفوعة أعلاه، يرجى إجراء التقييم التربوي المطلوب وإرجاع النتائج بتنسيق JSON." });

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts: promptParts },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggested_scores: {
              type: Type.OBJECT,
              properties: {
                "1": { type: Type.NUMBER }, "2": { type: Type.NUMBER }, "3": { type: Type.NUMBER },
                "4": { type: Type.NUMBER }, "5": { type: Type.NUMBER }, "6": { type: Type.NUMBER },
                "7": { type: Type.NUMBER }, "8": { type: Type.NUMBER }, "9": { type: Type.NUMBER },
                "10": { type: Type.NUMBER }, "11": { type: Type.NUMBER }
              }
            },
            justification: { type: Type.STRING }
          },
          required: ['suggested_scores', 'justification']
        }
      }
    });

    return NextResponse.json(JSON.parse(response.text || '{}'));
  } catch (error: any) {
    console.error("Analysis API Error:", error);
    return NextResponse.json({ error: 'فشل التحليل', details: error.message }, { status: 500 });
  }
}
