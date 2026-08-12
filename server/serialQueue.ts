// A minimal FIFO serializer: each task waits for the previous one to settle
// (success or failure) before running. Used wherever concurrent invocations
// of an external process are known/suspected to conflict over shared state
// — server/conversionQueue.ts (LibreOffice's profile lock) and
// server/printQueue.ts (SumatraPDF's shared settings file). Each call site
// gets its own independent queue instance via a fresh call to this factory,
// so unrelated work (a conversion and a print job, say) never blocks on
// each other — only invocations sharing the same queue do.
export function createSerialQueue() {
  let queue: Promise<void> = Promise.resolve();

  return function runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
