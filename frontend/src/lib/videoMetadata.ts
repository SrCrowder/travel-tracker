// Reads date and GPS from QuickTime / MP4 files (iPhone .mov) in the browser,
// without loading the whole video: only the box headers and the "moov" box
// (the index, usually a few hundred KB) are read.
//
// Where the data lives:
//   moov/meta (keys + ilst)  com.apple.quicktime.creationdate / location.ISO6709  (iPhone)
//   moov/udta/©xyz           "+38.0466+012.9944/"                                    (older files)
//   moov/mvhd                creation time, seconds since 1904, UTC                  (fallback)

export interface VideoMetadata {
  takenAt: string | null; // local wall-clock "YYYY-MM-DDTHH:MM:SS"
  lat: number | null;
  lng: number | null;
}

const EMPTY: VideoMetadata = { takenAt: null, lat: null, lng: null };
const MAX_MOOV = 32 * 1024 * 1024;
const CONTAINERS = new Set(['moov', 'udta', 'trak', 'mdia', 'minf', 'stbl']);

interface Box { type: string; start: number; end: number; header: number }

async function readBytes(file: Blob, start: number, length: number): Promise<DataView> {
  return new DataView(await file.slice(start, start + length).arrayBuffer());
}

const fourcc = (v: DataView, at: number) =>
  String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));

function boxAt(v: DataView, at: number, limit: number): Box | null {
  if (at + 8 > limit) return null;
  let size = v.getUint32(at);
  let header = 8;
  if (size === 1) {
    size = Number(v.getBigUint64(at + 8));
    header = 16;
  } else if (size === 0) {
    size = limit - at;
  }
  if (size < header || at + size > limit) return null;
  return { type: fourcc(v, at + 4), start: at, end: at + size, header };
}

/** Finds the top-level "moov" box by hopping over box headers (mdat can be GBs). */
async function findMoov(file: File): Promise<DataView | null> {
  let offset = 0;
  while (offset + 8 <= file.size) {
    const head = await readBytes(file, offset, 16);
    let size = head.getUint32(0);
    const type = fourcc(head, 4);
    if (size === 1) size = Number(head.getBigUint64(8));
    else if (size === 0) size = file.size - offset;
    if (size < 8) return null;
    if (type === 'moov') return size <= MAX_MOOV ? readBytes(file, offset, size) : null;
    offset += size;
  }
  return null;
}

function children(v: DataView, parent: Box): Box[] {
  const out: Box[] = [];
  let at = parent.start + parent.header;
  // "meta" is a full box (4 bytes version/flags) in MP4 but not in QuickTime
  if (parent.type === 'meta' && v.getUint32(at) === 0) at += 4;
  for (let box = boxAt(v, at, parent.end); box; box = boxAt(v, box.end, parent.end)) out.push(box);
  return out;
}

function text(v: DataView, from: number, to: number): string {
  return new TextDecoder().decode(new Uint8Array(v.buffer, v.byteOffset + from, Math.max(0, to - from)));
}

function parseIso6709(value: string | undefined) {
  const m = value?.match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

function parseLocalDate(value: string | undefined): string | null {
  const m = value?.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : null;
}

/** keys + ilst → { 'com.apple.quicktime.creationdate': '…', … } */
function readMetaItems(v: DataView, meta: Box): Record<string, string> {
  const kids = children(v, meta);
  const keysBox = kids.find((b) => b.type === 'keys');
  const ilst = kids.find((b) => b.type === 'ilst');
  if (!keysBox || !ilst) return {};

  const names: string[] = [];
  let at = keysBox.start + keysBox.header + 4; // version/flags
  const count = v.getUint32(at);
  at += 4;
  for (let i = 0; i < count && at + 8 <= keysBox.end; i++) {
    const size = v.getUint32(at);
    if (size < 8) break;
    names.push(text(v, at + 8, at + size));
    at += size;
  }

  const items: Record<string, string> = {};
  for (const item of children(v, ilst)) {
    const index = v.getUint32(item.start + 4); // the item's "type" is the 1-based key index
    const data = children(v, item).find((b) => b.type === 'data');
    if (!data || !names[index - 1]) continue;
    items[names[index - 1]] = text(v, data.start + data.header + 8, data.end); // skip type + locale
  }
  return items;
}

export async function readVideoMetadata(file: File): Promise<VideoMetadata> {
  try {
    const v = await findMoov(file);
    if (!v) return EMPTY;
    const moov: Box = { type: 'moov', start: 0, end: v.byteLength, header: 8 };

    let items: Record<string, string> = {};
    let xyz: string | undefined;
    let mvhdDate: string | null = null;

    const walk = (box: Box) => {
      for (const child of children(v, box)) {
        if (child.type === 'meta') items = { ...items, ...readMetaItems(v, child) };
        else if (child.type === '©xyz') xyz = text(v, child.start + child.header + 4, child.end);
        else if (child.type === 'mvhd') {
          const at = child.start + child.header;
          const seconds = v.getUint8(at) === 1 ? Number(v.getBigUint64(at + 4)) : v.getUint32(at + 4);
          if (seconds > 0) {
            const iso = new Date(Date.UTC(1904, 0, 1) + seconds * 1000).toISOString();
            mvhdDate = iso.slice(0, 19);
          }
        } else if (CONTAINERS.has(child.type)) walk(child);
      }
    };
    walk(moov);

    const coords = parseIso6709(items['com.apple.quicktime.location.ISO6709'] ?? xyz);
    return {
      takenAt: parseLocalDate(items['com.apple.quicktime.creationdate']) ?? mvhdDate,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    };
  } catch {
    return EMPTY;
  }
}
