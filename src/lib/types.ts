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
  resize: ResizeSettings;
}

export type QueueItemStatus = 'queued' | 'processing' | 'done' | 'error';

export interface QueueItem {
  id: string;
  file: File;
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
