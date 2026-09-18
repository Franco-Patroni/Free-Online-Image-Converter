import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { canvasToBlob, computeTargetSize, resizeCanvas, extensionForFormat, mimeForFormat, stripExtension } from './imageEngine';
import { injectDpi } from './dpiMetadata';
import type { ConvertSettings } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/** Points-per-inch used by the PDF coordinate system. */
const PDF_BASE_DPI = 72;

export async function getPdfPageCount(file: File): Promise<number> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const doc = await loadingTask.promise;
  const count = doc.numPages;
  await loadingTask.destroy();
  return count;
}

async function renderPage(
  file: File,
  pageNumber: number,
  dpi: number,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  try {
    const doc = await loadingTask.promise;
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: dpi / PDF_BASE_DPI });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { canvas, width: canvas.width, height: canvas.height };
  } finally {
    await loadingTask.destroy();
  }
}

export interface PdfPageAnalysis {
  width: number;
  height: number;
  thumbnailUrl: string;
}

const THUMBNAIL_DPI = 36;

/** Renders a low-resolution preview of one PDF page for the queue thumbnail. */
export async function analyzePdfPage(file: File, pageNumber: number): Promise<PdfPageAnalysis> {
  const { canvas, width, height } = await renderPage(file, pageNumber, THUMBNAIL_DPI);
  return { width, height, thumbnailUrl: canvas.toDataURL('image/png') };
}

export interface PdfConvertResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
}

/** Renders one PDF page at the settings' DPI, resizes/encodes it, and stamps DPI metadata onto the result. */
export async function convertPdfPage(
  file: File,
  pageNumber: number,
  pageCount: number,
  settings: ConvertSettings,
): Promise<PdfConvertResult> {
  const rendered = await renderPage(file, pageNumber, settings.dpi);
  const target = computeTargetSize(rendered.width, rendered.height, settings.resize);
  const finalCanvas = resizeCanvas(rendered.canvas, target.width, target.height);
  const encoded = await canvasToBlob(finalCanvas, settings.format, settings.quality);
  const blob = await injectDpi(encoded, settings.dpi, mimeForFormat(settings.format));
  const suffix = pageCount > 1 ? `-page-${pageNumber}` : '';
  const filename = `${stripExtension(file.name)}${suffix}.${extensionForFormat(settings.format)}`;
  return { blob, filename, width: target.width, height: target.height };
}
