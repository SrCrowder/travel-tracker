import fs from 'fs';
import path from 'path';
import { BROWSER_FORMATS, readImageMetadata } from './images';
import { playbackPlan, probeVideo, uploadPath, videoMetadata, type VideoProbe } from './videos';
import { EMPTY_METADATA, type DetectedMedia, type ImageFormat, type MediaKind, type MediaMetadata, type VideoFormat } from './media';

export interface IngestedMedia extends MediaMetadata {
  media_type: MediaKind;
  status: 'ready' | 'processing';
  filename: string;
  original_filename: string | null;
  thumb_filename: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  geo_source: 'exif' | null;
}

/**
 * The quick part of an upload: read the metadata and decide the file names.
 * Nothing heavy happens here (and nothing here can make the upload fail), so
 * hundreds of files can be imported on a small server: thumbnails, HEIC → JPEG
 * and video conversion run afterwards in the background queue (mediaJobs).
 *
 * `filename` is the browser-friendly file; while status is "processing" it may
 * not exist yet (the queue writes it).
 */
export async function ingest(storedName: string, media: DetectedMedia): Promise<IngestedMedia> {
  const base = path.parse(storedName).name;

  if (media.kind === 'image') {
    let metadata = EMPTY_METADATA;
    try {
      metadata = await readImageMetadata(await fs.promises.readFile(uploadPath(storedName)));
    } catch { /* no metadata: still a photo */ }
    const viewable = BROWSER_FORMATS.includes(media.format as ImageFormat);
    return {
      ...metadata,
      media_type: 'image',
      status: viewable ? 'ready' : 'processing',
      filename: viewable ? storedName : `${base}.jpg`,
      original_filename: viewable ? null : storedName,
      thumb_filename: null,
      width: null,
      height: null,
      duration: null,
      geo_source: metadata.lat !== null ? 'exif' : null,
    };
  }

  let probe: VideoProbe | null = null;
  try {
    probe = await probeVideo(uploadPath(storedName));
  } catch { /* unreadable now: the queue will retry and report */ }
  const plan = probe ? playbackPlan(media.format as VideoFormat, probe) : 'transcode';
  const metadata = probe ? videoMetadata(probe) : EMPTY_METADATA;
  return {
    ...metadata,
    media_type: 'video',
    status: plan === 'as-is' ? 'ready' : 'processing',
    filename: plan === 'as-is' ? storedName : `${base}.${media.format === 'mp4' ? 'web.mp4' : 'mp4'}`,
    original_filename: plan === 'as-is' ? null : storedName,
    thumb_filename: null,
    width: probe?.width ?? null,
    height: probe?.height ?? null,
    duration: probe?.duration ?? null,
    geo_source: metadata.lat !== null ? 'exif' : null,
  };
}
