
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileType, Check, AlertCircle, RefreshCw, FileText, Sparkles, Key, Zap, Diamond, Info, LogIn, ExternalLink } from 'lucide-react';
import Button from './components/Button';
import StepIndicator from './components/StepIndicator';
import { ProcessingState, SlideData, ProcessingProgress, ModelMode } from './types';
import { loadPdf, renderPageToCanvas, getFirstPagePreview, applyRoughMask } from './services/pdfService';
import { analyzeSlideLayout, inpaintImage } from './services/geminiService';
import { generatePptx } from './services/pptxService';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingState>(ProcessingState.IDLE);
  const [progress, setProgress] = useState<ProcessingProgress>({ current: 0, total: 0, message: '' });
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [modelMode, setModelMode] = useState<ModelMode>('flash'); 

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      try {
        if (window.aistudio) {
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(selected);
        }
      } catch (e) {
        setHasApiKey(false);
      }
    };
    checkKey();
  }, []);

  const handleLoginWithGoogle = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        setHasApiKey(true); // Giả định thành công để tránh race condition
        setError(null);
      }
    } catch (e) {
      console.error("Key selection failed", e);
      setError("Không thể khởi động trình xác thực Google AI Studio.");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'application/pdf') {
        setError("Vui lòng tải lên định dạng PDF.");
        return;
      }
      setFile(selectedFile);
      setError(null);
      setStatus(ProcessingState.IDLE);
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
    if (!hasApiKey) {
        await handleLoginWithGoogle();
        return;
    }

    try {
      setStatus(ProcessingState.READING_PDF);
      setProgress({ current: 0, total: 0, message: 'Khởi tạo tiến trình...' });

      const pdf = await loadPdf(file);
      const totalPages = pdf.numPages;

      setStatus(ProcessingState.ANALYZING_PAGES);
      
      const processedSlides: SlideData[] = [];

      for (let i = 1; i <= totalPages; i++) {
        setProgress({ 
            current: i, 
            total: totalPages, 
            message: `Trang ${i}/${totalPages}: AI đang phân tích & phục hồi...` 
        });

        const { base64 } = await renderPageToCanvas(pdf, i, 2.0);
        
        // 1. Phân tích bố cục và OCR
        const elements = await analyzeSlideLayout(base64, i - 1, modelMode);
        
        // 2. Che mờ thô vùng chữ để AI phục hồi nền
        const maskedBase64 = await applyRoughMask(base64, elements);
        
        // 3. Sử dụng Gemini Image Model để phục hồi (Healing)
        const cleanedBase64 = await inpaintImage(maskedBase64, modelMode);

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
      const errMsg = err.message || "";
      if (errMsg.includes("Requested entity was not found") || errMsg.includes("404") || errMsg.includes("403") || errMsg.includes("API_KEY_INVALID")) {
          setHasApiKey(false);
          setStatus(ProcessingState.IDLE);
          setError(`Xác thực không hợp lệ. Vui lòng đăng nhập Google AI Studio lại.`);
      } else {
          setStatus(ProcessingState.ERROR);
          setError(errMsg || "Đã xảy ra lỗi không xác định.");
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
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 shadow-sm">
            <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-xl shadow-indigo-200 shadow-lg">
                        <FileText className="text-white w-5 h-5" />
                    </div>
                    <h1 className="text-xl font-black tracking-tighter">ScanToPPT <span className="text-indigo-600">PRO</span></h1>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="hidden sm:flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                        <button 
                            onClick={() => setModelMode('pro')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-black transition-all ${modelMode === 'pro' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Diamond size={14} /> Gemini 3 Pro
                        </button>
                        <button 
                            onClick={() => setModelMode('flash')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-black transition-all ${modelMode === 'flash' ? 'bg-white text-amber-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Zap size={14} /> 2.5 Flash
                        </button>
                    </div>

                    <button 
                        onClick={handleLoginWithGoogle}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-black transition-all ${hasApiKey ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95'}`}
                    >
                        {hasApiKey ? <Check size={14} /> : <LogIn size={14} />}
                        {hasApiKey ? 'Google Connected' : 'Google Login'}
                    </button>
                </div>
            </div>
        </header>

        <main className="flex-grow flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full">
            {!hasApiKey && status === ProcessingState.IDLE && (
                <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-12 text-center mb-8 animate-in slide-in-from-bottom-10 duration-700">
                    <div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 -rotate-3 shadow-inner">
                        <Key className="w-12 h-12" />
                    </div>
                    <h2 className="text-3xl font-black mb-4 tracking-tight">Cấp quyền AI</h2>
                    <p className="text-slate-500 text-base mb-10 leading-relaxed font-medium">
                        Để bắt đầu sử dụng công nghệ phục hồi nền AI, vui lòng đăng nhập và chọn API Key từ dự án <b>Google AI Studio</b> của bạn.
                    </p>
                    <div className="space-y-4">
                        <Button onClick={handleLoginWithGoogle} className="w-full h-14 text-lg font-black shadow-2xl shadow-indigo-100 group rounded-2xl">
                            <span className="group-hover:translate-x-1 transition-transform">Xác thực Google AI Studio</span>
                        </Button>
                        <a 
                            href="https://ai.google.dev/gemini-api/docs/billing" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[11px] text-indigo-500 hover:text-indigo-700 flex items-center justify-center gap-1.5 underline underline-offset-4 font-black uppercase tracking-widest"
                        >
                            Hướng dẫn Setup Billing <ExternalLink size={12} />
                        </a>
                    </div>
                </div>
            )}

            <div className={`w-full transition-all duration-700 ${!hasApiKey && status === ProcessingState.IDLE ? 'opacity-10 pointer-events-none blur-xl' : ''}`}>
                
                {status !== ProcessingState.IDLE && status !== ProcessingState.COMPLETED && (
                     <div className="mb-12">
                        <StepIndicator currentStep={status} />
                     </div>
                )}

                {error && (
                    <div className="mb-8 bg-red-50 border border-red-200 rounded-[1.5rem] p-6 flex flex-col gap-4 animate-in fade-in slide-in-from-top-4">
                        <div className="flex items-center gap-4">
                            <div className="p-2 bg-red-100 rounded-xl">
                                <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                            </div>
                            <span className="text-red-900 text-sm font-black leading-tight">{error}</span>
                        </div>
                        <div className="flex gap-4 ml-14">
                            <button onClick={handleLoginWithGoogle} className="text-xs text-red-700 font-black hover:underline uppercase tracking-widest">
                                → Đổi API Key / Đăng nhập lại
                            </button>
                        </div>
                    </div>
                )}

                {status === ProcessingState.IDLE && !file && (
                    <div className="flex flex-col gap-8">
                        <div 
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (e.dataTransfer.files?.[0]) {
                                    const f = e.dataTransfer.files[0];
                                    if (f.type === 'application/pdf') {
                                        setFile(f);
                                        getFirstPagePreview(f).then(setFilePreview);
                                    } else { setError("Vui lòng tải tệp PDF bản quét."); }
                                }
                            }}
                            className="bg-white border-2 border-dashed border-slate-300 rounded-[3rem] p-20 flex flex-col items-center justify-center text-center hover:border-indigo-500 hover:bg-indigo-50/20 transition-all cursor-pointer group shadow-sm relative overflow-hidden"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="w-28 h-28 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mb-10 group-hover:scale-110 group-hover:-rotate-12 transition-all duration-500 shadow-sm relative z-10">
                                <Upload className="w-14 h-14 text-indigo-600" />
                            </div>
                            <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tighter relative z-10">Tải lên tài liệu PDF</h2>
                            <p className="text-slate-500 text-lg mb-12 max-w-sm mx-auto leading-relaxed font-bold opacity-80 relative z-10">
                                Tự động phục hồi nền slide gốc và trích xuất chữ tiếng Việt chính xác 99%.
                            </p>
                            <Button className="px-14 h-16 text-xl font-black shadow-2xl shadow-indigo-100 rounded-[1.25rem] relative z-10">Chọn tài liệu ngay</Button>
                            <input type="file" ref={fileInputRef} accept="application/pdf" className="hidden" onChange={handleFileChange} />
                        </div>
                    </div>
                )}

                {status === ProcessingState.IDLE && file && (
                    <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 p-12 flex flex-col md:flex-row items-center gap-12 animate-in zoom-in-95 duration-500">
                         <div className="w-48 h-64 bg-slate-50 rounded-[1.5rem] border border-slate-200 shadow-inner flex-shrink-0 overflow-hidden relative group">
                                {filePreview ? (
                                    <img src={filePreview} alt="Preview" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-300"><FileType size={70} /></div>
                                )}
                                <div className="absolute top-4 right-4 bg-indigo-600 text-white p-2.5 rounded-2xl shadow-2xl animate-pulse">
                                    <Sparkles size={20} />
                                </div>
                         </div>
                         <div className="flex-grow text-center md:text-left">
                             <div className="flex items-center justify-center md:justify-start gap-4 mb-4">
                                 <h3 className="text-3xl font-black text-slate-900 truncate max-w-[320px] tracking-tight">{file.name}</h3>
                                 <span className={`px-4 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] ${modelMode === 'pro' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                                     {modelMode.toUpperCase()} MODE
                                 </span>
                             </div>
                             <p className="text-slate-500 text-lg mb-10 font-bold italic opacity-60">{(file.size / 1024 / 1024).toFixed(1)} MB • Sẵn sàng Inpainting</p>
                             <div className="flex flex-col sm:flex-row gap-5">
                                 <Button onClick={startConversion} className="flex-grow h-16 text-xl font-black shadow-2xl shadow-indigo-100 rounded-[1.25rem]">Bắt đầu Chuyển đổi</Button>
                                 <Button variant="secondary" onClick={reset} className="h-16 px-12 rounded-[1.25rem] font-black border-slate-200">Hủy</Button>
                             </div>
                         </div>
                    </div>
                )}

                {(status === ProcessingState.READING_PDF || status === ProcessingState.ANALYZING_PAGES || status === ProcessingState.GENERATING_PPTX) && (
                    <div className="bg-white rounded-[3rem] shadow-2xl border border-indigo-50 p-16 text-center animate-in fade-in zoom-in-95 duration-500 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-slate-100">
                            <div 
                                className="h-full bg-indigo-600 transition-all duration-700" 
                                style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                            />
                        </div>
                        <div className="relative inline-flex items-center justify-center mb-12">
                            <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-40"></div>
                            <div className="relative w-28 h-28 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
                                <RefreshCw className="w-14 h-14 animate-spin" />
                            </div>
                        </div>
                        <h3 className="text-4xl font-black text-slate-900 mb-4 tracking-tighter">{progress.message}</h3>
                        <div className="flex items-center justify-center gap-4 text-indigo-600/60 text-sm font-black uppercase tracking-[0.4em] mb-12">
                            <Sparkles size={24} className="animate-bounce" />
                            <span>AI Background Healing</span>
                            <Sparkles size={24} className="animate-bounce" />
                        </div>
                        
                        <div className="w-full bg-slate-100 rounded-full h-6 overflow-hidden mb-6 shadow-inner p-1.5">
                            <div 
                                className="bg-gradient-to-r from-indigo-500 to-indigo-700 h-full transition-all duration-1000 ease-out shadow-[0_0_30px_rgba(79,70,229,0.8)] rounded-full"
                                style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-slate-400 font-black uppercase tracking-[0.25em] px-4">
                            <span>Processing Page {progress.current} of {progress.total}</span>
                            <span className="text-indigo-600">{Math.round((progress.current / Math.max(progress.total, 1)) * 100)}%</span>
                        </div>
                    </div>
                )}

                {status === ProcessingState.COMPLETED && (
                    <div className="bg-white rounded-[4rem] shadow-2xl border border-green-50 p-20 text-center animate-in bounce-in duration-700">
                        <div className="w-32 h-32 bg-green-100 text-green-600 rounded-[3rem] flex items-center justify-center mx-auto mb-10 shadow-inner rotate-12 transition-transform hover:rotate-0 duration-500">
                            <Check className="w-16 h-16" />
                        </div>
                        <h2 className="text-5xl font-black text-slate-900 mb-6 tracking-tighter">Hoàn tất!</h2>
                        <p className="text-slate-500 text-xl mb-14 font-bold leading-relaxed max-w-md mx-auto opacity-80">Slide của bạn đã được phục hồi nền và sẵn sàng chỉnh sửa nội dung.</p>
                        <div className="flex flex-col gap-6">
                            <Button onClick={reset} variant="primary" className="w-full h-18 text-2xl font-black shadow-2xl shadow-indigo-100 rounded-[1.5rem]">Xử lý tệp PDF mới</Button>
                        </div>
                    </div>
                )}

            </div>
        </main>
        
        <footer className="py-16 text-center text-slate-400 flex flex-col items-center gap-8">
            <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex items-center gap-3 bg-white px-6 py-2 rounded-2xl border border-slate-200 shadow-sm">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="font-black uppercase tracking-[0.2em] text-[10px]">Version 3.0 Stable</span>
                </div>
                <div className="h-px w-12 bg-slate-200 hidden md:block" />
                <span className="font-black text-slate-500 text-sm tracking-tight italic opacity-70">OCR & Background Healing AI Engine</span>
            </div>
            <div className="flex flex-col gap-3">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Designed and Developed by</span>
                <a 
                    href="https://www.facebook.com/lamtung2201/" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="group relative inline-block"
                >
                    <span className="text-2xl font-black text-indigo-600 transition-all group-hover:tracking-[0.1em] group-hover:text-indigo-800">Tùng Tinh Tấn</span>
                    <div className="absolute -bottom-2 left-0 w-0 h-1.5 bg-indigo-200 transition-all group-hover:w-full rounded-full" />
                </a>
            </div>
        </footer>
    </div>
  );
};

export default App;
