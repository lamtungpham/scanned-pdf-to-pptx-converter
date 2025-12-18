
import { GoogleGenAI, Type } from "@google/genai";
import { SlideElement, ModelMode } from "../types";

const OCR_SYSTEM_INSTRUCTION = `
You are a high-precision OCR engine for PDF-to-PPTX conversion.
1. Vietnamese Support: Extract text with 100% accuracy on accents.
2. Bounding Boxes: Provide [ymin, xmin, ymax, xmax] (0-1000).
3. Logic: Group continuous text into paragraphs. Focus on structure.
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
          { text: "Extract all text blocks with precise coordinates. Identify text color and alignment." }
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
    console.error(`OCR Error on page ${pageIndex}:`, error);
    if (isAuthError(error)) throw new Error("API_KEY_INVALID");
    return [];
  }
};

export const inpaintImage = async (maskedBase64: string, mode: ModelMode): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
            text: 'Carefully heal the blurred areas. Reconstruct the background color, texture, and patterns to perfectly match the surrounding environment. DO NOT add any new objects, text, logos, or artistic details. Only restore the background so the page looks original and empty in those regions.',
          },
        ],
      },
      config: {
        imageConfig: {
            aspectRatio: "16:9", // Thường slide là 16:9
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
