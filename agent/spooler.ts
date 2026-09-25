import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// The Windows print spooler's view of a queue (PowerShell's PrintManagement
// module). The agent names each downloaded file after its task id
// (agent/index.ts), and SumatraPDF uses the file name as the job's document
// name, so a job is found by that id.

export interface SpoolerJob {
  id: number;
  documentName: string;
  /** Windows JobStatus flags, e.g. ['Printing'] or ['Error', 'PaperOut']. */
  status: string[];
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function powershell(script: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { timeout: 15_000, windowsHide: true },
  );
  return stdout.trim();
}

export async function listSpoolerJobs(printerName: string): Promise<SpoolerJob[]> {
  const output = await powershell(
    `@(Get-PrintJob -PrinterName ${psQuote(printerName)} | ` +
      `Select-Object Id, DocumentName, @{n='JobStatus';e={"$($_.JobStatus)"}}) | ConvertTo-Json -Compress`,
  );
  if (!output) return [];
  const parsed = JSON.parse(output) as
    | { Id: number; DocumentName: string; JobStatus: string }[]
    | { Id: number; DocumentName: string; JobStatus: string };
  return (Array.isArray(parsed) ? parsed : [parsed]).map((job) => ({
    id: job.Id,
    documentName: job.DocumentName ?? '',
    status: (job.JobStatus ?? '')
      .split(',')
      .map((flag) => flag.trim())
      .filter(Boolean),
  }));
}

/** Removes a job that hasn't reached the printer yet, so it can't print
 * later behind a customer's back after they've been told it failed. */
export async function removeSpoolerJob(printerName: string, jobId: number): Promise<void> {
  await powershell(`Remove-PrintJob -PrinterName ${psQuote(printerName)} -ID ${jobId}`);
}
