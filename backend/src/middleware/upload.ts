import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { UPLOADS_DIR } from '../config';

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// The stored extension comes from this allowlist, never from the client's
// filename, so an upload can't end up served as .html/.svg/.js.
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${EXTENSIONS[file.mimetype]}`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (EXTENSIONS[file.mimetype]) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error('Only image files (jpg, png, webp, gif) are allowed'), { status: 400 }));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 20,                   // max 20 files per request
  },
});

// ─── Content check: the file's magic bytes must match its extension ──────────
function detectImageExt(file: string): string | null {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(12);
  try {
    fs.readSync(fd, buf, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return '.gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

function uploadedFiles(req: Request): Express.Multer.File[] {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  return [];
}

// Delete the files of a request that was rejected after multer stored them.
export function removeUploadedFiles(req: Request): void {
  for (const file of uploadedFiles(req)) {
    fs.rmSync(file.path, { force: true });
  }
}

// Runs after multer: rejects the whole request if any file isn't a real image.
export function verifyImages(req: Request, res: Response, next: NextFunction) {
  const bad = uploadedFiles(req).some((file) => detectImageExt(file.path) !== path.extname(file.filename));
  if (!bad) return next();
  removeUploadedFiles(req);
  res.status(400).json({ error: 'Only image files (jpg, png, webp, gif) are allowed' });
}

/** Deletes a stored upload; ignores missing files and names with a path in them. */
export function deleteUpload(filename: string | null | undefined): void {
  if (!filename || filename !== path.basename(filename)) return;
  fs.rmSync(path.join(UPLOADS_DIR, filename), { force: true });
}

// Headers for serving /uploads: never sniff or run the content as a page.
export function uploadHeaders(res: Response): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
}

export default upload;
export { UPLOADS_DIR };
