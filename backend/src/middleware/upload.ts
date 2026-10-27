import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { MAX_IMAGE_MB, MAX_VIDEO_MB, UPLOADS_DIR } from '../config';
import { detectMedia, readHeader, type DetectedMedia, type MediaKind } from '../services/media';
import { videoSupport } from '../services/videos';

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Files land with a neutral ".upload" name; verifyMedia() renames them once
// their real type is known, so the extension never comes from the client.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.upload`),
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_VIDEO_MB * 1024 * 1024, // images get a lower limit in verifyMedia
    files: 50,
  },
});

export type VerifiedFile = Express.Multer.File & { media: DetectedMedia };

/** Why a file of an upload was not accepted (codes the frontend translates). */
export type RejectReason = 'unsupported_format' | 'too_large' | 'video_unsupported_server';
export interface RejectedFile { name: string; reason: RejectReason }

declare module 'express-serve-static-core' {
  interface Request { rejectedFiles?: RejectedFile[] }
}

export function uploadedFiles(req: Request): Express.Multer.File[] {
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

const KIND_ERROR: Record<string, string> = {
  image: 'Only image files (jpg, png, webp, gif, avif, heic, tiff) are allowed',
  'image,video': 'Only photos (jpg, png, webp, gif, avif, heic, tiff) and videos (mov, mp4, webm) are allowed',
};

const REASON_TEXT: Record<RejectReason, string> = {
  unsupported_format: 'not a supported photo or video',
  too_large: `photos can be at most ${MAX_IMAGE_MB} MB`,
  video_unsupported_server: 'video support is not available on this server (ffmpeg is missing)',
};

/**
 * Runs after multer: checks each file's bytes and renames accepted files to
 * "<uuid>.<ext>". By default one bad file rejects the whole request (covers);
 * with `partial`, bad files are dropped one by one and listed in
 * req.rejectedFiles, so a big import never loses good files because of one.
 */
export function verifyMedia(allowed: MediaKind[], { partial = false } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = uploadedFiles(req);
      const hasVideoSupport = await videoSupport();
      const detected = files.map((file) => detectMedia(readHeader(file.path)));
      const problems = files.map((file, i): RejectReason | null => {
        const media = detected[i];
        if (!media || !allowed.includes(media.kind)) return 'unsupported_format';
        if (media.kind === 'image' && file.size > MAX_IMAGE_MB * 1024 * 1024) return 'too_large';
        if (media.kind === 'video' && !hasVideoSupport) return 'video_unsupported_server';
        return null;
      });

      const firstProblem = problems.find(Boolean);
      if (firstProblem && !partial) {
        removeUploadedFiles(req);
        return res.status(400).json({
          error: firstProblem === 'unsupported_format' ? KIND_ERROR[allowed.join(',')] : REASON_TEXT[firstProblem],
        });
      }

      req.rejectedFiles = [];
      files.forEach((file, i) => {
        if (!problems[i]) return;
        fs.rmSync(file.path, { force: true });
        req.rejectedFiles!.push({ name: file.originalname, reason: problems[i]! });
      });
      if (Array.isArray(req.files)) req.files = req.files.filter((_, i) => !problems[i]);

      files.forEach((file, i) => {
        if (problems[i]) return;
        const name = `${path.parse(file.filename).name}.${detected[i]!.format}`;
        const target = path.join(UPLOADS_DIR, name);
        fs.renameSync(file.path, target);
        Object.assign(file, { filename: name, path: target, media: detected[i] });
      });
      next();
    } catch (err) {
      removeUploadedFiles(req);
      next(err);
    }
  };
}

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.heic': 'image/heic', '.tiff': 'image/tiff', '.mov': 'video/quicktime', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

// Headers for serving /uploads: never sniff or run the content as a page.
export function uploadHeaders(res: Response, filePath: string): void {
  res.setHeader('Content-Type', CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
}

export { deleteUpload } from '../services/storage';
export default upload;
