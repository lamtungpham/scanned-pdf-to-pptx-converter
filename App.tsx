
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
    // Fixed: Made aistudio optional to match potential external declarations and avoid modifier mismatch errors.
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
        // Tuân thủ hướng dẫn: Giả định window.aistudio luôn sẵn dùng trong môi trường thực thi
        if (window.aistudio) {
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(selected);
        }
      } catch (e) {
        // Nếu lỗi xảy ra (ví dụ chạy local không có aistudio), mặc định chưa có key
        console.warn("API Key check skipped or failed");
        setHasApiKey(false);
      }
    };
    checkKey();
  }, []);

  const handleLoginWithGoogle = async () => {
    try {
      // Gọi trình chọn Key của AI Studio - Người dùng coi đây là bước "Login Google"
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        // Theo hướng dẫn: Giả định thành công ngay lập tức để tránh race condition
        setHasApiKey(true);
        setError(null);
      }
    } catch (e) {
      console.error("Key selection failed", e);
      setError("Không thể mở trình chọn API Key. Vui lòng đảm bảo bạn đang sử dụng trình duyệt được hỗ trợ.");
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
      setProgress({ current: 0, total: 0, message: 'Đang chuẩn bị tệp tin...' });

      const pdf = await loadPdf(file);
      const totalPages = pdf.numPages;

      setStatus(ProcessingState.ANALYZING_PAGES);
      
      const processedSlides: SlideData[] = [];

      for (let i = 1; i <= totalPages; i++) {
        setProgress({ 
            current: i, 
            total: totalPages, 
            message: `Trang ${i}/${totalPages}: Đang xử lý (${modelMode.toUpperCase()})...` 
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
      setProgress({ current: totalPages, total: totalPages, message: 'Đang tạo tệp PowerPoint...' });

      await generatePptx(processedSlides);
      setStatus(ProcessingState.COMPLETED);

    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || "";
      // Xử lý lỗi 404 hoặc Requested entity was not found theo hướng dẫn
      if (errMsg.includes("Requested entity was not found") || errMsg.includes("API_KEY_INVALID") || errMsg.includes("403") || errMsg.includes("401") || errMsg.includes("404")) {
          setHasApiKey(false);
          setStatus(ProcessingState.IDLE);
          setError(`Phiên làm việc hết hạn hoặc API Key không hợp lệ. Vui lòng đăng nhập lại bằng Google.`);
      } else {
          setStatus(ProcessingState.ERROR);
          setError(errMsg || "Đã xảy ra lỗi trong quá trình xử lý.");
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
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
            <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="bg-indigo-600 p-1.5 rounded-lg shadow-indigo-200 shadow-lg">
                        <FileText className="text-white w-5 h-5" />
                    </div>
                    <h1 className="text-lg font-bold tracking-tight">ScanToPPT <span className="text-indigo-600">AI</span></h1>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button 
                            onClick={() => setModelMode('pro')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${modelMode === 'pro' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Diamond size={14} /> Pro (Paid)
                        </button>
                        <button 
                            onClick={() => setModelMode('flash')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${modelMode === 'flash' ? 'bg-white text-amber-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Zap size={14} /> Flash (Free Tier)
                        </button>
                    </div>

                    <button 
                        onClick={handleLoginWithGoogle}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all ${hasApiKey ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95'}`}
                    >
                        {hasApiKey ? <Check size={14} /> : <LogIn size={14} />}
                        {hasApiKey ? 'Đã kết nối Google' : 'Đăng nhập bằng Google'}
                    </button>
                </div>
            </div>
        </header>

        <main className="flex-grow flex flex-col items-center justify-center p-4">
            {!hasApiKey && status === ProcessingState.IDLE && (
                <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-10 text-center mb-8 animate-in slide-in-from-bottom-6 duration-500">
                    <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3">
                        <LogIn className="w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-black mb-3 tracking-tight">Xác thực tài khoản</h2>
                    <p className="text-slate-500 text-sm mb-8 leading-relaxed font-medium">
                        Để đảm bảo quyền lợi và hạn mức sử dụng, vui lòng đăng nhập bằng Google và chọn API Key từ <b>AI Studio</b> của bạn.
                    </p>
                    <div className="space-y-4">
                        <Button onClick={handleLoginWithGoogle} className="w-full h-14 text-lg font-black shadow-xl shadow-indigo-100 group">
                            <span className="group-hover:translate-x-1 transition-transform">Đăng nhập bằng Google</span>
                        </Button>
                        <div className="flex flex-col gap-2">
                             <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                                 <Info size={12} />
                                 <span>Yêu cầu dự án Google AI Studio</span>
                             </div>
                             <a 
                                href="https://ai.google.dev/gemini-api/docs/billing" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[10px] text-indigo-500 hover:text-indigo-700 flex items-center justify-center gap-1 underline underline-offset-2 font-bold"
                             >
                                Tìm hiểu về Billing & API Key <ExternalLink size={10} />
                             </a>
                        </div>
                    </div>
                </div>
            )}

            <div className={`w-full max-w-2xl transition-all duration-500 ${!hasApiKey && status === ProcessingState.IDLE ? 'opacity-20 pointer-events-none blur-sm' : ''}`}>
                
                {status !== ProcessingState.IDLE && status !== ProcessingState.COMPLETED && (
                     <div className="mb-8 flex justify-center">
                        <StepIndicator currentStep={status} />
                     </div>
                )}

                {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-6 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                            <span className="text-red-800 text-sm font-black leading-tight">{error}</span>
                        </div>
                        <div className="flex flex-wrap gap-4 ml-9">
                            {modelMode === 'pro' && (
                                <button onClick={() => setModelMode('flash')} className="text-xs text-indigo-600 font-black hover:underline uppercase tracking-wider">
                                    → Chuyển sang Flash (Free)
                                </button>
                            )}
                            <button onClick={handleLoginWithGoogle} className="text-xs text-slate-600 font-black hover:underline uppercase tracking-wider">
                                → Thử đăng nhập lại
                            </button>
                        </div>
                    </div>
                )}

                {status === ProcessingState.IDLE && !file && (
                    <div className="flex flex-col gap-6">
                        <div className="flex md:hidden bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                            <button onClick={() => setModelMode('pro')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all ${modelMode === 'pro' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}`}>
                                <Diamond size={14} /> Pro
                            </button>
                            <button onClick={() => setModelMode('flash')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all ${modelMode === 'flash' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-500'}`}>
                                <Zap size={14} /> Flash
                            </button>
                        </div>

                        <div 
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (e.dataTransfer.files?.[0]) {
                                    const f = e.dataTransfer.files[0];
                                    if (f.type === 'application/pdf') {
                                        setFile(f);
                                        getFirstPagePreview(f).then(setFilePreview);
                                    } else { setError("Vui lòng tải lên PDF."); }
                                }
                            }}
                            className="bg-white border-2 border-dashed border-slate-300 rounded-[2.5rem] p-16 flex flex-col items-center justify-center text-center hover:border-indigo-500 hover:bg-indigo-50/20 transition-all cursor-pointer group shadow-sm"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="w-24 h-24 bg-indigo-50 rounded-[2.2rem] flex items-center justify-center mb-8 group-hover:scale-110 group-hover:-rotate-6 transition-all duration-500 shadow-sm">
                                <Upload className="w-12 h-12 text-indigo-600" />
                            </div>
                            <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tighter">Tải lên tài liệu PDF</h2>
                            <p className="text-slate-500 text-base mb-10 max-w-sm mx-auto leading-relaxed font-bold">
                                Chuyển đổi bản quét thành PowerPoint có thể chỉnh sửa với AI Background Healing.
                            </p>
                            <Button className="px-12 h-14 text-lg font-black shadow-2xl shadow-indigo-100 rounded-2xl">Chọn tệp tin ngay</Button>
                            <input type="file" ref={fileInputRef} accept="application/pdf" className="hidden" onChange={handleFileChange} />
                        </div>
                    </div>
                )}

                {status === ProcessingState.IDLE && file && (
                    <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-10 flex flex-col md:flex-row items-center gap-10 animate-in zoom-in-95 duration-500">
                         <div className="w-44 h-60 bg-slate-50 rounded-2xl border border-slate-200 shadow-inner flex-shrink-0 overflow-hidden relative group">
                                {filePreview ? (
                                    <img src={filePreview} alt="Preview" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-300"><FileType size={60} /></div>
                                )}
                                <div className="absolute top-4 right-4 bg-indigo-600 text-white p-2 rounded-2xl shadow-2xl">
                                    <Sparkles size={18} />
                                </div>
                         </div>
                         <div className="flex-grow text-center md:text-left">
                             <div className="flex items-center justify-center md:justify-start gap-4 mb-3">
                                 <h3 className="text-2xl font-black text-slate-900 truncate max-w-[280px] tracking-tight">{file.name}</h3>
                                 <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-widest ${modelMode === 'pro' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                                     {modelMode.toUpperCase()}
                                 </span>
                             </div>
                             <p className="text-slate-500 text-base mb-8 font-bold italic opacity-80">{(file.size / 1024 / 1024).toFixed(1)} MB • Đã sẵn sàng phục hồi nền</p>
                             <div className="flex flex-col sm:flex-row gap-4">
                                 <Button onClick={startConversion} className="flex-grow h-14 text-lg font-black shadow-xl shadow-indigo-100 rounded-2xl">Bắt đầu xử lý</Button>
                                 <Button variant="secondary" onClick={reset} className="h-14 px-10 rounded-2xl font-black">Hủy bỏ</Button>
                             </div>
                         </div>
                    </div>
                )}

                {(status === ProcessingState.READING_PDF || status === ProcessingState.ANALYZING_PAGES || status === ProcessingState.GENERATING_PPTX) && (
                    <div className="bg-white rounded-[2.5rem] shadow-2xl border border-indigo-50 p-14 text-center animate-in fade-in zoom-in-95 duration-500">
                        <div className="relative inline-flex items-center justify-center mb-10">
                            <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-30"></div>
                            <div className="relative w-24 h-24 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
                                <RefreshCw className="w-12 h-12 animate-spin" />
                            </div>
                        </div>
                        <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tighter">{progress.message}</h3>
                        <p className="text-indigo-600/60 text-xs uppercase tracking-[0.3em] font-black mb-12 flex items-center justify-center gap-3">
                            <Sparkles size={20} className="animate-pulse" /> AI Healing Active
                        </p>
                        
                        <div className="w-full bg-slate-100 rounded-full h-5 overflow-hidden mb-5 shadow-inner p-1">
                            <div 
                                className="bg-indigo-600 h-full transition-all duration-700 ease-in-out shadow-[0_0_25px_rgba(79,70,229,0.7)] rounded-full"
                                style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400 font-black uppercase tracking-[0.2em] px-2">
                            <span>Mô hình {modelMode.toUpperCase()}</span>
                            <span>{Math.round((progress.current / Math.max(progress.total, 1)) * 100)}%</span>
                        </div>
                    </div>
                )}

                {status === ProcessingState.COMPLETED && (
                    <div className="bg-white rounded-[3rem] shadow-2xl border border-green-50 p-16 text-center animate-in bounce-in duration-700">
                        <div className="w-28 h-28 bg-green-100 text-green-600 rounded-[2.8rem] flex items-center justify-center mx-auto mb-10 shadow-inner rotate-6">
                            <Check className="w-14 h-14" />
                        </div>
                        <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tighter">Hoàn tất!</h2>
                        <p className="text-slate-500 text-lg mb-12 font-bold leading-relaxed max-w-sm mx-auto">File PowerPoint đã được tối ưu và sẵn sàng để tải xuống.</p>
                        <div className="flex flex-col gap-5">
                            <Button onClick={reset} variant="primary" className="w-full h-16 text-xl font-black shadow-2xl shadow-indigo-100 rounded-2xl">Chuyển đổi tệp khác</Button>
                        </div>
                    </div>
                )}

            </div>
        </main>
        
        <footer className="py-12 text-center text-slate-400 text-[10px] md:text-xs flex flex-col items-center gap-5">
            <div className="flex flex-col md:flex-row items-center gap-3 md:gap-5">
                <span className="font-bold uppercase tracking-widest bg-slate-100 px-4 py-1.5 rounded-full">ScanToPPT AI Pro • V2.9</span>
                <span className="font-black text-slate-500">OCR with AI Background Healing Technology</span>
            </div>
            <div className="text-slate-500 font-black text-sm">
                Thực hiện bởi <a href="https://www.facebook.com/lamtung2201/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 font-black underline decoration-indigo-200 decoration-4 underline-offset-4 transition-all hover:tracking-wider">Tùng Tinh Tấn</a>
            </div>
        </footer>
    </div>
  );
};

export default App;
