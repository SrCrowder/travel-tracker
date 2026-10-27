import fs from 'fs';
import path from 'path';
import { UPLOADS_DIR } from '../config';

/** Deletes a stored upload; ignores missing files and names with a path in them. */
export function deleteUpload(filename: string | null | undefined): void {
  if (!filename || filename !== path.basename(filename)) return;
  fs.rmSync(path.join(UPLOADS_DIR, filename), { force: true });
}

/** Deletes every file that belongs to a photo/video row. */
export function deleteMediaFiles(row: { filename: string; original_filename?: string | null; thumb_filename?: string | null }): void {
  deleteUpload(row.filename);
  deleteUpload(row.original_filename);
  deleteUpload(row.thumb_filename);
}
