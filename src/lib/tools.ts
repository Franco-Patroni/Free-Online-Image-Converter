export interface ToolDef {
  id: string;
  name: string;
  description: string;
  path: string;
  status: 'live' | 'soon';
}

export const tools: ToolDef[] = [
  {
    id: 'convert-resize',
    name: 'Batch Convert & Resize',
    description:
      'Convert TIFF, PNG, JPG, WEBP, BMP, GIF and more in bulk, resize them all at once, and download everything as a single ZIP. Runs entirely in your browser.',
    path: '/tools/convert-resize',
    status: 'live',
  },
  {
    id: 'compress',
    name: 'Batch Compress',
    description: 'Shrink file sizes across a whole batch with a quality slider.',
    path: '/tools/compress',
    status: 'soon',
  },
  {
    id: 'rename',
    name: 'Batch Rename',
    description: 'Rename exported files using patterns and numbering.',
    path: '/tools/rename',
    status: 'soon',
  },
  {
    id: 'crop',
    name: 'Batch Crop',
    description: 'Crop many images at once to a fixed aspect ratio or size.',
    path: '/tools/crop',
    status: 'soon',
  },
];
