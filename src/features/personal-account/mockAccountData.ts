import type { PrintOrder } from '../../types/kiosk';

// Mock content for the Personal Account screen — see
// docs/personal-account-requirements.md. Stands in for the web portal's
// real file storage/order history (out of scope for this codebase).

export interface AccountFile {
  id: string;
  fileName: string;
}

export interface AccountFolder {
  id: string;
  name: string;
  files: AccountFile[];
}

// One level of folders is enough to demonstrate drill-down/back navigation
// (docs/personal-account-requirements.md, "File browsing on the kiosk")
// without inventing a real file-management data model.
export const ACCOUNT_ROOT_FILES: AccountFile[] = [
  { id: 'account-file-report', fileName: 'Report.pdf' },
  { id: 'account-file-invoice', fileName: 'Invoice.pdf' },
];

export const ACCOUNT_FOLDERS: AccountFolder[] = [
  {
    id: 'account-folder-photos',
    name: 'Photos',
    files: [
      { id: 'account-file-photo-a', fileName: 'photo-a.jpg' },
      { id: 'account-file-photo-b', fileName: 'photo-b.jpg' },
    ],
  },
];

// Flat lookup across root + every folder — used to resolve "batch configure"
// selections (ids can come from any folder, not just the currently open one)
// to file names (docs/personal-account-requirements.md, "Batch configure").
export const ALL_ACCOUNT_FILES: AccountFile[] = [
  ...ACCOUNT_ROOT_FILES,
  ...ACCOUNT_FOLDERS.flatMap((folder) => folder.files),
];

// A Print Order configured and paid for in advance via the web portal
// (docs/personal-account-requirements.md, "Paid orders awaiting print").
// `paidQuantity` equals `quantity` here — fully paid, $0 in Cart unless the
// user raises the quantity on-site.
export const MOCK_PAID_ORDERS: PrintOrder[] = [
  {
    id: 'account-order-contract',
    fileName: 'Signed-contract.pdf',
    paperSize: 'A4',
    sides: 'double',
    color: 'bw',
    orientation: 'portrait',
    scale: 'fit',
    quantity: 2,
    unitPrice: 1,
    paidQuantity: 2,
  },
];
