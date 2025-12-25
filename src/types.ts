
export interface ImageData {
  id: string;
  file: File;
  previewUrl: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  progress: number;
  result?: {
    processedUrl: string;
    width: number;
    height: number;
    size: string;
    title: string;
    keywords: string[];
    svgContent?: string;
    svgColorsList?: string[];
    format?: string; // 가공된 시점의 포맷 저장
  };
}

export interface ProcessingOptions {
  bgRemove: boolean;
  autoCrop: boolean;
  format: 'original' | 'png' | 'svg' | 'gif';
  svgColors: number;
  resizeWidth: number;
  noiseLevel: number;
  gifMotion: string; // GIF 동작 설명 필드 추가
}

export interface GeminiAnalysisResponse {
  files: {
    id: string;
    keywords: string[];
    title: string;
  }[];
  commonKeywords: string[];
}
