import fs from 'fs';
import path from 'path';
import db from '../database/db';
import { UPLOADS_DIR } from '../config';
import { readImageMetadata } from './images';

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
