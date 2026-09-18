# Image Hub

A free, browser-based hub for batch image work — no uploads to a server, no accounts, no
credits. Everything runs locally using the Canvas API, so your images never leave your machine.

## Tools

- **Batch Convert & Resize** (live) — convert TIFF, PDF, PNG, JPG, WEBP, BMP, GIF, and AVIF files
  in bulk, set DPI and quality, resize them all with one set of settings, and download everything
  as a single ZIP. Purpose-built for workflows like converting a folder of TIF exports to
  PNG/JPEG and resizing them in one pass.
- More tools (compress, rename, crop, …) are planned — see `src/lib/tools.ts`.

## Why client-side?

Every conversion happens in your browser via `<canvas>`, the [UTIF.js](https://github.com/photopea/UTIF.js)
TIFF decoder, and [pdf.js](https://mozilla.github.io/pdf.js/) for PDFs. Nothing is uploaded
anywhere, so it's safe for confidential/company images, there's no file-size limit imposed by a
server, and there's nothing to pay for or rate-limit.

Notes:
- Multi-page TIFFs are converted using only their first page.
- Multi-page PDFs convert **every page** into its own image (`name-page-1.png`, `name-page-2.png`, …).
- **DPI** controls the actual rendered pixel resolution for PDF pages (higher DPI = larger,
  sharper output). For existing raster images it's written as metadata only (a `pHYs` chunk for
  PNG, a JFIF density header for JPEG) — pixel dimensions for those come from the Resize setting.
  WEBP has no widely-supported DPI tag, so it's skipped there.

## Local development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
npm run lint     # oxlint
```

## Deploying to GitHub Pages

A workflow at `.github/workflows/deploy.yml` builds and deploys `dist/` to GitHub Pages on every
push to `main`. To enable it:

1. In the repo settings, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push/merge to `main` — the site will be published at
   `https://<your-username>.github.io/Free-Online-Image-Converter/`.

The Vite `base` in `vite.config.ts` is set to `/Free-Online-Image-Converter/` to match this repo
name. If you rename the repo or deploy elsewhere, update `base` accordingly.

## Adding a new tool to the hub

1. Add an entry to `tools` in `src/lib/tools.ts` (set `status: 'live'` once it's built).
2. Create a page component under `src/pages/` and wire it up as a route in `src/App.tsx`.
3. Reuse `src/lib/imageEngine.ts`, `src/lib/pool.ts`, and `src/lib/zipExport.ts` for
   decode/resize/encode, concurrency, and ZIP export where relevant.
