
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
    // Fix: Using optional modifier to ensure compatibility with potential external/global declarations
    // that might already exist in the environment, resolving "identical modifiers" error.
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

  // Kiểm tra trạng thái Key khi khởi tạo
  useEffect(() => {
    const checkInitialAuth = async () => {
      // Nếu đã có API_KEY trong môi trường, coi như đã xác thực
      if (process.env.API_KEY && process.env.API_KEY !== 'undefined' && process.env.API_KEY !== '') {
        setHasApiKey(true);
        return;
      }

      try {
        // Fix: Use optional chaining when accessing aistudio to prevent runtime errors if not present
        const selected = await window.aistudio?.hasSelectedApiKey();
        if (selected) {
          setHasApiKey(true);
        }
      } catch (e) {
        console.warn("Auth check failed, assuming not logged in.");
        setHasApiKey(false);
      }
    };
    checkInitialAuth();
  }, []);

  const handleLoginWithGoogle = async () => {
    setError(null);
    try {
      // Fix: Use optional chaining when accessing aistudio
      await window.aistudio?.openSelectKey();
      
      // Hướng dẫn bắt buộc: "MUST assume the key selection was successful after triggering openSelectKey() and proceed to the app"
      setHasApiKey(true);
      console.log("Key selection triggered successfully");
    } catch (e: any) {
      console.error("Key selection error:", e);
      setError(`Lỗi kết nối AI Studio: ${e.message || "Vui lòng kiểm tra lại môi trường trình duyệt."}`);
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
    
    // Nếu chưa có Key, yêu cầu người dùng chọn Key trước
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
      setProgress({ current: totalPages, total: totalPages, message: 'Đang đóng gói tệp PowerPoint...' });

      await generatePptx(processedSlides);
      setStatus(ProcessingState.COMPLETED);

    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || "";
      // Xử lý lỗi đặc thù: "Requested entity was not found" yêu cầu reset Key
      if (errMsg.includes("Requested entity was not found") || errMsg.includes("404") || errMsg.includes("403") || errMsg.includes("API_KEY_INVALID")) {
          setHasApiKey(false);
          setStatus(ProcessingState.IDLE);
          setError(`Xác thực AI Studio không hợp lệ hoặc đã hết hạn. Vui lòng bấm Đăng nhập lại.`);
          // Tự động mở lại dialog chọn key nếu gặp lỗi xác thực
          handleLoginWithGoogle();
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
        <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 shadow-sm">
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
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-black transition-all ${hasApiKey ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95'}`}
                    >
                        {hasApiKey ? <Check size={14} /> : <LogIn size={14} />}
                        {hasApiKey ? 'Đã xác thực Google' : 'Đăng nhập Google'}
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
                    <h2 className="text-3xl font-black mb-4 tracking-tight text-slate-900">Cấp quyền AI</h2>
                    <p className="text-slate-500 text-base mb-10 leading-relaxed font-medium">
                        Để bắt đầu sử dụng công nghệ phục hồi nền AI, vui lòng đăng nhập và chọn API Key từ dự án <b>Google AI Studio</b> của bạn.
                    </p>
                    <div className="space-y-4">
                        <Button 
                            onClick={handleLoginWithGoogle} 
                            className="w-full h-14 text-lg font-black shadow-2xl shadow-indigo-100 group rounded-2xl bg-indigo-600 hover:bg-indigo-700"
                        >
                            <span className="group-hover:translate-x-1 transition-transform">Xác thực Google AI Studio</span>
                        </Button>
                        <a 
                            href="https://ai.google.dev/gemini-api/docs/billing" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[11px] text-indigo-500 hover:text-indigo-700 flex items-center justify-center gap-1.5 underline underline-offset-4 font-black uppercase tracking-widest"
                        >
                            HƯỚNG DẪN SETUP BILLING <ExternalLink size={12} />
                        </a>
                    </div>
                </div>
            )}

            <div className={`w-full transition-all duration-700 ${!hasApiKey && status === ProcessingState.IDLE ? 'opacity-10 pointer-events-none blur-xl' : 'opacity-100'}`}>
                
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
                            <button onClick={handleLoginWithGoogle} className="text-xs text-red-7