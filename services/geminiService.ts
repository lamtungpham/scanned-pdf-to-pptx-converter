
import { GoogleGenAI, Type } from "@google/genai";
import { SlideElement, ModelMode } from "../types";

const OCR_SYSTEM_INSTRUCTION = `
Bạn là chuyên gia OCR cao cấp cho việc chuyển đổi slide bài giảng/thuyết trình từ PDF sang PowerPoint.
1. Hỗ trợ Tiếng Việt: Trích xuất nội dung văn bản với độ chính xác tuyệt đối về dấu câu và ngữ nghĩa.
2. Tọa độ (Bounding Boxes): Cung cấp [ymin, xmin, ymax, xmax] theo thang đo 0-1000 của hình ảnh.
3. Cấu trúc: Nhóm các dòng văn bản liên quan thành một khối (Paragraph). Xác định đúng tiêu đề, nội dung chính và chân trang.
4. Định dạng: Dự đoán màu sắc văn bản (HEX), độ đậm (Bold) và căn lề (Alignment).
`;

const isAuthError = (error: any): boolean => {
  const message = error?.message || "";
  const status = error?.status || "";
  return (
    message.includes("Requested entity was not found") || 
    message.includes("PERMISSION_DENIED") ||
    message.includes("403") ||
    message.includes("404") ||
    status === "PERMISSION_DENIED"
  );
};

export const analyzeSlideLayout = async (base64Image: string, pageIndex: number, mode: ModelMode): Promise<SlideElement[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = mode === 'pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
  
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image } },
          { text: "Phân tích và trích xuất tất cả các khối văn bản trong ảnh này. Giữ nguyên định dạng và vị trí." }
        ]
      },
      config: {
        systemInstruction: OCR_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        thinkingConfig: mode === 'pro' ? { thinkingBudget: 2000 } : undefined,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text_blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  content: { type: Type.STRING, description: "Nội dung văn bản tiếng Việt" },
                  box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: "[ymin, xmin, ymax, xmax]" },
                  textColor: { type: Type.STRING, description: "Mã màu HEX, ví dụ #FFFFFF" },
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
    console.error(`OCR Error on page ${pageIndex}:`, error);
    if (isAuthError(error)) throw new Error("API_KEY_INVALID");
    return [];
  }
};

export const inpaintImage = async (maskedBase64: string, mode: ModelMode): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Sử dụng gemini-2.5-flash-image cho tác vụ chỉnh sửa ảnh (inpainting)
  const modelName = mode === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              data: maskedBase64,
              mimeType: 'image/jpeg',
            },
          },
          {
            text: 'Hãy phục hồi các vùng bị mờ hoặc bị che khuất trong ảnh này. Tái tạo màu sắc và họa tiết nền sao cho hoàn toàn trùng khớp với môi trường xung quanh. KHÔNG thêm đối tượng mới, văn bản hay logo. Chỉ tập trung vào việc làm sạch nền để tạo ra một bản slide trống nguyên bản.',
          },
        ],
      },
      config: {
        imageConfig: {
            aspectRatio: "16:9",
            imageSize: mode === 'pro' ? "1K" : undefined
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return part.inlineData.data;
    }
    return maskedBase64;
  } catch (error: any) {
    console.error("AI Healing Error:", error);
    if (isAuthError(error)) throw new Error("API_KEY_INVALID");
    return maskedBase64;
  }
};
