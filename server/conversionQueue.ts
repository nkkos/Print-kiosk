import { createSerialQueue } from './serialQueue.js';

// Serializes LibreOffice headless conversions (server/documentConverter.ts)
// process-wide — concurrent `soffice` instances are known to conflict over a
// shared user-profile lock.
export const runExclusive = createSerialQueue();
