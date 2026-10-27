import fs from 'fs';
import path from 'path';
import db from '../database/db';
import { UPLOADS_DIR } from '../config';
import { processImage, readImageMetadata } from './images';
import { detectMedia, readHeader, type ImageFormat } from './media';

/**
 * Photos uploaded before thumbnails/EXIF existed get them here, one at a time
 * in the background after startup, so the app is usable right away.
 */
export async function backfillPhotos(): Promise<number> {
  const pending = db.prepare(
    "SELECT id, filename FROM photos WHERE thumb_filename IS NULL AND media_type = 'image' ORDER BY id"
  ).all() as { id: number; filename: string }[];
  if (pending.length === 0) return 0;

  console.log(`🖼  Generating thumbnails for ${pending.length} existing photo(s)…`);
  const update = db.prepare(`
    UPDATE photos SET thumb_filename = @thumb_filename, taken_at = COALESCE(taken_at, @taken_at),
      taken_offset = COALESCE(taken_offset, @taken_offset), lat = COALESCE(lat, @lat), lng = COALESCE(lng, @lng),
      camera = COALESCE(camera, @camera), width = @width, height = @height
    WHERE id = @id
  `);

  let done = 0;
  for (const photo of pending) {
    const file = path.join(UPLOADS_DIR, photo.filename);
    try {
      if (!fs.existsSync(file)) continue;
      const media = detectMedia(readHeader(file));
      if (media?.kind !== 'image') continue;
      const result = await processImage(photo.filename, media.format as ImageFormat);
      // Existing files are already browser-friendly; keep the stored name
      update.run({ ...result, id: photo.id });
      done++;
    } catch (err) {
      console.error(`   could not process photo ${photo.id} (${photo.filename}):`, (err as Error).message);
    }
  }
  console.log(`🖼  Thumbnails ready for ${done} photo(s)`);
  return done;
}

/**
 * Photos whose metadata couldn't be read when uploaded (e.g. iOS 18 HEIC files
 * before the exifr fix) get another try from their original file.
 */
export async function backfillMetadata(): Promise<number> {
  const pending = db.prepare(`
    SELECT id, COALESCE(original_filename, filename) AS file FROM photos
    WHERE media_type = 'image' AND taken_at IS NULL AND lat IS NULL
  `).all() as { id: number; file: string }[];

  const update = db.prepare(`
    UPDATE photos SET taken_at = @taken_at, taken_offset = @taken_offset, lat = @lat, lng = @lng,
      camera = COALESCE(camera, @camera)
    WHERE id = @id
  `);
  let fixed = 0;
  for (const photo of pending) {
    const file = path.join(UPLOADS_DIR, photo.file);
    if (photo.file !== path.basename(photo.file) || !fs.existsSync(file)) continue;
    const meta = await readImageMetadata(await fs.promises.readFile(file));
    if (!meta.taken_at && meta.lat === null) continue;
    update.run({ ...meta, id: photo.id });
    fixed++;
  }
  if (fixed) console.log(`🧭 Recovered date/location for ${fixed} photo(s)`);
  return fixed;
}
