import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import exifr from 'exifr';
import heicDecode from 'heic-decode';
import { UPLOADS_DIR } from '../config';
import { EMPTY_METADATA, validCoords, type ImageFormat, type MediaMetadata } from './media';

// Formats every browser can show directly; the rest get a JPEG copy for display
const BROWSER_FORMATS: ImageFormat[] = ['jpg', 'png', 'gif', 'webp', 'avif'];

// ─── Metadata ─────────────────────────────────────────────────────────────────
// "2019:10:20 18:34:30" → "2019-10-20T18:34:30"
function exifDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m || m[1] === '0000') return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

export async function readImageMetadata(buffer: Buffer): Promise<MediaMetadata> {
  try {
    // reviveValues: false keeps dates as the camera wrote them (local time);
    // exifr still adds decimal latitude/longitude when gps is on.
    const tags = await exifr.parse(buffer, {
      tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false,
      reviveValues: false,
    });
    if (!tags) return EMPTY_METADATA;
    const coords = validCoords(tags.latitude, tags.longitude);
    const camera = [tags.Make, tags.Model].filter((v) => typeof v === 'string' && v.trim()).join(' ').trim();
    return {
      taken_at: exifDate(tags.DateTimeOriginal) ?? exifDate(tags.CreateDate) ?? exifDate(tags.ModifyDate),
      taken_offset: typeof tags.OffsetTimeOriginal === 'string' ? tags.OffsetTimeOriginal
        : typeof tags.OffsetTime === 'string' ? tags.OffsetTime : null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      camera: camera || null,
    };
  } catch {
    return EMPTY_METADATA; // unreadable EXIF is not an error, the photo is still fine
  }
}

// ─── Processing ───────────────────────────────────────────────────────────────
export interface ProcessedImage extends MediaMetadata {
  filename: string;                  // what browsers display (the original if they can)
  original_filename: string | null;  // the untouched upload, when it isn't `filename`
  thumb_filename: string;
  width: number | null;
  height: number | null;
}

const THUMB_SIZE = 480;
// Largest image we decode (iPhones shoot 12–48 MP)
const MAX_PIXELS = 100_000_000;

async function decodeToJpeg(buffer: Buffer, format: ImageFormat): Promise<Buffer> {
  if (format === 'heic') {
    // sharp's bundled libvips can't decode HEVC, so decode with libheif (wasm).
    // That bypasses sharp's pixel limit, so check the size from the header first
    // (a tiny file can claim a huge image and exhaust memory when decoded).
    const header = await sharp(buffer).metadata();
    if (!header.width || !header.height || header.width * header.height > MAX_PIXELS) {
      throw new Error(`HEIC image too large or unreadable (${header.width}x${header.height})`);
    }
    const { width, height, data } = await heicDecode({ buffer });
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  }
  return sharp(buffer).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

/**
 * Takes an uploaded file (already in UPLOADS_DIR, named "<uuid>.<ext>") and
 * produces what the app needs: metadata, a browser-friendly copy if the
 * format needs one, and a thumbnail. The original file is never modified.
 */
export async function processImage(storedName: string, format: ImageFormat): Promise<ProcessedImage> {
  const originalPath = path.join(UPLOADS_DIR, storedName);
  const original = await fs.promises.readFile(originalPath);
  const base = path.parse(storedName).name;
  const metadata = await readImageMetadata(original);

  let filename = storedName;
  let originalFilename: string | null = null;
  let display: Buffer = original;
  if (!BROWSER_FORMATS.includes(format)) {
    display = await decodeToJpeg(original, format);
    filename = `${base}.jpg`;
    originalFilename = storedName;
    await fs.promises.writeFile(path.join(UPLOADS_DIR, filename), display);
  }

  // .rotate() applies the EXIF orientation, like browsers do for the full image
  const image = sharp(display, { animated: false }).rotate();
  const thumbFilename = `${base}.thumb.webp`;
  const thumb = await image.clone()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer({ resolveWithObject: true });
  await fs.promises.writeFile(path.join(UPLOADS_DIR, thumbFilename), thumb.data);

  const meta = await sharp(display).metadata();
  const rotated = (meta.orientation ?? 1) >= 5;
  return {
    ...metadata,
    filename,
    original_filename: originalFilename,
    thumb_filename: thumbFilename,
    width: (rotated ? meta.height : meta.width) ?? null,
    height: (rotated ? meta.width : meta.height) ?? null,
  };
}
