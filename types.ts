
export enum ProcessingState {
  IDLE = 'IDLE',
  READING_PDF = 'READING_PDF',
  ANALYZING_PAGES = 'ANALYZING_PAGES',
  GENERATING_PPTX = 'GENERATING_PPTX',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export type ModelMode = 'pro' | 'flash';

export type Box2D = [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000

export interface SlideElement {
  content: string;
  box_2d: Box2D;
  textColor?: string; // Hex code
  fontStyle?: {
    isBold?: boolean;
    alignment?: 'left' | 'center' | 'right';
  };
}

export interface SlideData {
  id: number;
  backgroundImage: string; // Base64 of the full original page
  elements: SlideElement[];
}

export interface ProcessingProgress {
  current: number;
  total: number;
  message: string;
}
