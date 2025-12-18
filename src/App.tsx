
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileType, Check, AlertCircle, RefreshCw, FileText, Sparkles, Key, Zap, Diamond, LogIn, ExternalLink, Settings } from 'lucide-react';
import Button from './components/Button';
import StepIndicator from './components/StepIndicator';
import { ProcessingState, SlideData, ProcessingProgress, ModelMode } from './types';
import { loadPdf, renderPageToCanvas, getFirstPagePreview, applyRoughMask } from './services/pdfService';
import { analyzeSlideLayout, inpaintImage } from './services/geminiService';
import { generatePptx } from './services/pptxService';

// Fix: Moving AIStudio definition into global scope and using a unified declaration to avoid "identical modifiers" errors.
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey(): Promise<boolean>;
      openSelectKey(): Promise<void>;
    };
  }
}

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingState>(ProcessingState.IDLE);
  const [progress, setProgress] = useState<ProcessingProgress>({ current: 0, total: 0, message: '' });
  const [error, setError] = useState<string | null>(null);
  const [modelMode, setModelMode] = useState<ModelMode>('flash'); 
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(false);
  const [hasGlobalKey, setHasGlobalKey] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if Developer has pre-configured the API Key in the environment
  useEffect(() => {
    const key = process.env.API_KEY;
    if (key && key !== 'undefined' && key !== '') {
      setHasGlobalKey(true);
    }
  }, []);

  const handleLoginWithGoogle = async () => {
    setError(null);
    setIsAuthChecking(true);
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        setIsAuthChecking(false);
        // Requirement: Assume successful after triggering openSelectKey and proceed.
      } else {
        setError("Vui lòng cấu hình API_KEY trong Vercel Environment Variables.");
        setIsAuthChecking(false);
      }
    } catch (e: any) {
      setError(`Lỗi xác thực: ${e.message}`);
      setIsAuthChecking(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'application/pdf') {
        setError("Vui lòng tải lên tệp PDF.");
        return;
      }
      setFile(selectedFile);
      setError(null);
      try {
        const previewUrl = await getFirstPagePreview(selectedFile);
        setFilePreview(previewUrl);
      } catch (err) {
        console.warn("Preview error", err);
      }
    }
  };

  const startConversion = async () => {
    if (!file) return;

    // Requirement: Mandatory API Key selection for Gemini 3 Pro image/video models.
    if (modelMode === 'pro' && !hasGlobalKey) {
        try {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            if (!hasKey) {
                setError("Chế độ 3 PRO yêu cầu xác thực Google AI Studio.");
                return;
            }
        } catch (err) {
            console.error("Auth check failed", err);
        }
    }
    
    setError(null);
    try {
      setStatus(ProcessingState.READING_PDF);
      setProgress({ current: 0, total: 0, message: 'Đang khởi tạo AI...' });

      const pdf = await loadPdf(file);
      const totalPages = pdf.numPages;

      setStatus(ProcessingState.ANALYZING_PAGES);
      const processedSlides: SlideData[] = [];

      for (let i = 1; i <= totalPages; i++) {
        setProgress({ 
            current: i, 
            total: totalPages, 
            message: `Đang trích xuất trang ${i}/${totalPages}...` 
        });

        const { base64 } = await renderPageToCanvas(pdf, i, 2.0);
        const elements = await analyzeSlideLayout(base64, i - 1, modelMode);
        const maskedBase64 = await applyRoughMask(base64, elements);
        const cleanedBase64 = await inpaintImage(maskedBase64, modelMode);

        processedSlides.push({
            id: i - 1,
            backgroundImage: cleanedBase64,
            elements: elements
        });
      }

      setStatus(ProcessingState.GENERATING_PPTX);
      setProgress({ current: totalPages, total: totalPages, message: 'Đang tạo tệp .pptx...' });
      await generatePptx(processedSlides);
      setStatus(ProcessingState.COMPLETED);

    } catch (err: any) {
      console.error(err);
      setStatus(ProcessingState.IDLE);
      
      // Fix: Handle "Requested entity was not found" by prompting user to re-select key as per guidelines.
      if (err.message?.includes("Requested entity was not found")) {
          setError("LỖI: Không tìm thấy API Key hoặc Project. Vui lòng chọn lại Key.");
          if (window.aistudio) {
              await window.aistudio.openSelectKey();
          }
      } else if (err.message === "API_KEY_NOT_FOUND" || err.message?.includes("API key")) {
          setError("LỖI CẤU HÌNH: API Key của hệ thống chưa được thiết lập hoặc đã hết hạn.");
      } else {
          setError(`Lỗi xử lý: ${err.message || "Đã xảy ra sự cố kỹ thuật."}`);
      }
    }
  };

  const reset = () => {
    setFile(null);
    setFilePreview(null);
    setStatus(ProcessingState.IDLE);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-slate-900 overflow-x-hidden">
        <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
                        <FileText className="text-white w-5 h-5" />
                    </div>
                    <h1 className="text-xl font-black tracking-tighter">ScanToPPT <span className="text-indigo-600">PRO</span></h1>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Server: Ready</span>
                    </div>
                    {!hasGlobalKey && (
                        <button 
                            onClick={handleLoginWithGoogle}
                            className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all border border-indigo-100"
                        >
                            <Settings size={14} />
                            <span>Setup Key</span>
                        </button>
                    )}
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
                <div className="w-full mb-8 bg-red-50 border border-red-100 rounded-3xl p-6 flex items-start gap-4 animate-in zoom-in-95 shadow-sm">
                    <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
                    <div>
                        <p className="text-red-900 font-bold text-sm leading-relaxed">{error}</p>
                        <p className="text-red-700/60 text-[11px] mt-2 font-medium">Lưu ý: Bạn có thể liên hệ quản trị viên để cập nhật hệ thống.</p>
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
                            <Upload className="w-10 h-10 text-indigo-600" />
                        </div>
                        <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tighter">Chuyển PDF sang Slide</h2>
                        <p className="text-slate-500 text-lg mb-10 max-w-sm font-medium opacity-80 leading-relaxed">
                            Công cụ phục hồi nền slide và trích xuất nội dung văn bản tiếng Việt từ bản quét PDF.
                        </p>
                        <Button className="h-14 px-12 text-lg font-black rounded-2xl shadow-xl shadow-indigo-100 uppercase tracking-widest">Tải PDF lên ngay</Button>
                        <input type="file" ref={fileInputRef} accept="application/pdf" className="hidden" onChange={handleFileChange} />
                    </div>
                </div>
            )}

            {status === ProcessingState.IDLE && file && (
                <div className="w-full bg-white rounded-[3rem] shadow-2xl border border-slate-100 p-12 flex flex-col md:flex-row items-center gap-12 animate-in zoom-in-95">
                     <div className="w-44 h-56 bg-slate-50 rounded-2xl border border-slate-200 shadow-inner overflow-hidden flex-shrink-0 relative">
                        {filePreview ? <img src={filePreview} className="w-full h-full object-contain" /> : <FileType size={48} className="m-auto text-slate-300" />}
                        <div className="absolute top-3 right-3 bg-indigo-600 text-white p-2 rounded-xl shadow-lg">
                            <Sparkles size={16} />
                        </div>
                     </div>
                     <div className="flex-grow text-center md:text-left">
                        <h3 className="text-2xl font-black text-slate-900 mb-2 truncate max-w-xs">{file.name}</h3>
                        <p className="text-slate-400 font-bold text-xs mb-8 uppercase tracking-[0.2em] italic">PDF Loaded • Ready to Scan</p>
                        
                        <div className="flex flex-wrap gap-4 justify-center md:justify-start mb-8">
                             <div className="bg-slate-50 p-1 rounded-2xl flex border border-slate-100 shadow-inner">
                                 <button onClick={() => setModelMode('flash')} className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all ${modelMode === 'flash' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
                                    <Zap size={14} className="inline mr-1.5" /> 3 FLASH (Fast)
                                 </button>
                                 <button onClick={() => setModelMode('pro')} className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all ${modelMode === 'pro' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
                                    <Diamond size={14} className="inline mr-1.5" /> 3 PRO (High Quality)
                                 </button>
                             </div>
                        </div>

                        <div className="flex gap-4">
                            <Button onClick={startConversion} className="flex-grow h-14 font-black rounded-2xl text-lg uppercase tracking-wider">Xử lý ngay</Button>
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
                            className="bg-gradient-to-r from-indigo-500 to-indigo-700 h-full transition-all duration-700 ease-out rounded-full"
                            style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                        />
                    </div>
                    <div className="mt-6 flex justify-between px-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Processing...</span>
                        <span className="text-indigo-600 font-black text-xs">{Math.round((progress.current / Math.max(progress.total, 1)) * 100)}%</span>
                    </div>
                </div>
            )}

            {status === ProcessingState.COMPLETED && (
                <div className="bg-white rounded-[4rem] shadow-2xl border border-green-50 p-20 text-center animate-in bounce-in">
                    <div className="w-28 h-28 bg-green-100 text-green-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-inner rotate-6">
                        <Check className="w-14 h-14" />
                    </div>
                    <h2 className="text-4xl font-black text-slate-900 mb-6 tracking-tighter">Thành công!</h2>
                    <p className="text-slate-500 font-medium mb-12 opacity-80 text-lg">Hệ thống đã hoàn tất việc phục hồi Slide của bạn.</p>
                    <Button onClick={reset} className="w-full h-16 text-xl font-black rounded-2xl bg-indigo-600 shadow-xl shadow-indigo-100 uppercase tracking-widest">Chuyển tệp khác</Button>
                </div>
            )}
        </main>
        
        <footer className="py-12 text-center">
            <div className="inline-flex flex-col items-center gap-4">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">Powered by Gemini AI Engine</span>
                <div className="h-px w-12 bg-slate-200" />
                <span className="text-sm font-black text-indigo-600/40 tracking-tighter italic">ScanToPPT Pro 3.1 Stable</span>
            </div>
        </footer>
    </div>
  );
};

export default App;
