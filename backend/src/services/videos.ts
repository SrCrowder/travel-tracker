import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import sharp from 'sharp';
import { FFMPEG_PATH, FFPROBE_PATH, UPLOADS_DIR } from '../config';
import { EMPTY_METADATA, validCoords, type MediaMetadata, type VideoFormat } from './media';

// ─── Running ffmpeg / ffprobe ─────────────────────────────────────────────────
function run(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${path.basename(bin)} exited with ${code}: ${err.trim().split('\n').pop()}`));
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

// ─── Probing ──────────────────────────────────────────────────────────────────
interface ProbeStream {
  codec_type: string;
  codec_name?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number }>;
}

export interface VideoProbe {
  duration: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  pixFmt: string | null;
  audioCodec: string | null;
  tags: Record<string, string>;
}

export async function probeVideo(file: string): Promise<VideoProbe> {
  const json = JSON.parse((await run(FFPROBE_PATH, [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
  ])).toString());
  const streams: ProbeStream[] = json.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  if (!video) throw new Error('No video stream');

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
    audioCodec: audio?.codec_name ?? null,
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

// ─── Poster thumbnail ─────────────────────────────────────────────────────────
export async function createPoster(file: string, duration: number | null, thumbPath: string): Promise<void> {
  const at = duration && duration > 2 ? 1 : 0;
  const png = await run(FFMPEG_PATH, [
    '-v', 'error', '-ss', String(at), '-i', file, '-frames:v', '1',
    '-vf', 'scale=960:960:force_original_aspect_ratio=decrease', '-f', 'image2pipe', '-vcodec', 'png', '-',
  ]);
  if (png.length === 0) throw new Error('Could not extract a frame');
  await sharp(png).resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toFile(thumbPath);
}

// ─── Making it playable in every browser ──────────────────────────────────────
// H.264 (8-bit 4:2:0) + AAC/MP3 in MP4 plays everywhere. iPhone MOVs are HEVC
// (and often 10-bit HDR), which most browsers can't play → re-encode.

export type PlaybackPlan = 'as-is' | 'remux' | 'transcode';

export function playbackPlan(format: VideoFormat, probe: VideoProbe): PlaybackPlan {
  const audioOk = !probe.audioCodec || ['aac', 'mp3'].includes(probe.audioCodec);
  // Remuxing (no re-encode) also moves the index to the start for fast seeking
  if (probe.videoCodec === 'h264' && probe.pixFmt === 'yuv420p' && audioOk) return 'remux';
  if (format === 'webm' && ['vp8', 'vp9', 'av1'].includes(probe.videoCodec ?? '')) return 'as-is';
  return 'transcode';
}

export async function makePlayable(input: string, output: string, plan: PlaybackPlan, probe: VideoProbe): Promise<void> {
  const tmp = `${output}.part`;
  const common = ['-v', 'error', '-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1'];
  const args = plan === 'remux'
    ? [...common, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', tmp]
    : [
      ...common,
      // Longest side at most 1920 px, even dimensions
      '-vf', "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))',format=yuv420p",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high',
      ...(probe.audioCodec ? ['-c:a', 'aac', '-b:a', '160k'] : []),
      '-movflags', '+faststart', '-f', 'mp4', tmp,
    ];
  try {
    await run(FFMPEG_PATH, args);
    await fs.promises.rename(tmp, output);
  } finally {
    await fs.promises.rm(tmp, { force: true });
  }
}

export const uploadPath = (filename: string) => path.join(UPLOADS_DIR, filename);
