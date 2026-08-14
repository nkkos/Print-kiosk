// Personal Account file limits — confirmed to need their own, narrower rules
// than QR/Email uploads (server/fileValidation.ts's shared ACCEPTED_EXTENSIONS/
// MAX_FILE_SIZE_BYTES), per docs/personal-account-requirements.md, "Open
// items" and docs/screens/portal-personal-account-spec.md, "New backend
// rules." All three are env-configured, not hardcoded — the product owner
// expects to change them often without a code change/deploy; the defaults
// below are the wireframe's own draft values, not confirmed-final numbers.

function parseExtensions(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => extension.length > 0);
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const ACCOUNT_FILE_ACCEPTED_EXTENSIONS = parseExtensions(
  process.env.ACCOUNT_FILE_ACCEPTED_EXTENSIONS,
  ['.pdf', '.jpg', '.jpeg'],
);

export const ACCOUNT_FILE_RETENTION_DAYS = parsePositiveNumber(
  process.env.ACCOUNT_FILE_RETENTION_DAYS,
  30,
);

export const ACCOUNT_FILE_MAX_TOTAL_STORAGE_MB = parsePositiveNumber(
  process.env.ACCOUNT_FILE_MAX_TOTAL_STORAGE_MB,
  100,
);
export const ACCOUNT_FILE_MAX_TOTAL_STORAGE_BYTES = ACCOUNT_FILE_MAX_TOTAL_STORAGE_MB * 1024 * 1024;

export function hasAcceptedAccountFileExtension(fileName: string): boolean {
  const lowerCased = fileName.toLowerCase();
  return ACCOUNT_FILE_ACCEPTED_EXTENSIONS.some((extension) => lowerCased.endsWith(extension));
}

// Thrown by server/accountFileStore.ts's addFile when a new upload would
// push the account over its total storage quota — caught in server/routes.ts
// and turned into a 400 with a clear message, same pattern as
// InvalidFileFormatError there.
export class AccountStorageQuotaExceededError extends Error {}
