/** Writes DPI metadata into PNG/JPEG bytes without touching pixel data. WEBP has no widely-supported DPI tag, so it's left untouched. */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE_LENGTH = 8;

async function injectPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const pixelsPerMeter = Math.round(dpi * 39.3701); // 1 inch = 0.0254 m

  // pHYs chunk: 4-byte length(9) + "pHYs" + 9 data bytes + 4-byte CRC
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, pixelsPerMeter); // x pixels per unit
  view.setUint32(12, pixelsPerMeter); // y pixels per unit
  chunk[16] = 1; // unit specifier: 1 = meters
  const crc = crc32(chunk.subarray(4, 17));
  view.setUint32(17, crc);

  // The IHDR chunk is always first (8-byte length+type + 13-byte data + 4-byte CRC = 25 bytes) right after the signature.
  const ihdrEnd = PNG_SIGNATURE_LENGTH + 8 + 13 + 4;
  const result = new Uint8Array(buffer.length + chunk.length);
  result.set(buffer.subarray(0, ihdrEnd), 0);
  result.set(chunk, ihdrEnd);
  result.set(buffer.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return new Blob([result], { type: 'image/png' });
}

async function injectJpegDpi(blob: Blob, dpi: number): Promise<Blob> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  // Canvas-encoded JPEGs start with SOI (FFD8) followed immediately by an APP0 JFIF segment (FFE0).
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff || buffer[3] !== 0xe0) {
    return blob; // Not the expected structure; leave untouched rather than risk corrupting it.
  }
  const result = buffer.slice();
  const view = new DataView(result.buffer);
  // Layout after FFD8 FFE0: 2-byte segment length, then "JFIF\0" + version(2) + units(1) + Xdensity(2) + Ydensity(2) + thumbnail...
  const identifierOffset = 6;
  const identifier = String.fromCharCode(...result.subarray(identifierOffset, identifierOffset + 5));
  if (identifier !== 'JFIF\0') {
    return blob;
  }
  const unitsOffset = identifierOffset + 5 + 2; // skip identifier + version
  view.setUint8(unitsOffset, 1); // 1 = dots per inch
  view.setUint16(unitsOffset + 1, dpi);
  view.setUint16(unitsOffset + 3, dpi);
  return new Blob([result], { type: 'image/jpeg' });
}

export async function injectDpi(blob: Blob, dpi: number, mimeType: string): Promise<Blob> {
  if (mimeType === 'image/png') return injectPngDpi(blob, dpi);
  if (mimeType === 'image/jpeg') return injectJpegDpi(blob, dpi);
  return blob;
}
