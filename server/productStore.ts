import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { products } from './db/schema.js';

// Shop catalog (docs/shop-requirements.md) — deliberately minimal CRUD for a small
// catalog managed through a simple form in the staff admin/ console, not a full
// inventory system.

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string;
  fulfillmentType: 'self-service' | 'staff-fulfilled';
  priceCents: number;
  variantLabel: string | null;
  imageUrl: string | null;
  stockQuantity: number | null;
  active: boolean;
}

const PRODUCT_COLUMNS = {
  id: products.id,
  name: products.name,
  description: products.description,
  category: products.category,
  fulfillmentType: products.fulfillmentType,
  priceCents: products.priceCents,
  variantLabel: products.variantLabel,
  imageUrl: products.imageUrl,
  stockQuantity: products.stockQuantity,
  active: products.active,
};

export interface CreateProductParams {
  name: string;
  description?: string;
  category: string;
  fulfillmentType: 'self-service' | 'staff-fulfilled';
  priceCents: number;
  variantLabel?: string;
  imageUrl?: string;
  stockQuantity?: number;
}

export async function createProduct(params: CreateProductParams): Promise<Product> {
  const [row] = await db
    .insert(products)
    .values({
      name: params.name,
      description: params.description ?? null,
      category: params.category,
      fulfillmentType: params.fulfillmentType,
      priceCents: params.priceCents,
      variantLabel: params.variantLabel ?? null,
      imageUrl: params.imageUrl ?? null,
      stockQuantity: params.stockQuantity ?? null,
    })
    .returning(PRODUCT_COLUMNS);
  return row as Product;
}

export interface UpdateProductParams {
  name?: string;
  description?: string | null;
  category?: string;
  fulfillmentType?: 'self-service' | 'staff-fulfilled';
  priceCents?: number;
  variantLabel?: string | null;
  imageUrl?: string | null;
  stockQuantity?: number | null;
  active?: boolean;
}

export async function updateProduct(
  id: string,
  params: UpdateProductParams,
): Promise<Product | null> {
  const [row] = await db
    .update(products)
    .set(params)
    .where(eq(products.id, id))
    .returning(PRODUCT_COLUMNS);
  return (row as Product) ?? null;
}

/** Customer-facing catalog — active products only. */
export async function listActiveProducts(): Promise<Product[]> {
  const rows = await db
    .select(PRODUCT_COLUMNS)
    .from(products)
    .where(eq(products.active, true))
    .orderBy(products.category, products.name);
  return rows as Product[];
}

/** Staff admin console — every product, active or not, so it can be re-enabled. */
export async function listAllProducts(): Promise<Product[]> {
  const rows = await db
    .select(PRODUCT_COLUMNS)
    .from(products)
    .orderBy(products.category, products.name);
  return rows as Product[];
}

export async function getProduct(id: string): Promise<Product | null> {
  const [row] = await db.select(PRODUCT_COLUMNS).from(products).where(eq(products.id, id));
  return (row as Product) ?? null;
}
