/** Lightweight PDF detection, kept free of the pdfjs-dist dependency so it doesn't force-load the PDF engine bundle. */

export const PDF_EXTENSION = '.pdf';

export function isPdf(file: File): boolean {
  return file.name.toLowerCase().endsWith(PDF_EXTENSION) || file.type === 'application/pdf';
}
