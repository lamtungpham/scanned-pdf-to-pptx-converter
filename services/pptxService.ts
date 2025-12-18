
import PptxGenJS from "pptxgenjs";
import { SlideData } from "../types";

export const generatePptx = async (slidesData: SlideData[]): Promise<void> => {
  const pres = new PptxGenJS();

  pres.author = "Tùng Tinh Tấn - ScanToPPT";
  pres.title = "Converted Presentation";

  // Standard 16:9 Slide Dimensions
  const SLIDE_W_INCH = 10;
  const SLIDE_H_INCH = 5.625;
  const SLIDE_H_PTS = SLIDE_H_INCH * 72;

  slidesData.forEach((slideData) => {
    const slide = pres.addSlide();

    if (slideData.backgroundImage) {
        slide.background = { data: `data:image/jpeg;base64,${slideData.backgroundImage}` };
    }

    slideData.elements.forEach((el) => {
        const [ymin, xmin, ymax, xmax] = el.box_2d;

        const x = (xmin / 1000) * SLIDE_W_INCH;
        const y = (ymin / 1000) * SLIDE_H_INCH;
        const w = ((xmax - xmin) / 1000) * SLIDE_W_INCH;
        const h = ((ymax - ymin) / 1000) * SLIDE_H_INCH;

        // Cỡ chữ dựa trên % chiều cao box, tối ưu cho slide
        const boxHeightPts = (Math.abs(ymax - ymin) / 1000) * SLIDE_H_PTS;
        let calculatedFontSize = Math.round(boxHeightPts * 0.75);
        
        // Điều chỉnh cho nội dung dài
        if (el.content.length > 100) {
             calculatedFontSize = Math.min(calculatedFontSize, 14);
        } else if (el.content.length > 40) {
             calculatedFontSize = Math.min(calculatedFontSize, 24);
        }
        
        calculatedFontSize = Math.max(7, Math.min(calculatedFontSize, 54));

        // Xử lý mã màu an toàn
        let colorStr = "000000";
        if (el.textColor) {
            colorStr = el.textColor.replace('#', '').trim();
            if (colorStr.length !== 6) colorStr = "000000";
        }

        slide.addText(el.content, {
          x, y, w, h,
          fontSize: calculatedFontSize,
          bold: el.fontStyle?.isBold,
          color: colorStr,
          align: el.fontStyle?.alignment || "left",
          valign: "middle", 
          fontFace: "Arial",
          margin: 1,
          breakLine: true
        });
    });
  });

  await pres.writeFile({ fileName: `ScanToPPT_${new Date().getTime()}.pptx` });
};
