import path from 'path';
import { processImage } from './images';
import { createPoster, playbackPlan, probeVideo, uploadPath, videoMetadata } from './videos';
import type { DetectedMedia, ImageFormat, MediaKind, MediaMetadata, VideoFormat } from './media';

export interface IngestedMedia extends MediaMetadata {
  media_type: MediaKind;
  status: 'ready' | 'processing';
  filename: string;
  original_filename: string | null;
  thumb_filename: string;
  width: number | null;
  height: number | null;
  duration: number | null;
}

/**
 * Turns a verified upload (already stored as "<uuid>.<ext>") into the row
 * fields for the photos table. Images are fully processed here; videos get
 * their metadata and poster now and, if needed, a conversion queued for later
 * (status "processing", `filename` is the MP4 that the conversion will write).
 */
export async function ingest(storedName: string, media: DetectedMedia): Promise<IngestedMedia> {
  if (media.kind === 'image') {
    const image = await processImage(storedName, media.format as ImageFormat);
    return { ...image, media_type: 'image', status: 'ready', duration: null };
  }

  const input = uploadPath(storedName);
  const probe = await probeVideo(input);
  const base = path.parse(storedName).name;
  const thumb = `${base}.thumb.webp`;
  await createPoster(input, probe.duration, uploadPath(thumb));

  const plan = playbackPlan(media.format as VideoFormat, probe);
  const playable = plan === 'as-is' ? storedName : `${base}.${media.format === 'mp4' ? 'web.mp4' : 'mp4'}`;
  return {
    ...videoMetadata(probe),
    media_type: 'video',
    status: plan === 'as-is' ? 'ready' : 'processing',
    filename: playable,
    original_filename: plan === 'as-is' ? null : storedName,
    thumb_filename: thumb,
    width: probe.width,
    height: probe.height,
    duration: probe.duration,
  };
}
