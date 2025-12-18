
import React, { useState, useRef } from 'react';
import { Upload, FileType, Check, AlertCircle, RefreshCw, FileText, Sparkles, Zap } from 'lucide-react';
import Button from './components/Button';
import StepIndicator from './components/StepIndicator';
import { ProcessingState, SlideData, ProcessingProgress } from './types';
import { loadPdf, renderPageToCanvas, getFirstPagePreview, applyRoughMask } from './services/pdfService';
import { analyzeSlideLayout, inpaintImage } from './services/geminiService';
import { generatePptx } from './services/pptxService';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingState>(ProcessingState.IDLE);
  const [progress, setProgress] = useState<ProcessingProgress>({ current: 0, total: 0, message: '' });
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'application/pdf') {
        setError("Vui lòng tải lên tệp PDF bản quét.");
        return;
      }
      setFile(selectedFile);
      setError(null);
      try {
        const previewUrl = await getFirstPagePreview(selectedFile);
        setFilePreview(previewUrl);
      } catch (err) {
        console.warn("Preview generation error", err);
      }
    }
  };

  const startConversion = async () => {
    if (!file) return;
    
    setError(null);
    try {
      setStatus(ProcessingState.READING_PDF);
      setProgress({ current: 0, total: 0, message: 'Đang khởi tạo hệ thống AI...' });

      const pdf = await loadPdf(file);
      const totalPages = pdf.numPages;

      setStatus(ProcessingState.ANALYZING_PAGES);
      const processedSlides: SlideData[] = [];

      for (let i = 1; i <= totalPages; i++) {
        setProgress({ 
            current: i, 
            total: totalPages, 
            message: `Đang xử lý trang ${i}/${totalPages}...` 
        });

        // 1. Render PDF page to image
        const { base64 } = await renderPageToCanvas(pdf, i, 2.0);
        
        // 2. AI OCR & Layout Analysis (Using Flash for speed & public access)
        const elements = await analyzeSlideLayout(base64, i - 1, 'flash');
        
        // 3. Apply rough mask for text areas
        const maskedBase64 = await applyRoughMask(base64, elements);
        
        // 4. AI Inpainting to restore background
        const cleanedBase64 = await inpaintImage(maskedBase64, 'flash');

        processedSlides.push({
            id: i - 1,
            backgroundImage: cleanedBase64,
            elements: elements
        });
      }

      setStatus(ProcessingState.GENERATING_PPTX);
      setProgress({ current: totalPages, total: totalPages, message: 'Đang đóng gói tệp PowerPoint...' });

      await generatePptx(processedSlides);
      setStatus(ProcessingState.COMPLETED);

    } catch (err: any) {
      console.error(err);
      setStatus(ProcessingState.IDLE);
      if (err.message?.includes("API_KEY") || err.message?.includes("403") || err.message?.includes("401")) {
          setError("Hệ thống đang bảo trì API Key. Vui lòng thử lại sau.");
      } else {
          setError(`Đã xảy ra lỗi: ${err.message || "Không thể xử lý tệp này."}`);
      }
    }
  };

  const reset = () => {
    setFile(null);
    setFilePreview(null);
    setStatus(ProcessingState.IDLE);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-x-hidden">
        <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
            <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-100">
                        <FileText className="text-white w-5 h-5" />
                    </div>
                    <h1 className="text-xl font-black tracking-tighter">ScanToPPT <span className="text-indigo-600">FREE</span></h1>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full border border-green-100">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">AI Server Online</span>
                </div>
            </div>
        </header>

        <main className="flex-grow flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full">
            {status !== ProcessingState.IDLE && status !== ProcessingState.COMPLETED && (
                <div className="w-full mb-12 animate-in fade-in slide-in-from-top-4">
                    <StepIndicator currentStep={status} />
                </div>
            )}

            {error && (
                <div className="w-full mb-8 bg-red-50 border border-red-100 rounded-2xl p-5 flex items-start gap-4 shadow-sm">
                    <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-red-900 font-bold text-sm leading-relaxed">{error}</p>
                        <p className="text-red-600/60 text-[11px] mt-1 font-medium italic">Nếu lỗi tiếp tục xảy ra, hãy thử với tệp PDF khác.</p>
                    </div>
                </div>
            )}

            {status === ProcessingState.IDLE && !file && (
                <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white border-2 border-dashed border-slate-200 rounded-[3rem] p-16 md:p-24 flex flex-col items-center justify-center text-center hover:border-indigo-500 hover:bg-indigo-50/10 transition-all cursor-pointer group shadow-xl shadow-slate-200/50"
                    >
                        <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mb-10 group-hover:scale-110 group-hover:-rotate-6 transition-all duration-500 shadow-inner">
                            <Upload className="w-12 h-12 text-indigo-600" />
                        </div>
                        <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tighter">Chuyển PDF sang Slide</h2>
                        <p className="text-slate-500 text-lg mb-10 max-w-sm font-medium opacity-80 leading-relaxed">
                            Công cụ miễn phí trích xuất nội dung và phục hồi nền slide từ bản quét PDF bằng AI.
                        </p>
                        <Button className="h-16 px-14 text-lg font-black rounded-2xl shadow-2xl shadow-indigo-100 uppercase tracking-widest">Chọn tệp PDF</Button>
                        <input type="file" ref={fileInputRef} accept="application/pdf" className="hidden" onChange={handleFileChange} />
                    </div>
                </div>
            )}

            {status === ProcessingState.IDLE && file && (
                <div className="w-full bg-white rounded-[3rem] shadow-2xl border border-slate-100 p-10 flex flex-col md:flex-row items-center gap-10 animate-in zoom-in-95">
                     <div className="w-40 h-52 bg-slate-50 rounded-2xl border border-slate-200 shadow-inner overflow-hidden flex-shrink-0 relative">
                        {filePreview ? <img src={filePreview} className="w-full h-full object-contain" /> : <FileType size={48} className="m-auto text-slate-300" />}
                        <div className="absolute top-3 right-3 bg-indigo-600 text-white p-2 rounded-xl shadow-lg">
                            <Zap size={16} />
                        </div>
                     </div>
                     <div className="flex-grow text-center md:text-left">
                        <h3 className="text-2xl font-black text-slate-900 mb-1 truncate max-w-xs">{file.name}</h3>
                        <p className="text-slate-400 font-black text-xs mb-8 uppercase tracking-[0.2em] italic">PDF Loaded • Ready to Process</p>
                        
                        <div className="flex gap-4">
                            <Button onClick={startConversion} className="flex-grow h-14 font-black rounded-2xl text-lg uppercase tracking-wider">Bắt đầu ngay</Button>
                            <Button variant="secondary" onClick={reset} className="h-14 px-8 rounded-2xl font-bold border-slate-200">Hủy</Button>
                        </div>
                     </div>
                </div>
            )}

            {(status === ProcessingState.READING_PDF || status === ProcessingState.ANALYZING_PAGES || status === ProcessingState.GENERATING_PPTX) && (
                <div className="w-full bg-white rounded-[3rem] shadow-2xl border border-indigo-50 p-16 text-center animate-in fade-in">
                    <div className="relative inline-flex mb-12">
                        <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-20 scale-150"></div>
                        <div className="relative w-24 h-24 rounded-[2rem] bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
                            <RefreshCw className="w-12 h-12 animate-spin" />
                        </div>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tighter">{progress.message}</h3>
                    <div className="w-full bg-slate-100 rounded-full h-5 overflow-hidden mt-8 shadow-inner p-1">
                        <div 
                            className="bg-gradient-to-r from-indigo-500 to-indigo-700 h-full transition-all duration-700 ease-out rounded-full shadow-[0_0_15px_rgba(79,70,229,0.4)]"
                            style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                        />
                    </div>
                    <div className="mt-6 flex justify-between px-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Engine Running...</span>
                        <span className="text-indigo-600 font-black text-xs">{Math.round((progress.current / Math.max(progress.total, 1)) * 100)}%</span>
                    </div>
                </div>
            )}

            {status === ProcessingState.COMPLETED && (
                <div className="bg-white rounded-[4rem] shadow-2xl border border-green-50 p-20 text-center animate-in bounce-in">
                    <div className="w-28 h-28 bg-green-100 text-green-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-inner rotate-6">
                        <Check className="w-14 h-14" />
                    </div>
                    <h2 className="text-4xl font-black text-slate-900 mb-6 tracking-tighter">Hoàn tất!</h2>
                    <p className="text-slate-500 font-medium mb-12 opacity-80 text-lg">Tệp PowerPoint của bạn đã sẵn sàng để tải xuống.</p>
                    <Button onClick={reset} className="w-full h-16 text-xl font-black rounded-2xl bg-indigo-600 shadow-xl shadow-indigo-100 uppercase tracking-widest">Chuyển đổi tệp mới</Button>
                </div>
            )}
        </main>
        
        <footer className="py-12 text-center">
            <div className="inline-flex flex-col items-center gap-4">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">Powered by Gemini AI Engine</span>
                <div className="h-px w-12 bg-slate-200" />
                <span className="text-sm font-black text-indigo-600/40 tracking-tighter italic">ScanToPPT Pro 3.1 • 2024</span>
            </div>
        </footer>
    </div>
  );
};

export default App;
