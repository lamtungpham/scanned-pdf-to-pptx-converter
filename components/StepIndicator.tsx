import React from 'react';
import { UploadCloud, FileText, CheckCircle, Loader2 } from 'lucide-react';
import { ProcessingState } from '../types';

interface StepIndicatorProps {
  currentStep: ProcessingState;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  
  const steps = [
    { id: 'upload', label: 'Upload PDF', icon: UploadCloud, activeStates: [ProcessingState.IDLE] },
    { id: 'process', label: 'OCR & Analyze', icon: Loader2, activeStates: [ProcessingState.READING_PDF, ProcessingState.ANALYZING_PAGES, ProcessingState.GENERATING_PPTX] },
    { id: 'finish', label: 'Download', icon: CheckCircle, activeStates: [ProcessingState.COMPLETED] }
  ];

  const getStepStatus = (stepId: string) => {
    // Logic to determine if step is waiting, current, or done
    if (currentStep === ProcessingState.ERROR) return 'error';

    if (stepId === 'upload') {
        if (currentStep === ProcessingState.IDLE) return 'current';
        return 'completed';
    }
    if (stepId === 'process') {
        if (currentStep === ProcessingState.IDLE) return 'waiting';
        if ([ProcessingState.COMPLETED].includes(currentStep)) return 'completed';
        return 'current';
    }
    if (stepId === 'finish') {
        if (currentStep === ProcessingState.COMPLETED) return 'completed';
        return 'waiting';
    }
    return 'waiting';
  };

  return (
    <div className="flex items-center justify-center w-full mb-12">
      {steps.map((step, index) => {
        const status = getStepStatus(step.id);
        const isLast = index === steps.length - 1;
        
        let colorClass = "text-slate-400 border-slate-300";
        if (status === 'completed') colorClass = "text-green-600 border-green-600 bg-green-50";
        if (status === 'current') colorClass = "text-indigo-600 border-indigo-600 bg-indigo-50";

        const Icon = step.icon;

        return (
            <div key={step.id} className="flex items-center">
                <div className={`flex flex-col items-center relative z-10`}>
                    <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${colorClass}`}>
                        <Icon className={`w-6 h-6 ${status === 'current' && step.id === 'process' ? 'animate-spin' : ''}`} />
                    </div>
                    <span className={`mt-2 text-xs font-semibold uppercase tracking-wider ${status === 'current' ? 'text-indigo-600' : status === 'completed' ? 'text-green-600' : 'text-slate-400'}`}>
                        {step.label}
                    </span>
                </div>
                {!isLast && (
                    <div className={`w-24 h-1 mx-2 transition-all duration-500 ${status === 'completed' ? 'bg-green-600' : 'bg-slate-200'}`} />
                )}
            </div>
        );
      })}
    </div>
  );
};

export default StepIndicator;