
import * as pdfjsLib from 'pdfjs-dist';
import { SlideElement } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;

export const loadPdf = async (file: File): Promise<pdfjsLib.PDFDocumentProxy> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ 
    data: arrayBuffer,
    cMapUrl: `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
    cMapPacked: true,
  });
  return loadingTask.promise;
};

export const renderPageToCanvas = async (pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number, scale = 2.0): Promise<{ base64: string, canvas: HTMLCanvasElement }> => {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  
  if (!context) {
    throw new Error('Could not create canvas context');
  }

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({
    canvasContext: context,
    viewport: viewport,
  } as any).promise;
  
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return {
    base64: dataUrl.split(',')[1],
    canvas: canvas
  };
};

export const applyRoughMask = async (base64Image: string, elements: SlideElement[]): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return resolve(base64Image);

            ctx.drawImage(img, 0, 0);

            // Watermark box mặc định (nếu có)
            const systemWatermarkBox = { ymin: 910, xmin: 800, ymax: 985, xmax: 985 };
            
            const boxesToMask = [
                ...elements.map(el => ({ ymin: el.box_2d[0], xmin: el.box_2d[1], ymax: el.box_2d[2], xmax: el.box_2d[3], isWatermark: false })),
                { ...systemWatermarkBox, isWatermark: true }
            ];

            boxesToMask.forEach(box => {
                let x = (box.xmin / 1000) * canvas.width;
                let y = (box.ymin / 1000) * canvas.height;
                let w = ((box.xmax - box.xmin) / 1000) * canvas.width;
                let h = ((box.ymax - box.ymin) / 1000) * canvas.height;

                // Thêm padding cho các khối văn bản để đảm bảo xóa sạch chân chữ
                const p = box.isWatermark ? 2 : 5;
                x = Math.max(0, x - p);
                y = Math.max(0, y - p);
                w = Math.min(canvas.width - x, w + p * 2);
                h = Math.min(canvas.height - y, h + p * 2);

                // Lấy màu nền mẫu từ phía trên bên trái của box
                const sampleX = Math.max(0, x - 2);
                const sampleY = Math.max(0, y - 2);
                const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;

                // Đổ màu thô
                ctx.fillStyle = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
                ctx.fillRect(x, y, w, h);
                
                // Áp dụng bộ lọc mờ nhẹ ở vùng biên để AI inpaint mượt hơn
                ctx.save();
                ctx.filter = 'blur(8px)';
                ctx.drawImage(canvas, x, y, w, h, x, y, w, h);
                ctx.restore();
            });

            const result = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
            resolve(result);
        };
        img.src = `data:image/jpeg;base64,${base64Image}`;
    });
};

export const getFirstPagePreview = async (file: File): Promise<string> => {
    const pdf = await loadPdf(file);
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Context error');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport } as any).promise;
    const data = canvas.toDataURL('image/jpeg');
    return data;
};
