import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface ZipEntry {
  name: string;
  blob: Blob;
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  let i = 2;
  let candidate = `${base} (${i})${ext}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${base} (${i})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

export async function downloadAsZip(entries: ZipEntry[], zipFilename: string): Promise<void> {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const entry of entries) {
    zip.file(uniqueName(entry.name, used), entry.blob);
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  saveAs(blob, zipFilename);
}
