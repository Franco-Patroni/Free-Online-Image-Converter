import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ACCEPTED_EXTENSIONS,
  analyzeFile,
  convertImage,
  extensionForFormat,
  stripExtension,
} from '../lib/imageEngine';
import { isPdf } from '../lib/pdfDetect';
import { runWithConcurrency } from '../lib/pool';
import type { ConvertSettings, OutputFormat, QueueItem, ResizeMode } from '../lib/types';
import { downloadAsZip } from '../lib/zipExport';

const CONCURRENCY = 3;
const DPI_PRESETS = [72, 150, 300, 600];

function newId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const defaultSettings: ConvertSettings = {
  format: 'png',
  quality: 0.9,
  dpi: 150,
  resize: {
    mode: 'none',
    width: 1920,
    height: 1080,
    percent: 50,
    maintainAspectRatio: true,
  },
};

export default function ConvertResize() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [settings, setSettings] = useState<ConvertSettings>(defaultSettings);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const doneCount = useMemo(() => queue.filter((i) => i.status === 'done').length, [queue]);
  const errorCount = useMemo(() => queue.filter((i) => i.status === 'error').length, [queue]);
  const processedCount = doneCount + errorCount;

  const patchItem = (id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const analyzeRasterItem = useCallback((id: string, file: File) => {
    analyzeFile(file)
      .then(({ width, height, thumbnailUrl }) => {
        patchItem(id, { sourceWidth: width, sourceHeight: height, previewUrl: thumbnailUrl });
      })
      .catch((err: unknown) => {
        patchItem(id, { status: 'error', error: errorMessage(err, 'Could not read file.') });
      });
  }, []);

  const analyzePdfPageItem = useCallback((id: string, file: File, pageNumber: number) => {
    import('../lib/pdfEngine')
      .then(({ analyzePdfPage }) => analyzePdfPage(file, pageNumber))
      .then(({ width, height, thumbnailUrl }) => {
        patchItem(id, { sourceWidth: width, sourceHeight: height, previewUrl: thumbnailUrl });
      })
      .catch((err: unknown) => {
        patchItem(id, { status: 'error', error: errorMessage(err, 'Could not render page.') });
      });
  }, []);

  const expandPdfItem = useCallback(
    (id: string, file: File) => {
      import('../lib/pdfEngine')
        .then(({ getPdfPageCount }) => getPdfPageCount(file))
        .then((pageCount) => {
          const pageItems: QueueItem[] = Array.from({ length: pageCount }, (_, i) => ({
            id: newId(),
            file,
            pdfPage: { pageNumber: i + 1, pageCount },
            status: 'queued' as const,
          }));
          setQueue((prev) => prev.flatMap((q) => (q.id === id ? pageItems : [q])));
          for (const pageItem of pageItems) {
            analyzePdfPageItem(pageItem.id, file, pageItem.pdfPage!.pageNumber);
          }
        })
        .catch((err: unknown) => {
          patchItem(id, { status: 'error', error: errorMessage(err, 'Could not read PDF.') });
        });
    },
    [analyzePdfPageItem],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const accepted = Array.from(files).filter((f) => hasAcceptedExtension(f.name));
      if (!accepted.length) return;

      const items: QueueItem[] = accepted.map((file) => ({
        id: newId(),
        file,
        status: 'queued',
      }));
      setQueue((prev) => [...prev, ...items]);

      for (const item of items) {
        if (isPdf(item.file)) {
          expandPdfItem(item.id, item.file);
        } else {
          analyzeRasterItem(item.id, item.file);
        }
      }
    },
    [analyzeRasterItem, expandPdfItem],
  );

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const removeItem = (id: string) => {
    setQueue((prev) => prev.filter((i) => i.id !== id));
  };

  const clearAll = () => {
    setQueue([]);
  };

  const updateResize = <K extends keyof ConvertSettings['resize']>(
    key: K,
    value: ConvertSettings['resize'][K],
  ) => {
    setSettings((s) => ({ ...s, resize: { ...s.resize, [key]: value } }));
  };

  const processAll = async () => {
    const targets = queue.filter((i) => i.status === 'queued' || i.status === 'error');
    if (!targets.length) return;
    setIsProcessing(true);

    setQueue((prev) =>
      prev.map((q) => (targets.some((t) => t.id === q.id) ? { ...q, status: 'processing', error: undefined } : q)),
    );

    await runWithConcurrency(targets, CONCURRENCY, async (item) => {
      try {
        const result = item.pdfPage
          ? await (await import('../lib/pdfEngine')).convertPdfPage(
              item.file,
              item.pdfPage.pageNumber,
              item.pdfPage.pageCount,
              settings,
            )
          : await convertImage(item.file, settings);
        patchItem(item.id, {
          status: 'done',
          outputBlob: result.blob,
          outputName: result.filename,
          outputWidth: result.width,
          outputHeight: result.height,
        });
      } catch (err) {
        patchItem(item.id, { status: 'error', error: errorMessage(err, 'Conversion failed.') });
      }
    });

    setIsProcessing(false);
  };

  const downloadZip = async () => {
    const entries = queue
      .filter((i): i is QueueItem & { outputBlob: Blob; outputName: string } =>
        i.status === 'done' && !!i.outputBlob && !!i.outputName,
      )
      .map((i) => ({ name: i.outputName, blob: i.outputBlob }));
    if (!entries.length) return;
    await downloadAsZip(entries, 'converted-images.zip');
  };

  const downloadSingle = (item: QueueItem) => {
    if (!item.outputBlob || !item.outputName) return;
    const url = URL.createObjectURL(item.outputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.outputName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const expectedOutputName = (item: QueueItem) => {
    const suffix = item.pdfPage && item.pdfPage.pageCount > 1 ? `-page-${item.pdfPage.pageNumber}` : '';
    return `${stripExtension(item.file.name)}${suffix}.${extensionForFormat(settings.format)}`;
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
      <Link to="/" className="text-sm text-violet-600 hover:underline">
        ← Back to hub
      </Link>
      <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
        Batch Convert &amp; Resize
      </h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400 max-w-2xl">
        Drop in TIFF, PDF, PNG, JPG, WEBP, BMP, GIF or AVIF files. Set the output format, DPI and
        size once, convert the whole batch, and download it all as a ZIP. Nothing leaves your
        browser.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
              isDragging
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                : 'border-neutral-300 dark:border-neutral-700 hover:border-violet-400'
            }`}
          >
            <p className="font-medium">Drag &amp; drop images or PDFs here, or click to browse</p>
            <p className="mt-1 text-sm text-neutral-500">
              Supports {ACCEPTED_EXTENSIONS.join(', ')}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.join(',')}
              onChange={onFileInputChange}
              className="hidden"
            />
          </div>

          {/* Queue */}
          {queue.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">
                  {queue.length} file{queue.length === 1 ? '' : 's'}
                  {processedCount > 0 && (
                    <span className="text-neutral-500 font-normal">
                      {' '}
                      · {doneCount} converted{errorCount ? `, ${errorCount} failed` : ''}
                    </span>
                  )}
                </h2>
                <button
                  onClick={clearAll}
                  className="text-sm text-neutral-500 hover:text-red-600"
                  disabled={isProcessing}
                >
                  Clear all
                </button>
              </div>

              <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-800">
                {queue.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 p-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                      {item.previewUrl ? (
                        <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs text-neutral-400">…</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.file.name}
                        {item.pdfPage && item.pdfPage.pageCount > 1 && (
                          <span className="font-normal text-neutral-400">
                            {' '}
                            — page {item.pdfPage.pageNumber} of {item.pdfPage.pageCount}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {!item.pdfPage && formatBytes(item.file.size)}
                        {item.sourceWidth && ` · ${item.sourceWidth}×${item.sourceHeight}`}
                        {item.status === 'done' &&
                          item.outputWidth &&
                          ` → ${expectedOutputName(item)} (${item.outputWidth}×${item.outputHeight}, ${formatBytes(
                            item.outputBlob?.size ?? 0,
                          )})`}
                        {item.status === 'error' && (
                          <span className="text-red-600"> · {item.error}</span>
                        )}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                    {item.status === 'done' && (
                      <button
                        onClick={() => downloadSingle(item)}
                        className="text-sm text-violet-600 hover:underline"
                      >
                        Download
                      </button>
                    )}
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-neutral-400 hover:text-red-600"
                      aria-label="Remove"
                      disabled={isProcessing}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 h-fit sticky top-4">
          <h2 className="font-medium">Output settings</h2>

          <label className="mt-4 block text-sm font-medium">Format</label>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {(['png', 'jpeg', 'webp'] as OutputFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setSettings((s) => ({ ...s, format: f }))}
                className={`rounded-lg border px-2 py-1.5 text-sm uppercase ${
                  settings.format === f
                    ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
                    : 'border-neutral-200 dark:border-neutral-700'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {settings.format !== 'png' && (
            <div className="mt-4">
              <label className="flex items-center justify-between text-sm font-medium">
                Quality
                <span className="text-neutral-500">{Math.round(settings.quality * 100)}%</span>
              </label>
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round(settings.quality * 100)}
                onChange={(e) => setSettings((s) => ({ ...s, quality: Number(e.target.value) / 100 }))}
                className="mt-1.5 w-full"
              />
            </div>
          )}

          <label className="mt-5 block text-sm font-medium">DPI</label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              min={36}
              max={1200}
              value={settings.dpi}
              onChange={(e) => setSettings((s) => ({ ...s, dpi: Math.max(1, Number(e.target.value)) }))}
              className="w-20 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
            />
            <div className="flex flex-wrap gap-1.5">
              {DPI_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setSettings((s) => ({ ...s, dpi: preset }))}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    settings.dpi === preset
                      ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-500'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">
            Sets the render resolution for PDF pages. For image files it's written as metadata
            only — pixel size still comes from Resize below.
          </p>

          <label className="mt-5 block text-sm font-medium">Resize</label>
          <select
            value={settings.resize.mode}
            onChange={(e) => updateResize('mode', e.target.value as ResizeMode)}
            className="mt-1.5 w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="none">Keep original size</option>
            <option value="max">Fit within max dimensions</option>
            <option value="exact">Exact size</option>
            <option value="percent">Scale by percentage</option>
          </select>

          {(settings.resize.mode === 'max' || settings.resize.mode === 'exact') && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-neutral-500">Width (px)</label>
                <input
                  type="number"
                  min={1}
                  value={settings.resize.width}
                  onChange={(e) => updateResize('width', Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Height (px)</label>
                <input
                  type="number"
                  min={1}
                  value={settings.resize.height}
                  onChange={(e) => updateResize('height', Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          )}

          {settings.resize.mode === 'exact' && (
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.resize.maintainAspectRatio}
                onChange={(e) => updateResize('maintainAspectRatio', e.target.checked)}
              />
              Maintain aspect ratio (fit within box)
            </label>
          )}

          {settings.resize.mode === 'percent' && (
            <div className="mt-2">
              <label className="text-xs text-neutral-500">Scale (%)</label>
              <input
                type="number"
                min={1}
                max={500}
                value={settings.resize.percent}
                onChange={(e) => updateResize('percent', Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
              />
            </div>
          )}

          <button
            onClick={processAll}
            disabled={isProcessing || !queue.some((i) => i.status === 'queued' || i.status === 'error')}
            className="mt-6 w-full rounded-lg bg-violet-600 px-4 py-2.5 font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isProcessing ? `Converting… ${processedCount}/${queue.length}` : 'Convert all'}
          </button>

          <button
            onClick={downloadZip}
            disabled={doneCount === 0}
            className="mt-2 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2.5 font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Download all as ZIP ({doneCount})
          </button>

          <p className="mt-3 text-xs text-neutral-500">
            Multi-page TIFFs use only the first page. Multi-page PDFs convert every page into its
            own image. Large batches may take a moment — everything runs on your device.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: QueueItem['status'] }) {
  const styles: Record<QueueItem['status'], string> = {
    queued: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
    processing: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  };
  const labels: Record<QueueItem['status'], string> = {
    queued: 'Queued',
    processing: 'Working…',
    done: 'Done',
    error: 'Error',
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
