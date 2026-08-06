import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import libre from 'libreoffice-convert';
import heicConvert from 'heic-convert';

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

export async function convertToPrintable(
  absolutePath: string,
  fileName: string,
): Promise<string | null> {
  const lowerCased = fileName.toLowerCase();

  if (lowerCased.endsWith('.doc') || lowerCased.endsWith('.docx')) {
    const outputPath = `${absolutePath}.pdf`;
    if (!existsSync(outputPath)) {
      const input = await readFile(absolutePath);
      const output = await libreConvert(input, '.pdf', undefined);
      await writeFile(outputPath, output);
    }
    return outputPath;
  }

  if (lowerCased.endsWith('.heic')) {
    const outputPath = `${absolutePath}.jpg`;
    if (!existsSync(outputPath)) {
      const input = await readFile(absolutePath);
      const output = await heicConvert({ buffer: input, format: 'JPEG', quality: 0.9 });
      await writeFile(outputPath, Buffer.from(output));
    }
    return outputPath;
  }

  return null;
}
