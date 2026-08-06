import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import libre from 'libreoffice-convert';
import heicConvert from 'heic-convert';
import { runExclusive } from './conversionQueue.js';
import { hasPrintableExtension } from './fileValidation.js';

// Converts an uploaded file to a format server/printerAdapter.ts can actually
// print (server/fileValidation.ts's PRINTABLE_EXTENSIONS) when it isn't one
// already — see docs/domain/kiosk-session.md, "Related entities" (Print
// Task). Returns null for any format this module doesn't handle; callers
// keep their existing placeholder-document fallback for that case (and for
// any conversion failure — e.g. LibreOffice not installed locally).
//
// Cached on disk next to the original (<path>.pdf / <path>.jpg) so a retry
// or re-print of the same file doesn't re-run the conversion.

const libreConvert = promisify(libre.convert);

// Generous given the ~34s cold-start already observed locally — this only
// stops *waiting* on a hung soffice call (server/conversionQueue.ts still
// serializes real invocations); the underlying process isn't force-killed,
// since the promisified API gives no handle to it.
const CONVERSION_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Conversion timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// The cache path a given file would convert to — or null if this module
// doesn't handle its format. Exported so callers (server/routes.ts) can
// check whether a conversion already succeeded without triggering one.
export function getConvertedPath(absolutePath: string, fileName: string): string | null {
  const lowerCased = fileName.toLowerCase();
  if (lowerCased.endsWith('.doc') || lowerCased.endsWith('.docx')) return `${absolutePath}.pdf`;
  if (lowerCased.endsWith('.heic')) return `${absolutePath}.jpg`;
  return null;
}

// Resolves the printable file for an already-'ready' upload — the original
// itself if it's already a printable format, else its cached conversion
// (only if that conversion actually succeeded — server/uploadStore.ts's
// convertIfNeeded() runs at upload time, not here). Shared by
// POST /api/print-tasks and GET /api/uploaded-files/:fileId/content
// (server/routes.ts) — both need the identical resolution.
export function resolvePrintablePath(absolutePath: string, fileName: string): string | null {
  if (hasPrintableExtension(fileName)) return absolutePath;
  const convertedPath = getConvertedPath(absolutePath, fileName);
  return convertedPath && existsSync(convertedPath) ? convertedPath : null;
}

export async function convertToPrintable(
  absolutePath: string,
  fileName: string,
): Promise<string | null> {
  const lowerCased = fileName.toLowerCase();
  const outputPath = getConvertedPath(absolutePath, fileName);
  if (!outputPath) return null;

  if (existsSync(outputPath)) return outputPath;

  if (lowerCased.endsWith('.doc') || lowerCased.endsWith('.docx')) {
    const input = await readFile(absolutePath);
    const output = await runExclusive(() =>
      withTimeout(libreConvert(input, '.pdf', undefined), CONVERSION_TIMEOUT_MS),
    );
    await writeFile(outputPath, output);
    return outputPath;
  }

  const input = await readFile(absolutePath);
  const output = await heicConvert({ buffer: input, format: 'JPEG', quality: 0.9 });
  await writeFile(outputPath, Buffer.from(output));
  return outputPath;
}
