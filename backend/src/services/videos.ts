import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import sharp from 'sharp';
import { FFMPEG_PATH, FFPROBE_PATH, FFMPEG_THREADS, UPLOADS_DIR } from '../config';
import { EMPTY_METADATA, validCoords, type MediaMetadata, type VideoFormat } from './media';

// ─── Running ffmpeg / ffprobe ─────────────────────────────────────────────────
interface RunOptions {
  /** Kill the process after this many ms */
  timeoutMs?: number;
  /** Lower CPU priority (conversions must not starve the web server) */
  background?: boolean;
}

function run(bin: string, args: string[], options: RunOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    if (options.background && child.pid) {
      try { os.setPriority(child.pid, 15); } catch { /* not permitted: run at normal priority */ }
    }
    const out: Buffer[] = [];
    let err = '';
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, options.timeoutMs)
      : null;
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-4000); });
    child.on('error', (e) => { if (timer) clearTimeout(timer); reject(e); });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (code === 0) return resolve(Buffer.concat(out));
      const reason = timedOut ? 'took too long and was stopped'
        : signal ? `was killed (${signal}${signal === 'SIGKILL' ? ', probably out of memory' : ''})`
          : `exited with ${code}: ${err.trim().split('\n').pop()}`;
      reject(new Error(`${path.basename(bin)} ${reason}`));
    });
  });
}

let ffmpegAvailable: boolean | null = null;
/** Whether ffmpeg/ffprobe can run here (videos are rejected otherwise). */
export async function videoSupport(): Promise<boolean> {
  if (ffmpegAvailable === null) {
    try {
      await run(FFPROBE_PATH, ['-version']);
      await run(FFMPEG_PATH, ['-version']);
      ffmpegAvailable = true;
    } catch {
      ffmpegAvailable = false;
    }
  }
  return ffmpegAvailable;
}

let tonemapAvailable: boolean | null = null;
async function canTonemap(): Promise<boolean> {
  if (tonemapAvailable === null) {
    try {
      const filters = (await run(FFMPEG_PATH, ['-hide_banner', '-filters'])).toString();
      tonemapAvailable = /\bzscale\b/.test(filters) && /\btonemap\b/.test(filters);
    } catch {
      tonemapAvailable = false;
    }
  }
  return tonemapAvailable;
}

// ─── Probing ──────────────────────────────────────────────────────────────────
interface ProbeStream {
  index: number;
  codec_type: string;
  codec_name?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  color_transfer?: string;
  tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number }>;
}

export interface VideoProbe {
  duration: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  pixFmt: string | null;
  /** HDR (HLG / PQ): needs tone mapping to look right as SDR */
  hdr: boolean;
  /** First audio stream we can decode (iPhones add an "apac" spatial track ffmpeg can't) */
  audio: { index: number; codec: string } | null;
  tags: Record<string, string>;
}

// Audio codecs ffmpeg decodes that phones/cameras use
const DECODABLE_AUDIO = ['aac', 'mp3', 'alac', 'ac3', 'eac3', 'opus', 'vorbis', 'flac', 'amr_nb', 'amr_wb'];

export async function probeVideo(file: string): Promise<VideoProbe> {
  const json = JSON.parse((await run(FFPROBE_PATH, [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
  ], { timeoutMs: 60_000 })).toString());
  const streams: ProbeStream[] = json.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  if (!video) throw new Error('No video stream');
  const audio = streams.find((s) => s.codec_type === 'audio' && s.codec_name
    && (DECODABLE_AUDIO.includes(s.codec_name) || s.codec_name.startsWith('pcm_')));

  // Phones store portrait videos as landscape + a rotation flag
  const rotation = Math.abs(Number(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation
    ?? video.tags?.rotate ?? 0)) % 180;
  const [width, height] = rotation === 90 ? [video.height, video.width] : [video.width, video.height];

  // Tag keys differ in case between containers; normalise to lower case
  const tags: Record<string, string> = {};
  for (const source of [video.tags, json.format?.tags]) {
    for (const [k, v] of Object.entries(source ?? {})) tags[k.toLowerCase()] = String(v);
  }

  const duration = Number(json.format?.duration);
  return {
    duration: Number.isFinite(duration) ? duration : null,
    width: width ?? null,
    height: height ?? null,
    videoCodec: video.codec_name ?? null,
    pixFmt: video.pix_fmt ?? null,
    hdr: ['arib-std-b67', 'smpte2084'].includes(video.color_transfer ?? ''),
    audio: audio ? { index: audio.index, codec: audio.codec_name! } : null,
    tags,
  };
}

// "+38.0466+012.9944+010.000/" (ISO 6709, as iPhones write it)
export function parseIso6709(value: string | undefined): { lat: number; lng: number } | null {
  const m = value?.match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
  return m ? validCoords(Number(m[1]), Number(m[2])) : null;
}

// "2019-10-20T18:40:00+0200" → local "2019-10-20T18:40:00" + "+02:00"
function parseLocalDate(value: string | undefined): { taken_at: string; taken_offset: string | null } | null {
  const m = value?.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?/);
  if (!m) return null;
  const offset = m[3] === 'Z' ? '+00:00' : m[3] ? `${m[3].slice(0, 3)}:${m[3].slice(-2)}` : null;
  return { taken_at: `${m[1]}T${m[2]}`, taken_offset: offset };
}

export function videoMetadata(probe: VideoProbe): MediaMetadata {
  const t = probe.tags;
  const coords = parseIso6709(t['com.apple.quicktime.location.iso6709'] ?? t['location'] ?? t['location-eng']);
  // Apple's creationdate keeps the local time; creation_time is UTC
  const date = parseLocalDate(t['com.apple.quicktime.creationdate']) ?? parseLocalDate(t['creation_time']);
  const camera = [t['com.apple.quicktime.make'] ?? t['make'], t['com.apple.quicktime.model'] ?? t['model']]
    .filter(Boolean).join(' ').trim();
  return {
    ...EMPTY_METADATA,
    taken_at: date?.taken_at ?? null,
    taken_offset: date?.taken_offset ?? null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    camera: camera || null,
  };
}

// ─── Filters ──────────────────────────────────────────────────────────────────
// HDR → SDR (BT.709) tone mapping, so iPhone HLG videos don't look washed out
const TONEMAP = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,'
  + 'zscale=t=bt709:m=bt709:r=tv';

async function colourFilters(probe: VideoProbe): Promise<string[]> {
  return probe.hdr && await canTonemap() ? [TONEMAP] : [];
}

// ─── Poster thumbnail ─────────────────────────────────────────────────────────
export async function createPoster(file: string, probe: VideoProbe, thumbPath: string): Promise<void> {
  const at = probe.duration && probe.duration > 2 ? 1 : 0;
  const vf = ['scale=960:960:force_original_aspect_ratio=decrease', ...(await colourFilters(probe)), 'format=rgb24'].join(',');
  const png = await run(FFMPEG_PATH, [
    '-v', 'error', '-threads', String(FFMPEG_THREADS), '-ss', String(at), '-i', file, '-frames:v', '1',
    '-vf', vf, '-f', 'image2pipe', '-vcodec', 'png', '-',
  ], { timeoutMs: 120_000, background: true });
  if (png.length === 0) throw new Error('Could not extract a frame');
  await sharp(png).resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toFile(thumbPath);
}

// ─── Making it playable in every browser ──────────────────────────────────────
// H.264 (8-bit 4:2:0) + AAC/MP3 in MP4 plays everywhere. iPhone MOVs are HEVC
// (and often 10-bit HDR), which most browsers can't play → re-encode.

export type PlaybackPlan = 'as-is' | 'remux' | 'transcode';

export function playbackPlan(format: VideoFormat, probe: VideoProbe): PlaybackPlan {
  const audioOk = !probe.audio || ['aac', 'mp3'].includes(probe.audio.codec);
  // Remuxing (no re-encode) also moves the index to the start for fast seeking
  if (probe.videoCodec === 'h264' && probe.pixFmt === 'yuv420p' && audioOk) return 'remux';
  if (format === 'webm' && ['vp8', 'vp9', 'av1'].includes(probe.videoCodec ?? '')) return 'as-is';
  return 'transcode';
}

export async function makePlayable(input: string, output: string, plan: PlaybackPlan, probe: VideoProbe): Promise<void> {
  const tmp = `${output}.part`;
  const head = (withAudio: boolean) => [
    '-v', 'error', '-y', '-threads', String(FFMPEG_THREADS), '-i', input, '-map', '0:v:0',
    ...(withAudio && probe.audio ? ['-map', `0:${probe.audio.index}`] : []),
    '-map_metadata', '-1',
  ];
  // Give long videos time: at least 30 min, or 20× their length
  const options = { timeoutMs: Math.max(30 * 60_000, (probe.duration ?? 0) * 20_000), background: true };

  const encode = async (withAudio: boolean) => {
    const vf = [
      // Longest side at most 1920 px, even dimensions
      "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'",
      ...(await colourFilters(probe)),
      'format=yuv420p',
    ].join(',');
    await run(FFMPEG_PATH, [
      ...head(withAudio),
      '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high',
      ...(withAudio && probe.audio ? ['-c:a', 'aac', '-b:a', '160k'] : ['-an']),
      '-movflags', '+faststart', '-f', 'mp4', tmp,
    ], options);
  };

  try {
    if (plan === 'remux') {
      await run(FFMPEG_PATH, [...head(true), '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', tmp], options);
    } else {
      try {
        await encode(true);
      } catch (err) {
        // A broken or exotic audio track shouldn't cost the whole video
        if (!probe.audio) throw err;
        await encode(false);
      }
    }
    await fs.promises.rename(tmp, output);
  } finally {
    await fs.promises.rm(tmp, { force: true });
  }
}

export function uploadPath(filename: string): string {
  // Names come from the database; never let one point outside the uploads folder
  if (filename !== path.basename(filename) || filename.startsWith('.')) throw new Error(`Invalid file name: ${filename}`);
  return path.join(UPLOADS_DIR, filename);
}
