export type OutputFormat = 'png' | 'jpeg' | 'webp';

export type ResizeMode = 'none' | 'exact' | 'max' | 'percent';

export interface ResizeSettings {
  mode: ResizeMode;
  width: number;
  height: number;
  percent: number;
  maintainAspectRatio: boolean;
}

export interface ConvertSettings {
  format: OutputFormat;
  quality: number;
  /** For PDF pages, the DPI to render at (controls pixel resolution). For raster sources, written as metadata only. */
  dpi: number;
  resize: ResizeSettings;
}

export type QueueItemStatus = 'queued' | 'processing' | 'done' | 'error';

export interface QueueItem {
  id: string;
  file: File;
  /** Set when this item is one page of a multi-page PDF; the queue can hold several items for the same file. */
  pdfPage?: { pageNumber: number; pageCount: number };
  status: QueueItemStatus;
  error?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  outputBlob?: Blob;
  outputName?: string;
  outputWidth?: number;
  outputHeight?: number;
  previewUrl?: string;
}
