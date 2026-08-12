import { createSerialQueue } from './serialQueue.js';

// Serializes real print-job submissions (server/printerAdapter.ts).
// pdf-to-printer's bundled SumatraPDF-3.4.6-32.exe writes to a single
// shared SumatraPDF-settings.txt (next to the exe) on every invocation —
// unlike libreoffice-convert, which isolates each call into its own temp
// profile — so concurrent invocations risk racing on that file. Confirmed:
// the file's mtime updates on every submission. Not yet confirmed against a
// real printer under real concurrent load (only checked statically) —
// physical verification is a follow-up once a printer is available.
export const runExclusive = createSerialQueue();
