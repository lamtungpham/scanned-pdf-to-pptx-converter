
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileType, Check, AlertCircle, RefreshCw, FileText, Sparkles, Key, ExternalLink, Zap, Diamond, Info } from 'lucide-react';
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
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [modelMode, setModelMode] = useState<ModelMode>('flash'); 

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
      setError(null);
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
        setError("Vui lòng cấu hình API Key trước khi bắt đầu.");
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
      if (err.message === "API_KEY_INVALID") {
          setHasApiKey(false);
          setStatus(ProcessingState.IDLE);
          setError(`Lỗi: Mô hình ${modelMode.toUpperCase()} từ chối truy cập. Nếu bạn dùng Key miễn phí, hãy chuyển sang chế độ "Flash" (Free Tier) hoặc bật Billing cho Project.`);
      } else {
          setStatus(ProcessingState.ERROR);
          setError(err.message || "Đã xảy ra lỗi trong quá trình xử lý.");
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
                        onClick={handleSelectKey}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${hasApiKey ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'}`}
                    >
                        <Key size={14} />
                        {hasApiKey ? 'API OK' : 'Setup Key'}
                    </button>
                </div>
            </div>
        </header>

        <main className="flex-grow flex flex-col items-center justify-center p-4">
            {!hasApiKey && status === ProcessingState.IDLE && (
                <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-amber-100 p-8 text-center mb-8 animate-in slide-in-from-bottom-4">
                    <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Key className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">Yêu cầu API Key</h2>
                    <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                        Bạn cần cấu hình API Key để sử dụng tính năng AI. Hãy sử dụng <b>Gemini 2.5 Flash</b> nếu bạn dùng tài khoản miễn phí.
                    </p>
                    <div className="space-y-3">
                        <Button onClick={handleSelectKey} className="w-full shadow-lg shadow-indigo-100">Cấu hình API Key</Button>
                        <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400">
                             <Info size={12} />
                             <span>Tự động tối ưu hóa và làm sạch slide</span>
                        </div>
                    </div>
                </div>
            )}

            <div className={`w-full max-w-2xl transition-all duration-300 ${!hasApiKey && status === ProcessingState.IDLE ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                
                {status !== ProcessingState.IDLE && status !== ProcessingState.COMPLETED && (
                     <div className="mb-8 flex justify-center">
                        <StepIndicator currentStep={status} />
                     </div>
                )}

                {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600" />
                            <span className="text-red-800 text-sm font-bold">{error}</span>
                        </div>
                        {modelMode === 'pro' && (
                            <button onClick={() => setModelMode('flash')} className="text-xs text-indigo-600 font-bold ml-8 text-left hover:underline">
                                → Thử chuyển sang chế độ Flash (Dành cho tài khoản Free)
                            </button>
                        )}
                    </div>
                )}

                {status === ProcessingState.IDLE && !file && (
                    <div className="flex flex-col gap-6">
                        <div className="flex md:hidden bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                            <button onClick={() => setModelMode('pro')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold ${modelMode === 'pro' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'text-slate-500'}`}>
                                <Diamond size={14} /> Pro
                            </button>
                            <button onClick={() => setModelMode('flash')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold ${modelMode === 'flash' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'text-slate-500'}`}>
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
                            className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center hover:border-indigo-500 hover:bg-indigo-50/30 transition-all cursor-pointer group shadow-sm"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-sm">
                                <Upload className="w-10 h-10 text-indigo-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 mb-2">Tải lên PDF Bản Quét</h2>
                            <p className="text-slate-500 text-sm mb-8 max-w-xs mx-auto leading-relaxed">
                                Tự động nhận diện chữ tiếng Việt, phục hồi nền slide và tối ưu hóa bố cục trang.
                            </p>
                            <Button className="w-full max-w-xs shadow-xl shadow-indigo-100">Chọn tệp PDF</Button>
                            <input type="file" ref={fileInputRef} accept="application/pdf" className="hidden" onChange={handleFileChange} />
                        </div>
                    </div>
                )}

                {status === ProcessingState.IDLE && file && (
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 flex flex-col sm:flex-row items-center gap-8 animate-in zoom-in-95 duration-300">
                         <div className="w-32 h-44 bg-slate-50 rounded-lg border border-slate-200 shadow-inner flex-shrink-0 overflow-hidden relative">
                                {filePreview ? (
                                    <img src={filePreview} alt="Preview" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-300"><FileType size={40} /></div>
                                )}
                                <div className="absolute top-2 right-2 bg-indigo-600 text-white p-1 rounded-md shadow-lg">
                                    <Sparkles size={14} />
                                </div>
                         </div>
                         <div className="flex-grow text-center sm:text-left">
                             <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                                 <h3 className="text-xl font-bold text-slate-900 truncate max-w-[200px]">{file.name}</h3>
                                 <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${modelMode === 'pro' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                                     {modelMode.toUpperCase()}
                                 </span>
                             </div>
                             <p className="text-slate-500 text-sm mb-6">{(file.size / 1024 / 1024).toFixed(1)} MB • Phục hồi nền tự động</p>
                             <div className="flex flex-col sm:flex-row gap-3">
                                 <Button onClick={startConversion} className="flex-grow shadow-lg shadow-indigo-100">Bắt đầu Phục hồi</Button>
                                 <Button variant="secondary" onClick={reset}>Hủy bỏ</Button>
                             </div>
                         </div>
                    </div>
                )}

                {(status === ProcessingState.READING_PDF || status === ProcessingState.ANALYZING_PAGES || status === ProcessingState.GENERATING_PPTX) && (
                    <div className="bg-white rounded-2xl shadow-2xl border border-indigo-50 p-10 text-center animate-in fade-in zoom-in-95">
                        <div className="relative inline-flex items-center justify-center mb-6">
                            <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-25"></div>
                            <div className="relative w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <RefreshCw className="w-8 h-8 animate-spin" />
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">{progress.message}</h3>
                        <p className="text-indigo-600/60 text-xs uppercase tracking-widest font-bold mb-8 flex items-center justify-center gap-2">
                            <Sparkles size={14} /> Advanced Background Healing Active
                        </p>
                        
                        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden mb-3">
                            <div 
                                className="bg-indigo-600 h-full transition-all duration-700 ease-in-out shadow-[0_0_15px_rgba(79,70,229,0.5)]"
                                style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-tighter px-1">
                            <span>Đang xử lý {modelMode.toUpperCase()}</span>
                            <span>{Math.round((progress.current / Math.max(progress.total, 1)) * 100)}%</span>
                        </div>
                    </div>
                )}

                {status === ProcessingState.COMPLETED && (
                    <div className="bg-white rounded-2xl shadow-2xl border border-green-50 p-12 text-center animate-in bounce-in duration-500">
                        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                            <Check className="w-10 h-10" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Thành công!</h2>
                        <p className="text-slate-500 mb-8">File PowerPoint đã được tạo. Tất cả nội dung đã sẵn sàng để chỉnh sửa.</p>
                        <div className="flex flex-col gap-3">
                            <Button onClick={reset} variant="primary" className="w-full shadow-lg shadow-indigo-100">Tải tệp khác</Button>
                        </div>
                    </div>
                )}

            </div>
        </main>
        
        <footer className="py-8 text-center text-slate-400 text-xs flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
                <span>ScanToPPT AI Pro • OCR with AI Background Healing Technology</span>
                <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold">V2.7</span>
            </div>
            <div className="text-slate-500 font-medium">
                Thực hiện bởi <a href="https://www.facebook.com/lamtung2201/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 font-bold underline decoration-indigo-200 underline-offset-4">Tùng Tinh Tấn</a>
            </div>
        </footer>
    </div>
  );
};

export default App;
