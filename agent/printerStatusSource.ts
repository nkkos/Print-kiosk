import { readFile } from 'node:fs/promises';
import snmp from 'net-snmp';
import {
  decodeDetectedErrorState,
  decodePrinterStatus,
  type PrinterProblem,
  type PrinterSnapshot,
  type PrinterState,
  type PrinterSupply,
} from '../server/printerStatus.js';

// Where the agent learns the printer's physical state. A plain OS print API
// only knows when the spooler has handed a job over, not whether paper came
// out — so the agent asks the printer itself over SNMP (standard Printer-MIB,
// which the Brother driver itself reads too — see docs/pavilion-launch-checklist.md).
//
//   PRINTER_SNMP_HOST            printer IP → real SNMP (v2c)
//   PRINTER_SNMP_COMMUNITY       default "public"
//   PRINTER_STATUS_SIMULATOR_FILE path to a JSON file shaped like
//                                PrinterSnapshot (checkedAt optional) — read
//                                on every poll, so editing it by hand
//                                simulates a jam, empty tray, etc. without
//                                hardware. Wins over PRINTER_SNMP_HOST.
// Neither set → no status source: the agent treats "left the spooler" as done.

export interface PrinterStatusSource {
  read(): Promise<PrinterSnapshot>;
}

export function createPrinterStatusSource(): PrinterStatusSource | null {
  const simulatorFile = process.env.PRINTER_STATUS_SIMULATOR_FILE;
  if (simulatorFile) return simulatorSource(simulatorFile);
  const host = process.env.PRINTER_SNMP_HOST;
  if (host) return snmpSource(host, process.env.PRINTER_SNMP_COMMUNITY || 'public');
  return null;
}

function unreachable(): PrinterSnapshot {
  return {
    state: 'unreachable',
    problems: ['unreachable'],
    supplies: [],
    checkedAt: new Date().toISOString(),
  };
}

function simulatorSource(file: string): PrinterStatusSource {
  return {
    async read() {
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<PrinterSnapshot>;
        return {
          state: parsed.state ?? 'idle',
          problems: parsed.problems ?? [],
          supplies: parsed.supplies ?? [],
          checkedAt: new Date().toISOString(),
        };
      } catch {
        return unreachable();
      }
    },
  };
}

// hrPrinterTable (HOST-RESOURCES-MIB) and prtMarkerSuppliesTable (Printer-MIB).
// Walked as subtrees rather than read at a fixed index, since the device
// index the printer uses isn't guaranteed to be 1.
const HR_PRINTER_STATUS = '1.3.6.1.2.1.25.3.5.1.1';
const HR_PRINTER_ERROR_STATE = '1.3.6.1.2.1.25.3.5.1.2';
const SUPPLY_DESCRIPTION = '1.3.6.1.2.1.43.11.1.1.6';
const SUPPLY_MAX_CAPACITY = '1.3.6.1.2.1.43.11.1.1.8';
const SUPPLY_LEVEL = '1.3.6.1.2.1.43.11.1.1.9';

function walk(session: snmp.Session, oid: string): Promise<Map<string, snmp.Varbind>> {
  return new Promise((resolve, reject) => {
    const rows = new Map<string, snmp.Varbind>();
    session.subtree(
      oid,
      20,
      (varbinds) => {
        for (const varbind of varbinds) {
          if (!snmp.isVarbindError(varbind)) rows.set(varbind.oid.slice(oid.length + 1), varbind);
        }
      },
      (error) => (error ? reject(error) : resolve(rows)),
    );
  });
}

function snmpSource(host: string, community: string): PrinterStatusSource {
  return {
    async read() {
      const session = snmp.createSession(host, community, {
        version: snmp.Version2c,
        timeout: 2000,
        retries: 1,
      });
      try {
        const [statusRows, errorRows, descriptions, capacities, levels] = await Promise.all([
          walk(session, HR_PRINTER_STATUS),
          walk(session, HR_PRINTER_ERROR_STATE),
          walk(session, SUPPLY_DESCRIPTION),
          walk(session, SUPPLY_MAX_CAPACITY),
          walk(session, SUPPLY_LEVEL),
        ]);

        const firstStatus = [...statusRows.values()][0];
        const state: PrinterState = firstStatus
          ? decodePrinterStatus(Number(firstStatus.value))
          : 'unknown';
        const firstError = [...errorRows.values()][0];
        const problems: PrinterProblem[] =
          firstError?.value instanceof Buffer ? decodeDetectedErrorState(firstError.value) : [];

        const supplies: PrinterSupply[] = [...descriptions.entries()].map(([index, varbind]) => {
          const capacity = Number(capacities.get(index)?.value);
          const level = Number(levels.get(index)?.value);
          // Negative levels are Printer-MIB's "unknown" / "some remaining".
          const levelPercent =
            capacity > 0 && level >= 0 ? Math.round((level / capacity) * 100) : null;
          return { name: String(varbind.value).trim(), levelPercent };
        });

        return { state, problems, supplies, checkedAt: new Date().toISOString() };
      } catch {
        return unreachable();
      } finally {
        session.close();
      }
    },
  };
}
