import { and, eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { photoCountries, photoDocuments } from './db/schema.js';

// Photo kiosk's document-photo requirement data (docs/photo-kiosk-requirements.md,
// "Requirement data model") — managed through the staff admin/ console, mirroring
// server/productStore.ts's shape closely.

export interface PhotoCountry {
  id: string;
  name: string;
}

export interface PhotoDocument {
  id: string;
  countryId: string;
  label: string;
  photoWidthMm: number;
  photoHeightMm: number;
  dpi: number;
  headHeightMinMm: number;
  headHeightMaxMm: number;
  // Vertical crop anchor — a document sets at least one of these two; some
  // issuers (US, EU) publish an eye-line, others (China) publish a top
  // margin instead and never give an eye-line figure at all.
  eyeLineFromBottomMm: number | null;
  marginTopMm: number | null;
  // Distinct from photoWidthMm/photoHeightMm — how wide the HEAD itself must
  // be, not the frame. Most issuers don't publish this; nullable.
  headWidthMinMm: number | null;
  headWidthMaxMm: number | null;
  backgroundRequirement: string | null;
  // Structured #RRGGBB the capture pipeline's real background segmentation
  // recolors to directly — distinct from backgroundRequirement's free text.
  backgroundColorHex: string | null;
  printNotes: string | null;
  copiesPerSheet: number;
  priceCents: number;
  instructions: string | null;
  active: boolean;
}

const COUNTRY_COLUMNS = { id: photoCountries.id, name: photoCountries.name };

const DOCUMENT_COLUMNS = {
  id: photoDocuments.id,
  countryId: photoDocuments.countryId,
  label: photoDocuments.label,
  photoWidthMm: photoDocuments.photoWidthMm,
  photoHeightMm: photoDocuments.photoHeightMm,
  dpi: photoDocuments.dpi,
  headHeightMinMm: photoDocuments.headHeightMinMm,
  headHeightMaxMm: photoDocuments.headHeightMaxMm,
  eyeLineFromBottomMm: photoDocuments.eyeLineFromBottomMm,
  marginTopMm: photoDocuments.marginTopMm,
  headWidthMinMm: photoDocuments.headWidthMinMm,
  headWidthMaxMm: photoDocuments.headWidthMaxMm,
  backgroundRequirement: photoDocuments.backgroundRequirement,
  backgroundColorHex: photoDocuments.backgroundColorHex,
  printNotes: photoDocuments.printNotes,
  copiesPerSheet: photoDocuments.copiesPerSheet,
  priceCents: photoDocuments.priceCents,
  instructions: photoDocuments.instructions,
  active: photoDocuments.active,
};

export async function createCountry(name: string): Promise<PhotoCountry> {
  const [row] = await db.insert(photoCountries).values({ name }).returning(COUNTRY_COLUMNS);
  return row;
}

export async function listCountries(): Promise<PhotoCountry[]> {
  return db.select(COUNTRY_COLUMNS).from(photoCountries).orderBy(photoCountries.name);
}

export async function deleteCountry(id: string): Promise<void> {
  // Cascades to its documents (onDelete: 'cascade' on photoDocuments.countryId).
  await db.delete(photoCountries).where(eq(photoCountries.id, id));
}

export interface CreateDocumentParams {
  countryId: string;
  label: string;
  photoWidthMm: number;
  photoHeightMm: number;
  dpi: number;
  headHeightMinMm: number;
  headHeightMaxMm: number;
  eyeLineFromBottomMm?: number;
  marginTopMm?: number;
  headWidthMinMm?: number;
  headWidthMaxMm?: number;
  backgroundRequirement?: string;
  backgroundColorHex?: string;
  printNotes?: string;
  copiesPerSheet?: number;
  priceCents?: number;
  instructions?: string;
}

export async function createDocument(params: CreateDocumentParams): Promise<PhotoDocument> {
  const [row] = await db
    .insert(photoDocuments)
    .values({
      countryId: params.countryId,
      label: params.label,
      photoWidthMm: params.photoWidthMm,
      photoHeightMm: params.photoHeightMm,
      dpi: params.dpi,
      headHeightMinMm: params.headHeightMinMm,
      headHeightMaxMm: params.headHeightMaxMm,
      eyeLineFromBottomMm: params.eyeLineFromBottomMm ?? null,
      marginTopMm: params.marginTopMm ?? null,
      headWidthMinMm: params.headWidthMinMm ?? null,
      headWidthMaxMm: params.headWidthMaxMm ?? null,
      backgroundRequirement: params.backgroundRequirement ?? null,
      backgroundColorHex: params.backgroundColorHex ?? null,
      printNotes: params.printNotes ?? null,
      ...(params.copiesPerSheet != null ? { copiesPerSheet: params.copiesPerSheet } : {}),
      ...(params.priceCents != null ? { priceCents: params.priceCents } : {}),
      instructions: params.instructions ?? null,
    })
    .returning(DOCUMENT_COLUMNS);
  return row as PhotoDocument;
}

export interface UpdateDocumentParams {
  label?: string;
  photoWidthMm?: number;
  photoHeightMm?: number;
  dpi?: number;
  headHeightMinMm?: number;
  headHeightMaxMm?: number;
  eyeLineFromBottomMm?: number | null;
  marginTopMm?: number | null;
  headWidthMinMm?: number | null;
  headWidthMaxMm?: number | null;
  backgroundRequirement?: string | null;
  backgroundColorHex?: string | null;
  printNotes?: string | null;
  copiesPerSheet?: number;
  priceCents?: number;
  instructions?: string | null;
  active?: boolean;
}

export async function updateDocument(
  id: string,
  params: UpdateDocumentParams,
): Promise<PhotoDocument | null> {
  const [row] = await db
    .update(photoDocuments)
    .set(params)
    .where(eq(photoDocuments.id, id))
    .returning(DOCUMENT_COLUMNS);
  return (row as PhotoDocument) ?? null;
}

/** Every document, any country — the staff admin console's own list. */
export async function listAllDocuments(): Promise<PhotoDocument[]> {
  const rows = await db.select(DOCUMENT_COLUMNS).from(photoDocuments).orderBy(photoDocuments.label);
  return rows as PhotoDocument[];
}

/** Active documents for one country — the kiosk-facing picker
 * (docs/photo-kiosk-requirements.md's "Выбрать страну" screen). */
export async function listActiveDocumentsForCountry(countryId: string): Promise<PhotoDocument[]> {
  const rows = await db
    .select(DOCUMENT_COLUMNS)
    .from(photoDocuments)
    .where(and(eq(photoDocuments.countryId, countryId), eq(photoDocuments.active, true)));
  return rows as PhotoDocument[];
}

export async function getDocument(id: string): Promise<PhotoDocument | null> {
  const [row] = await db
    .select(DOCUMENT_COLUMNS)
    .from(photoDocuments)
    .where(eq(photoDocuments.id, id));
  return (row as PhotoDocument) ?? null;
}
