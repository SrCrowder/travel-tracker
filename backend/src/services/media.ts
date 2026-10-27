import fs from 'fs';

// ─── Format detection from the file's bytes ───────────────────────────────────
// Never trust the name or the Content-Type the browser sent: iPhones often
// send HEIC/MOV as octet-stream, and a renamed HTML file must not get in.

export type ImageFormat = 'jpg' | 'png' | 'gif' | 'webp' | 'avif' | 'heic' | 'tiff';
export type VideoFormat = 'mov' | 'mp4' | 'webm';
export type MediaFormat = ImageFormat | VideoFormat;
export type MediaKind = 'image' | 'video';

export interface DetectedMedia {
  format: MediaFormat;
  kind: MediaKind;
}

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'];
const AVIF_BRANDS = ['avif', 'avis'];
// ISO-BMFF video brands (MP4, M4V, 3GP…). QuickTime uses "qt  ".
const VIDEO_BRANDS = ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'M4VH',
  'M4VP', 'dash', 'mmp4', '3gp4', '3gp5', '3gp6', '3g2a', 'MSNV', 'f4v '];

export function detectMedia(header: Buffer): DetectedMedia | null {
  if (header.length < 12) return null;
  const ascii = (from: number, to: number) => header.toString('ascii', from, to);

  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return { format: 'jpg', kind: 'image' };
  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { format: 'png', kind: 'image' };
  if (ascii(0, 4) === 'GIF8') return { format: 'gif', kind: 'image' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { format: 'webp', kind: 'image' };
  const magic = header.toString('hex', 0, 4);
  if (magic === '49492a00' || magic === '4d4d002a') return { format: 'tiff', kind: 'image' };
  if (magic === '1a45dfa3') return { format: 'webm', kind: 'video' }; // EBML (WebM/Matroska)

  // ISO-BMFF / QuickTime: decide from the "ftyp" brands
  if (ascii(4, 8) === 'ftyp') {
    const boxSize = Math.min(header.readUInt32BE(0), header.length);
    const brands: string[] = [ascii(8, 12)];
    for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(ascii(i, i + 4));
    if (AVIF_BRANDS.includes(brands[0])) return { format: 'avif', kind: 'image' };
    if (brands.some((b) => HEIC_BRANDS.includes(b))) return { format: 'heic', kind: 'image' };
    if (brands.some((b) => AVIF_BRANDS.includes(b))) return { format: 'avif', kind: 'image' };
    if (brands[0] === 'qt  ') return { format: 'mov', kind: 'video' };
    if (brands.some((b) => VIDEO_BRANDS.includes(b))) return { format: 'mp4', kind: 'video' };
    if (brands.some((b) => b === 'mif1' || b === 'msf1')) return { format: 'heic', kind: 'image' }; // generic HEIF
  }
  // Old QuickTime files may start with another atom ("wide", "mdat", "moov")
  if (['wide', 'mdat', 'moov', 'free', 'skip'].includes(ascii(4, 8))) return { format: 'mov', kind: 'video' };
  return null;
}

export function readHeader(file: string, bytes = 64): Buffer {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

/** Common shape of what we learn from a photo or video's metadata. */
export interface MediaMetadata {
  taken_at: string | null;      // local wall-clock time, "YYYY-MM-DDTHH:MM:SS"
  taken_offset: string | null;  // UTC offset when it was recorded, "+02:00"
  lat: number | null;
  lng: number | null;
  camera: string | null;
}

export const EMPTY_METADATA: MediaMetadata = { taken_at: null, taken_offset: null, lat: null, lng: null, camera: null };

export function validCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}
