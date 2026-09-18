import * as UTIF from 'utif2';
import type { ConvertSettings, OutputFormat, ResizeSettings } from './types';
import { injectDpi } from './dpiMetadata';
import { PDF_EXTENSION } from './pdfDetect';

const TIFF_EXTENSIONS = ['.tif', '.tiff'];

export const ACCEPTED_EXTENSIONS = [
  '.tif',
  '.tiff',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.gif',
  '.avif',
  PDF_EXTENSION,
];

export function isTiff(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    TIFF_EXTENSIONS.some((ext) => name.endsWith(ext)) ||
    file.type === 'image/tiff'
  );
}

export function stripExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? filename : filename.slice(0, idx);
}

export function extensionForFormat(format: OutputFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

export function mimeForFormat(format: OutputFormat): string {
  return `image/${format}`;
}

interface DecodedImage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

async function decodeTiff(file: File): Promise<DecodedImage> {
  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) {
    throw new Error('No image data found in TIFF file.');
  }
  const ifd = ifds[0];
  UTIF.decodeImage(buffer, ifd);
  const rgba = UTIF.toRGBA8(ifd);
  const { width, height } = ifd;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(imageData, 0, 0);

  return { canvas, width, height };
}

async function decodeStandardImage(file: File): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { canvas, width: canvas.width, height: canvas.height };
}

export async function decodeImage(file: File): Promise<DecodedImage> {
  return isTiff(file) ? decodeTiff(file) : decodeStandardImage(file);
}

export function computeTargetSize(
  sourceWidth: number,
  sourceHeight: number,
  resize: ResizeSettings,
): { width: number; height: number } {
  const { mode, width, height, percent, maintainAspectRatio } = resize;

  if (mode === 'none') {
    return { width: sourceWidth, height: sourceHeight };
  }

  if (mode === 'percent') {
    const scale = Math.max(percent, 1) / 100;
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale)),
    };
  }

  const targetW = Math.max(1, Math.round(width || sourceWidth));
  const targetH = Math.max(1, Math.round(height || sourceHeight));

  if (mode === 'exact' && !maintainAspectRatio) {
    return { width: targetW, height: targetH };
  }

  // 'max' mode, or 'exact' with aspect ratio lock: fit within the box.
  const scale = Math.min(targetW / sourceWidth, targetH / sourceHeight);
  const boundedScale = mode === 'max' ? Math.min(scale, 1) : scale;
  return {
    width: Math.max(1, Math.round(sourceWidth * boundedScale)),
    height: Math.max(1, Math.round(sourceHeight * boundedScale)),
  };
}

export function resizeCanvas(
  source: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement {
  if (targetWidth === source.width && targetHeight === source.height) {
    return source;
  }
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, targetWidth, targetHeight);
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode image.'));
      },
      mimeForFormat(format),
      format === 'png' ? undefined : quality,
    );
  });
}

export interface ConvertResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
}

export async function convertImage(
  file: File,
  settings: ConvertSettings,
): Promise<ConvertResult> {
  const decoded = await decodeImage(file);
  const target = computeTargetSize(decoded.width, decoded.height, settings.resize);
  const finalCanvas = resizeCanvas(decoded.canvas, target.width, target.height);
  const encoded = await canvasToBlob(finalCanvas, settings.format, settings.quality);
  const blob = await injectDpi(encoded, settings.dpi, mimeForFormat(settings.format));
  const filename = `${stripExtension(file.name)}.${extensionForFormat(settings.format)}`;
  return { blob, filename, width: target.width, height: target.height };
}

async function tiffDimensions(file: File): Promise<{ width: number; height: number }> {
  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) throw new Error('No image data found in TIFF file.');
  const { width, height } = ifds[0];
  return { width, height };
}

async function standardImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}

/** Reads dimensions without decoding full pixel data where possible (cheap for TIFF headers). */
export async function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return isTiff(file) ? tiffDimensions(file) : standardImageDimensions(file);
}

const THUMBNAIL_MAX_SIZE = 160;

export interface FileAnalysis {
  width: number;
  height: number;
  thumbnailUrl: string;
}

/** Decodes the file once to get its dimensions and a small preview thumbnail. */
export async function analyzeFile(file: File): Promise<FileAnalysis> {
  const decoded = await decodeImage(file);
  const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(decoded.width, decoded.height));
  const thumbW = Math.max(1, Math.round(decoded.width * scale));
  const thumbH = Math.max(1, Math.round(decoded.height * scale));
  const thumbCanvas = resizeCanvas(decoded.canvas, thumbW, thumbH);
  const thumbnailUrl = thumbCanvas.toDataURL('image/png');
  return { width: decoded.width, height: decoded.height, thumbnailUrl };
}
