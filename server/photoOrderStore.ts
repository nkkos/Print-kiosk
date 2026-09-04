import { inArray } from 'drizzle-orm';
import { db } from './db/client.js';
import { photoOrders } from './db/schema.js';

// Photo kiosk's audit-only order record (server/db/schema.ts's photoOrders
// comment) — mirrors server/photoDocumentStore.ts's shape.

export interface RecordPhotoOrderParams {
  sessionId: string | null;
  specLabel: string;
  specWidthMm: number;
  specHeightMm: number;
  specDpi: number | null;
  shotCount: number;
}

export interface PhotoOrder {
  id: string;
  status: string;
}

export async function recordPhotoOrder(params: RecordPhotoOrderParams): Promise<PhotoOrder> {
  const [row] = await db
    .insert(photoOrders)
    .values({
      sessionId: params.sessionId,
      specLabel: params.specLabel,
      specWidthMm: params.specWidthMm,
      specHeightMm: params.specHeightMm,
      specDpi: params.specDpi,
      shotCount: params.shotCount,
    })
    .returning({ id: photoOrders.id, status: photoOrders.status });
  return row;
}

export async function markPhotoOrdersPrinted(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(photoOrders)
    .set({ status: 'printed', printedAt: new Date() })
    .where(inArray(photoOrders.id, ids));
}
