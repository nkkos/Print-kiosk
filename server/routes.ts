import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { networkInterfaces } from 'node:os';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { addFile, listFiles } from './uploadStore.js';
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  hasAcceptedExtension,
  decodeOriginalName,
} from './fileValidation.js';

export const PORT = 3001;
const serverDir = dirname(fileURLToPath(import.meta.url));
const uploadsDir = join(serverDir, 'uploads');

// Auto-detects the dev machine's LAN-facing IPv4 so the QR code can encode a
// URL the phone (a different device, on the same Wi-Fi) can actually reach —
// "localhost" only works for the kiosk browser itself, which runs on this
// same machine (docs/qr-upload-requirements.md, "How it works"). Dev
// machines commonly also have VPN/virtual adapters (Radmin VPN, Hamachi,
// Hyper-V, Docker, etc.) that also report a non-internal IPv4 but aren't
// reachable from another device on the physical Wi-Fi — picking the first
// non-internal address (the old approach) could return one of those
// instead. Preferring an interface whose name actually says Wi-Fi/Ethernet
// avoids that.
export function getLanIPv4(): string {
  const interfaces = Object.entries(networkInterfaces());

  const wifiOrEthernet = interfaces.find(([name]) => /wi-?fi|wireless|ethernet/i.test(name));
  const wifiAddress = wifiOrEthernet?.[1]?.find(
    (entry) => entry.family === 'IPv4' && !entry.internal,
  );
  if (wifiAddress) return wifiAddress.address;

  for (const [, entries] of interfaces) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return 'localhost';
}

// Express 5 types route params as `string | string[]` in general (repeating
// segments can produce arrays) — our routes only ever use plain `:sessionId`
// segments, which are always a single string at runtime.
function paramString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

// Rejected uploads (wrong format or too large) never reach disk — multer
// runs fileFilter/limits checks before the storage engine writes anything
// (docs/domain/kiosk-session.md, "File format and size limits").
class InvalidFileFormatError extends Error {}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, callback) => {
      const sessionDir = join(uploadsDir, paramString(req.params.sessionId));
      mkdirSync(sessionDir, { recursive: true });
      callback(null, sessionDir);
    },
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    // Fixed up front, once — every later use of file.originalname (disk
    // filename below, the name stored/displayed via addFile) reads from
    // this same mutated object, so it only needs doing here.
    file.originalname = decodeOriginalName(file.originalname);
    if (hasAcceptedExtension(file.originalname)) {
      callback(null, true);
    } else {
      callback(new InvalidFileFormatError());
    }
  },
});

// Wraps upload.array() to redirect back to the same upload page with an
// inline error instead of a raw 500 — the phone-facing behavior confirmed
// in docs/qr-upload-requirements.md, "File format and size limits."
function handleFileUpload(req: Request, res: Response, next: NextFunction) {
  const sessionId = paramString(req.params.sessionId);
  upload.array('files')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.redirect(303, `/upload/${sessionId}?error=size`);
    } else if (err instanceof InvalidFileFormatError) {
      res.redirect(303, `/upload/${sessionId}?error=format`);
    } else if (err) {
      next(err);
    } else {
      next();
    }
  });
}

export const router = Router();

router.get('/api/config', (_req, res) => {
  res.json({ lanUploadUrl: `http://${getLanIPv4()}:${PORT}` });
});

// The "lightweight web page (file picker / take-a-photo)" from
// docs/qr-upload-requirements.md — served directly by this backend (not the
// Vite frontend) so the phone's upload never needs CORS: it's a plain HTML
// form posting back to this same origin.
router.get('/upload/:sessionId', (req, res) => {
  const sessionId = paramString(req.params.sessionId);
  const uploaded = req.query.uploaded === '1';
  const error = req.query.error;
  const errorMessage =
    error === 'size'
      ? `File is too large — maximum size is ${MAX_FILE_SIZE_MB} MB. Please try a smaller file.`
      : error === 'format'
        ? `Unsupported file format. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}.`
        : null;
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Upload to kiosk</title>
  <style>
    body { font-family: sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; }
    button, input[type="file"] { font-size: 1.1rem; padding: 0.75rem; width: 100%; }
    p.success { color: #146c2e; }
    p.error { color: #b3261e; }
    p.hint { color: #555; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Upload your file(s)</h1>
  <p class="hint">Accepted: ${ACCEPTED_EXTENSIONS.join(', ')} — up to ${MAX_FILE_SIZE_MB} MB each.</p>
  ${uploaded ? '<p class="success">Uploaded! You can add more, or go back to the kiosk.</p>' : ''}
  ${errorMessage ? `<p class="error">${errorMessage}</p>` : ''}
  <form method="post" action="/api/qr-sessions/${sessionId}/files" enctype="multipart/form-data">
    <input type="file" name="files" multiple required />
    <br /><br />
    <button type="submit">Upload</button>
  </form>
</body>
</html>`);
});

router.post('/api/qr-sessions/:sessionId/files', handleFileUpload, (req, res) => {
  const sessionId = paramString(req.params.sessionId);
  const files = Array.isArray(req.files) ? req.files : [];
  for (const file of files) {
    addFile(sessionId, file.originalname, file.path);
  }
  res.redirect(303, `/upload/${sessionId}?uploaded=1`);
});

router.get('/api/qr-sessions/:sessionId/files', (req, res) => {
  res.json(listFiles(paramString(req.params.sessionId)));
});
