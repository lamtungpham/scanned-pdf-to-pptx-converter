
import { GoogleGenAI, Type } from "@google/genai";
import { SlideElement, ModelMode } from "../types";

const OCR_SYSTEM_INSTRUCTION = `
Bạn là chuyên gia OCR cao cấp cho việc chuyển đổi slide bài giảng/thuyết trình từ PDF sang PowerPoint.
1. Hỗ trợ Tiếng Việt: Trích xuất nội dung văn bản với độ chính xác tuyệt đối về dấu câu và ngữ nghĩa.
2. Tọa độ (Bounding Boxes): Cung cấp [ymin, xmin, ymax, xmax] theo thang đo 0-1000 của hình ảnh.
3. Cấu trúc: Nhóm các dòng văn bản liên quan thành một khối (Paragraph). Xác định đúng tiêu đề, nội dung chính và chân trang.
4. Định dạng: Dự đoán màu sắc văn bản (HEX), độ đậm (Bold) và căn lề (Alignment).
`;

const getAIInstance = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY_NOT_CONFIGURED");
  return new GoogleGenAI({ apiKey });
};

export const analyzeSlideLayout = async (base64Image: string, pageIndex: number, mode: ModelMode): Promise<SlideElement[]> => {
  const ai = getAIInstance();
  // Ưu tiên Gemini 3 Flash cho public use vì tốc độ và quota tốt hơn
  const modelName = 'gemini-3-flash-preview';
  
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image } },
          { text: "Trích xuất tất cả các khối văn bản trong ảnh này sang định dạng JSON. Đảm bảo giữ đúng nội dung Tiếng Việt." }
        ]
      },
      config: {
        systemInstruction: OCR_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text_blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  content: { type: Type.STRING },
                  box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  textColor: { type: Type.STRING },
                  isBold: { type: Type.BOOLEAN },
                  alignment: { type: Type.STRING, enum: ["left", "center", "right"] }
                },
                required: ["content", "box_2d"]
              }
            }
          }
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return (data.text_blocks || []).map((block: any) => ({
      content: block.content,
      box_2d: block.box_2d,
      textColor: (block.textColor && block.textColor.startsWith('#')) ? block.textColor : "#000000",
      fontStyle: {
        isBold: !!block.isBold,
        alignment: block.alignment || "left"
      }
    }));
  } catch (error: any) {
    console.error(`OCR Error:`, error);
    return [];
  }
};

export const inpaintImage = async (maskedBase64: string, mode: ModelMode): Promise<string> => {
  const ai = getAIInstance();
  // Gemini 2.5 Flash Image là lựa chọn tốt nhất để phục hồi nền slide
  const modelName = 'gemini-2.5-flash-image';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { inlineData: { data: maskedBase64, mimeType: 'image/jpeg' } },
          { text: 'Hãy làm sạch các vùng bị che khuất và phục hồi nền slide gốc sao cho hoàn toàn tự nhiên.' },
        ],
      },
      config: {
        imageConfig: {
            aspectRatio: "16:9"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return part.inlineData.data;
    }
    return maskedBase64;
  } catch (error: any) {
    console.error("Inpaint Error:", error);
    return maskedBase64;
  }
};
