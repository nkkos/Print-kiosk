import { randomBytes } from 'node:crypto';
import type { FiscalJob, RegisterResult } from '../server/fiscalReceiptStore.js';

// The cash register next to the agent (docs/payments-technical-requirements.md,
// "eKasa (NineDigit / Portos) flow"): registers one receipt and, when the
// customer chose paper, prints it on the receipt printer. Chosen by
// FISCAL_DEVICE:
//   simulator (default) — answers like a register would, prints nothing;
//   ninedigit           — the NineDigit / Portos eKasa HTTP API on this
//                         machine (NINEDIGIT_URL), lands in B8 once the
//                         CHDÚ and its API documentation are here.

export type FiscalOutcome = RegisterResult | { status: 'failed'; reason: string };

export interface FiscalDevice {
  readonly name: string;
  register(job: FiscalJob): Promise<FiscalOutcome>;
}

let receiptCounter = 0;

const simulatorDevice: FiscalDevice = {
  name: 'simulator',
  async register(job) {
    receiptCounter += 1;
    const hex = (bytes: number) => randomBytes(bytes).toString('hex').toUpperCase();
    if (job.document.print) {
      console.log(`[agent] fiscal simulator — would print receipt ${job.id} on paper`);
    }
    return {
      status: 'registered',
      receiptUid: `O-SIM${hex(14)}`,
      okp: [hex(4), hex(4), hex(4), hex(4), hex(4)].join('-'),
      receiptNumber: `A${receiptCounter}`,
      cashRegisterCode: '88800000000000000',
    };
  },
};

export function createFiscalDevice(): FiscalDevice {
  const configured = process.env.FISCAL_DEVICE ?? 'simulator';
  if (configured !== 'simulator') {
    throw new Error(`FISCAL_DEVICE=${configured} is not implemented yet (B8)`);
  }
  return simulatorDevice;
}
