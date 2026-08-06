// Serializes LibreOffice headless conversions (server/documentConverter.ts)
// process-wide — concurrent `soffice` instances are known to conflict over a
// shared user-profile lock. A simple chained promise is enough: each task
// waits for the previous one to settle (success or failure) before running.

// Always resolves (never rejects) — a failed task must not break the chain
// for whatever runs after it.
let queue: Promise<void> = Promise.resolve();

export function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
