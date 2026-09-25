import { pgTable, uuid, text, integer, real, timestamp, index, boolean } from 'drizzle-orm/pg-core';

// Real database schema (docs/domain/kiosk-session.md, docs/personal-account-requirements.md,
// docs/cart-requirements.md) — see README.md, "Database." The kiosk's own Cart/Print
// Order/Payment screens are still fully mocked, but the portal's account-order path
// (server/accountOrderStore.ts) and the shop checkout (docs/shop-checkout-requirements.md,
// server/shopOrderStore.ts) are both real and do write to `paymentOrders`/`printOrders`. Money
// is stored as integer cents to avoid float-precision bugs.

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  passwordHash: text('password_hash').notNull(),
  // Optional invoice details (docs/shop-checkout-requirements.md's "Optional invoice
  // fields") — set either at shop checkout or later from account settings; both write
  // to the same two columns, there's no separate per-order copy.
  invoiceCompanyName: text('invoice_company_name'),
  invoiceTaxId: text('invoice_tax_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Single table for every kind of account-related token — email verification,
// password reset, and login session tokens all share the same shape. Only
// `tokenHash` (the raw token's SHA-256) is ever stored, same principle as
// password hashing: a leaked DB doesn't leak usable tokens. Verification/
// reset tokens are single-use (`usedAt` set on consumption); session tokens
// are multi-use until `expiresAt` (`usedAt` stays null for those).
export const accountTokens = pgTable(
  'account_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    // 'email-verification' | 'password-reset' | 'session' | 'company-invite'
    type: text('type').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('account_tokens_account_id_idx').on(table.accountId)],
);

// Admin panel staff (docs/screens/admin-panel-wireframes.md,
// docs/screens/admin-panel-spec.md) — deliberately a SEPARATE table from
// `accounts` above, not that table plus a role column. `accounts` is
// self-service (anyone can POST /api/accounts/register); mixing pavilion
// staff privilege into the same table as public customer self-registration
// would risk a customer ending up in the same place a role check reads
// from. No public registration route exists for this table — provisioning
// is out-of-band (server/scripts/seedStaffAccount.ts).
export const staffAccounts = pgTable('staff_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // 'operator' | 'senior'
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Session tokens only — unlike accountTokens, staff accounts have no
// email-verification/password-reset flow yet (no public self-service
// surface to drive one), so there's no need for the multi-type shape.
export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    staffAccountId: uuid('staff_account_id')
      .notNull()
      .references(() => staffAccounts.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('staff_sessions_staff_account_id_idx').on(table.staffAccountId)],
);

// Fixed weekly on-call schedule (docs/screens/admin-panel-wireframes.md,
// Alerts & on-call screen) — confirmed view-only in the admin panel itself;
// this table is edited directly (DB), not through a UI, per that
// confirmed decision. One row per day of the week, repeating indefinitely
// — not date-specific shifts.
export const staffRoster = pgTable('staff_roster', {
  id: uuid('id').primaryKey().defaultRandom(),
  // 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  dayOfWeek: text('day_of_week').notNull().unique(),
  staffAccountId: uuid('staff_account_id')
    .notNull()
    .references(() => staffAccounts.id, { onDelete: 'cascade' }),
});

// Personal Account's "My files" (docs/personal-account-requirements.md) —
// permanent, account-owned storage, deliberately separate from
// `uploadedFiles` (session-scoped, subject to server/sessionLifecycle.ts's
// TTL sweep and session-end cleanup). Mixing the two would risk that sweep
// silently deleting a user's saved files. Folder management happens only on
// the portal — the kiosk is read-only with respect to organization.
export const accountFolders = pgTable(
  'account_folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('account_folders_account_id_idx').on(table.accountId)],
);

export const accountFiles = pgTable(
  'account_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    // null = root (no folder)
    folderId: uuid('folder_id').references(() => accountFolders.id, { onDelete: 'set null' }),
    fileName: text('file_name').notNull(),
    // path relative to server/account-uploads/, not absolute
    storagePath: text('storage_path').notNull(),
    // Tracked so server/accountFileLimits.ts can enforce a per-account total
    // storage quota without re-statting every file on disk each time.
    fileSizeBytes: integer('file_size_bytes').notNull().default(0),
    // 'scanning' | 'converting' | 'ready' | 'rejected' | 'scan-unavailable'
    status: text('status').notNull().default('scanning'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('account_files_account_id_idx').on(table.accountId),
    index('account_files_folder_id_idx').on(table.folderId),
  ],
);

export const kioskSessions = pgTable(
  'kiosk_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kioskId: text('kiosk_id'),
    // set null (not cascaded) on account deletion — the session's fact/log
    // record is retained per docs/domain/kiosk-session.md's "Retained ...
    // Session lifecycle events", only the account linkage is anonymized.
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    // 'service-print' | 'service-scan' | 'service-copy' | 'login'
    startedVia: text('started_via'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    // 'active' | 'ending' | 'ended' | 'cleanup-failed'
    status: text('status').notNull().default('active'),
    // 'manual' | 'timeout' — set only once status is 'ended'
    endedReason: text('ended_reason'),
  },
  (table) => [index('kiosk_sessions_account_id_idx').on(table.accountId)],
);

export const paymentOrders = pgTable('payment_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => kioskSessions.id),
  // Set for shop checkouts (docs/shop-checkout-requirements.md) — one payment can cover
  // both a printOrders row and a shopOrders row at once, so this lives here rather than
  // being inferred by joining through either child table. Not set for the kiosk's own
  // (still-mocked) Cart/Payment flow, which has no account requirement.
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  // 'ready-for-payment' | 'paid' | 'cancelled-by-client'
  status: text('status').notNull().default('ready-for-payment'),
  amountCents: integer('amount_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
});

export const printOrders = pgTable(
  'print_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').references(() => kioskSessions.id),
    // set only for orders originating from a logged-in Personal Account (e.g. "paid orders awaiting print")
    // set null (not cascaded) on account deletion — the fact/log record of
    // the order is retained per docs/domain/kiosk-session.md, only the
    // account linkage is anonymized.
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    paymentOrderId: uuid('payment_order_id').references(() => paymentOrders.id),
    // The real My-files/portal-uploaded file this order prints — set only
    // for orders created via POST /api/accounts/orders (server/routes.ts).
    accountFileId: uuid('account_file_id').references(() => accountFiles.id, {
      onDelete: 'set null',
    }),
    fileName: text('file_name').notNull(),
    paperSize: text('paper_size').notNull(), // 'A4' | 'A5'
    sides: text('sides').notNull(), // 'single' | 'double'
    color: text('color').notNull(), // 'bw' | 'color'
    orientation: text('orientation').notNull(), // 'portrait' | 'landscape'
    scale: text('scale').notNull(), // 'fit' | 'original'
    // The exact pdf-to-printer page-range syntax ("2-5") — null means every
    // page, matching the kiosk's own PrintOrder.pageRange (src/types/kiosk.ts).
    // Set only for orders created via POST /api/accounts/orders; ordinary
    // kiosk Cart items never persist here (Cart/Print Order stay mocked).
    pageRange: text('page_range'),
    // Pages per printed sheet side, 1 | 2 | 4 | 6 (src/utils/nUpLayout.ts).
    pagesPerSheet: integer('pages_per_sheet').notNull().default(1),
    quantity: integer('quantity').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    // present only on orders paid in advance via the portal
    paidQuantity: integer('paid_quantity'),
    sourcePaidOrderId: uuid('source_paid_order_id'),
    // Set instead of a real payment when an authorized company member picks
    // "Bill to <Company>" at checkout (server/accountOrderStore.ts's
    // payOrderForCompany) — the order still reaches 'paid' through the same
    // lifecycle below, it's just aggregated into a companyInvoices row
    // later instead of being paid per-order. Null for every ordinary,
    // individually-paid order.
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    // 'created' | 'paid' | 'issued' — the portal order lifecycle
    // (docs/personal-account-requirements.md, "Order status lifecycle").
    // Only meaningful for accountId-owned rows (portal-created orders);
    // ordinary kiosk Cart items never persist a printOrders row at all, so
    // this column is unused for those. 'issued' is set automatically once
    // the printTasks row referencing this order (see printTasks.printOrderId
    // below) reaches 'succeeded' — real or simulated.
    status: text('status').notNull().default('created'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('print_orders_session_id_idx').on(table.sessionId),
    index('print_orders_account_id_idx').on(table.accountId),
  ],
);

// Shop catalog (docs/shop-requirements.md, docs/shop-checkout-requirements.md) — deliberately
// minimal for a small catalog: one flat `variantLabel` string instead of a real
// size/material/color variant matrix, revisit once the catalog outgrows this.
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  // 'self-service' | 'staff-fulfilled' — docs/shop-checkout-requirements.md's two
  // fundamentally different order types. Print itself stays modeled as printOrders,
  // not as a product row, so this is 'staff-fulfilled' for every product today; the
  // column still exists because the catalog is expected to grow into both kinds.
  fulfillmentType: text('fulfillment_type').notNull(),
  priceCents: integer('price_cents').notNull(),
  variantLabel: text('variant_label'),
  // A plain URL for MVP — no upload/storage pipeline for product photos yet, admin
  // pastes a link. Nullable: the catalog card falls back to a placeholder.
  imageUrl: text('image_url'),
  // null = not stock-tracked (e.g. a made-to-order item)
  stockQuantity: integer('stock_quantity'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// The "staff-fulfilled" order half of a shop checkout — the pavilion (or a partner)
// produces and hands these over, unlike printOrders' self-service pickup. Deliberately
// a separate table from printOrders rather than one polymorphic "orders" table: the two
// have almost nothing in common in shape (print config vs. a list of catalog items) and
// different visibility rules (docs/shop-checkout-requirements.md — kiosk never shows these).
export const shopOrders = pgTable(
  'shop_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    paymentOrderId: uuid('payment_order_id').references(() => paymentOrders.id),
    // 'self-pickup' only for now — the column exists so a delivery option can be added
    // later without a schema change (docs/shop-requirements.md's Fulfillment table).
    fulfillmentMethod: text('fulfillment_method').notNull().default('self-pickup'),
    // 'paid' -> 'preparing' -> 'ready' -> 'picked-up'
    status: text('status').notNull().default('paid'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('shop_orders_account_id_idx').on(table.accountId)],
);

export const shopOrderItems = pgTable(
  'shop_order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopOrderId: uuid('shop_order_id')
      .notNull()
      .references(() => shopOrders.id, { onDelete: 'cascade' }),
    // set null (not cascaded) if the catalog row is later removed — the line item
    // itself, snapshotted below, is what actually matters for order history.
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    // Denormalized at purchase time, same reasoning as a real invoice line never
    // silently changing if the catalog product is edited or deleted afterward.
    productName: text('product_name').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull(),
  },
  (table) => [index('shop_order_items_shop_order_id_idx').on(table.shopOrderId)],
);

export const receivedEmails = pgTable(
  'received_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // the 8-char session-address prefix, e.g. `upload-<prefix>@domain`
    prefix: text('prefix').notNull(),
    subject: text('subject').notNull(),
    bodyPreview: text('body_preview').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('received_emails_prefix_idx').on(table.prefix)],
);

export const uploadedFiles = pgTable(
  'uploaded_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // the QR session id, OR the email prefix — same dual use as the old in-memory Map key
    sessionKey: text('session_key').notNull(),
    // set only for email attachments
    emailId: uuid('email_id').references(() => receivedEmails.id),
    fileName: text('file_name').notNull(),
    // path relative to server/uploads/, not absolute
    storagePath: text('storage_path').notNull(),
    // 'scanning' | 'ready' | 'rejected'
    status: text('status').notNull().default('scanning'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('uploaded_files_session_key_idx').on(table.sessionKey)],
);

// Phone-Camera Scan (docs/scan-upload-requirements.md, docs/screens/scan-spec.md)
// — one row per "scan attempt" reached from the kiosk's Scan screen. `id` is
// what the QR code encodes (not the kiosk sessionId itself) since a single
// Kiosk Session can go through several scan attempts over time (Finish, then
// `scan-restart` for another document) — `sessionId` is what lets the kiosk
// find "the current scan attempt for my session" when polling.
export const scanSessions = pgTable(
  'scan_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    // Comma-separated subset of 'email' | 'link' | 'account' — set together
    // with deliveredAt once P4 (docs/screens/scan-spec.md) is confirmed.
    deliveryMethods: text('delivery_methods'),
    deliveredToEmail: text('delivered_to_email'),
    // Set only if 'account' was among deliveryMethods — the saved copy in
    // the account's real "My files" (server/accountFileStore.ts).
    accountFileId: uuid('account_file_id').references(() => accountFiles.id, {
      onDelete: 'set null',
    }),
    // path relative to server/scans/, not absolute — the final combined
    // multi-page PDF, set once all pages are captured and delivery is
    // confirmed (not before — there's nothing to combine while pages are
    // still being added).
    finalStoragePath: text('final_storage_path'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('scan_sessions_session_id_idx').on(table.sessionId)],
);

export const scanPages = pgTable(
  'scan_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scanSessionId: uuid('scan_session_id')
      .notNull()
      .references(() => scanSessions.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    // paths relative to server/scans/, not absolute
    rawStoragePath: text('raw_storage_path').notNull(),
    processedStoragePath: text('processed_storage_path'),
    // 'processing' | 'ready' | 'failed'
    status: text('status').notNull().default('processing'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('scan_pages_scan_session_id_idx').on(table.scanSessionId)],
);

// Copy (docs/copy-upload-requirements.md, docs/screens/copy-spec.md) —
// reuses Scan's capture pipeline (same shape as scanSessions/scanPages) but
// has no delivery step: `resultFileId` is set once the captured pages are
// combined into one PDF and handed to `uploadedFiles` (server/uploadStore.ts)
// — from that point on it's a normal session-scoped uploaded file, printed
// exactly like a QR upload. `id` is what the QR code encodes; `sessionId` is
// the owning Kiosk Session, letting a session run several Copy attempts
// (`copy-another-document`, docs/screens/copy-spec.md) over time.
export const copySessions = pgTable(
  'copy_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    resultFileId: uuid('result_file_id').references(() => uploadedFiles.id, {
      onDelete: 'set null',
    }),
    // Set alongside resultFileId once finishCopySession combines the pages —
    // copyPages rows themselves are deleted at that point (server/copyStore.ts),
    // so the kiosk's "Document ready (N pages)" status (docs/screens/copy-spec.md)
    // needs its own preserved count rather than counting live page rows.
    resultPageCount: integer('result_page_count'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('copy_sessions_session_id_idx').on(table.sessionId)],
);

export const copyPages = pgTable(
  'copy_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    copySessionId: uuid('copy_session_id')
      .notNull()
      .references(() => copySessions.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    // paths relative to server/copies/, not absolute
    rawStoragePath: text('raw_storage_path').notNull(),
    processedStoragePath: text('processed_storage_path'),
    // 'processing' | 'ready' | 'failed'
    status: text('status').notNull().default('processing'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('copy_pages_copy_session_id_idx').on(table.copySessionId)],
);

// Central incident log (docs/equipment-monitoring-requirements.md) — every
// equipment/service failure across the pavilion, regardless of source,
// shares this one shape so the admin panel (docs/screens/admin-panel-spec.md)
// can show a single cross-equipment feed/log instead of one ad-hoc error
// format per subsystem. `context`/`autoRemediation` are free-form JSON
// (stringified — no jsonb precedent elsewhere in this schema yet, and
// nothing here needs to query inside them).
export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // 'pc' | 'printer' | 'display' | 'network' | 'backend' | 'payment-terminal'
    source: text('source').notNull(),
    // namespaced by source, e.g. 'printer.paper-jam'
    code: text('code').notNull(),
    // 'info' | 'warning' | 'critical' | 'emergency'
    severity: text('severity').notNull(),
    message: text('message').notNull(),
    context: text('context'),
    autoRemediation: text('auto_remediation'),
    // Groups related events into one incident timeline (e.g. jam -> retry ->
    // alert) — not a real FK, just a shared grouping value.
    correlationId: uuid('correlation_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    // 'auto' | 'operator' — null while still open
    resolvedBy: text('resolved_by'),
    // Set once a Telegram alert has actually been sent for this row
    // (server/telegramNotifier.ts). Since no real reportIncident() call site
    // populates correlationId yet, deduplication uses a (source, code,
    // recent notifiedAt) time-window check instead of a correlation chain —
    // a simplification from the original design, not an oversight (see
    // docs/equipment-monitoring-requirements.md's Open items).
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('incidents_source_idx').on(table.source),
    index('incidents_correlation_id_idx').on(table.correlationId),
    index('incidents_resolved_at_idx').on(table.resolvedAt),
  ],
);

// A Print Task — "the execution unit that actually drives the physical
// printer" (docs/domain/kiosk-session.md, "Related entities"). Deliberately
// independent of `printOrders` (still unwired to the real Cart/pricing
// pipeline) — this table only tracks one printer-submission attempt.
export const printTasks = pgTable(
  'print_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Not a real FK to kioskSessions — that table isn't written to yet (Cart/
    // Payment/Print are still frontend-only, session state lives in
    // localStorage), so a real client-generated session id would violate a
    // references() constraint here. Kept as a plain column for later.
    sessionId: uuid('session_id'),
    // Links back to the portal order this task prints, if any — lets a real
    // or simulated print success drive that order's 'paid' -> 'issued'
    // transition (docs/personal-account-requirements.md, "Order status
    // lifecycle"). Null for QR/Email-sourced or unpaid My-files print jobs,
    // which have no printOrders row to link to.
    printOrderId: uuid('print_order_id').references(() => printOrders.id, {
      onDelete: 'set null',
    }),
    // 'queued' | 'printing' | 'succeeded' | 'failed'
    status: text('status').notNull().default('queued'),
    // 'printer-not-found' | 'submit-failed' | 'paper-jam' | 'out-of-paper' | 'out-of-ink'
    errorReason: text('error_reason'),
    printerName: text('printer_name'),
    // Pavilion launch plan (2026-09-16): the physical printer feeds a
    // Brother MX-4000 4-bin mailbox, one bin per customer batch. Null while
    // the task is still waiting for a free bin (server/pickupBins.ts) —
    // only assigned, and only then actually submitted to the printer, once
    // one opens up. No sensor exists on the real hardware yet to detect a
    // customer actually taking their printout, so `pickedUpAt` is set by an
    // explicit confirmation (customer or staff), not automatically — see
    // POST /api/print-tasks/:id/picked-up.
    binNumber: integer('bin_number'),
    pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
    // Pavilion architecture (docs/pavilion-launch-checklist.md): in 'agent'
    // print mode the cloud never prints itself — the print agent on the
    // pavilion mini-PC claims a bin-assigned task (server/agentRoutes.ts),
    // prints it locally and reports back. Set when claimed; a claim that
    // never reports back (agent crashed mid-job) becomes claimable again
    // after AGENT_CLAIM_TIMEOUT_MS. Always null in 'direct' mode.
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    // Which kiosk stand the job came from ('A', 'B', ...) — the stand's
    // browser opens the kiosk with ?stand=<id> (src/utils/standId.ts). Null
    // for jobs from anywhere else, or from before this existed.
    standId: text('stand_id'),
    // The original submission's file/print options (fileId, paperSize,
    // sides, ...) — stringified JSON, same convention as incidents.context
    // above (no jsonb precedent in this schema, nothing needs to query
    // inside it). Persisted so a task that had to wait for a free bin can
    // actually be submitted later (server/printOrchestrator.ts's
    // tryPrintTask, re-invoked on every GET /api/print-tasks/:id poll) —
    // the original HTTP request's closure is long gone by then.
    printOptions: text('print_options'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('print_tasks_session_id_idx').on(table.sessionId)],
);

// B2B company billing (docs, "B2B company-billing portal" plan, 2026-09-17) —
// a company's employees print through the exact same self-service flow as
// any other Personal Account (accounts/accountFiles/printOrders below), the
// only difference is how their printOrders rows get paid: instead of a real
// payment, an authorized member picks "Bill to <Company>"
// (server/accountOrderStore.ts's payOrderForCompany), and the aggregated
// total is invoiced to the company later (companyInvoices below) instead of
// being paid per-order. Deliberately NOT a parallel identity system —
// `companyMembers` just links existing `accounts` rows to a company, the
// same reasoning `staffAccounts` above rejected for pavilion staff (a
// customer ending up with staff privilege) doesn't apply here since company
// members are still ordinary self-service customers, just billed
// differently.
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ico: text('ico').notNull(),
  dic: text('dic').notNull(),
  // Required to actually issue a real invoice (Slovak faktúra náležitosti)
  // but not to create the company record — an admin may onboard a company
  // before every detail is confirmed. Validated at invoice-generation time
  // instead (server/companyInvoiceStore.ts), not at creation time.
  icDph: text('ic_dph'),
  billingEmail: text('billing_email').notNull(),
  billingAddress: text('billing_address'),
  // One flat negotiated rate per company — deliberately not a graduated
  // volume-discount engine (a marketing mockup showed one; no real B2B
  // customer exists yet to design that complexity against, same
  // "don't build speculative abstractions" call already made elsewhere in
  // this schema, e.g. products.fulfillmentType's comment above). Both are
  // NET (before VAT) — Slovak B2B rates are negotiated net, VAT is added on
  // top at invoice time (server/companyInvoiceStore.ts).
  pricePerPageBwCents: integer('price_per_page_bw_cents').notNull(),
  pricePerPageColorCents: integer('price_per_page_color_cents').notNull(),
  // Defaults to Slovakia's standard rate but is a per-company override, not
  // a global constant — a diplomatic mission (the Austrian Embassy sits at
  // this pavilion's own address, docs — location dossier) can be VAT-exempt
  // under the Vienna Convention, and a foreign company may fall under
  // reverse-charge instead of domestic VAT. Confirm the real default with an
  // accountant before the first real invoice goes out.
  vatRatePercent: integer('vat_rate_percent').notNull().default(20),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const companyMembers = pgTable(
  'company_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    // 'admin' can invite other members and see the company's invoices;
    // 'member' can only print and bill to the company.
    role: text('role').notNull().default('member'),
    invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
    // Null until the invited account actually verifies/accepts — mirrors
    // accountTokens' email-verification pattern rather than inventing a
    // separate invite-status enum.
    joinedAt: timestamp('joined_at', { withTimezone: true }),
  },
  (table) => [
    index('company_members_company_id_idx').on(table.companyId),
    index('company_members_account_id_idx').on(table.accountId),
  ],
);

export const companyInvoices = pgTable(
  'company_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    // Snapshotted from companies.vatRatePercent at draft-generation time —
    // never read live from `companies` afterward, so a rate correction (or a
    // company's exemption status changing) never silently rewrites a
    // historical invoice.
    vatRatePercent: integer('vat_rate_percent').notNull(),
    // Sum of companyInvoiceItems.lineTotalCents (základ dane — the taxable
    // base, before VAT).
    totalNetCents: integer('total_net_cents').notNull(),
    totalVatCents: integer('total_vat_cents').notNull(),
    // What the company actually owes (totalNetCents + totalVatCents) — the
    // headline figure on the invoice and in every UI that lists invoices.
    totalCents: integer('total_cents').notNull(),
    // 'draft' -> 'issued' (a staff-triggered two-step action, never
    // automatic — server/adminRoutes.ts) -> 'paid' | 'failed'.
    status: text('status').notNull().default('draft'),
    // Which server/invoiceAdapter.ts implementation issued this — kept even
    // though only one exists today, since switching providers ahead of
    // Slovakia's 2027 e-invoicing mandate is the whole reason this is an
    // adapter rather than inline code.
    externalProvider: text('external_provider'),
    externalInvoiceId: text('external_invoice_id'),
    pdfUrl: text('pdf_url'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('company_invoices_company_id_idx').on(table.companyId)],
);

// Snapshotted at draft-generation time, same reasoning as shopOrderItems
// above (a real invoice line must never silently change if the underlying
// printOrders row or the company's rate is edited afterward).
export const companyInvoiceItems = pgTable(
  'company_invoice_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyInvoiceId: uuid('company_invoice_id')
      .notNull()
      .references(() => companyInvoices.id, { onDelete: 'cascade' }),
    printOrderId: uuid('print_order_id').references(() => printOrders.id, {
      onDelete: 'set null',
    }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    // NET (before VAT) — same convention as companies.pricePerPageBwCents.
    unitPriceCents: integer('unit_price_cents').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
    // Computed from the parent invoice's vatRatePercent at generation time,
    // stored per line (not just once on the invoice) since a real invoice
    // must show VAT per line item, not only as a single combined total.
    vatAmountCents: integer('vat_amount_cents').notNull(),
  },
  (table) => [index('company_invoice_items_company_invoice_id_idx').on(table.companyInvoiceId)],
);

// Photo kiosk's document-photo requirement data (docs/photo-kiosk-requirements.md,
// "Requirement data model") — a genuine two-level Country -> Document hierarchy,
// confirmed deliberately NOT a shared/reusable spec: different documents within the
// same country can have genuinely different photo requirements in practice, so each
// Document carries its own complete spec rather than referencing one.
export const photoCountries = pgTable('photo_countries', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const photoDocuments = pgTable(
  'photo_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    countryId: uuid('country_id')
      .notNull()
      .references(() => photoCountries.id, { onDelete: 'cascade' }),
    // e.g. "Туристическая виза" — shown in the document-type list once a country
    // is picked (docs/photo-kiosk-requirements.md's wireframe walkthrough).
    label: text('label').notNull(),
    // Crop-driving fields — feed directly into the crop/scale calculation
    // (docs/photo-kiosk-requirements.md's "Confirmed technical approach," layer 2).
    photoWidthMm: real('photo_width_mm').notNull(),
    photoHeightMm: real('photo_height_mm').notNull(),
    dpi: integer('dpi').notNull(),
    headHeightMinMm: real('head_height_min_mm').notNull(),
    headHeightMaxMm: real('head_height_max_mm').notNull(),
    // Vertical anchor for the crop — most countries (US, EU) publish this;
    // some (China) instead publish marginTopMm below and never give an
    // eye-line figure at all. Nullable now that we know both conventions
    // exist in the wild (docs/photo-kiosk-requirements.md's country research);
    // a document should set at least one of the two.
    eyeLineFromBottomMm: real('eye_line_from_bottom_mm'),
    // Alternative vertical anchor: empty space between the top of the photo
    // and the crown of the head (China: 3-5mm), used instead of an eye-line
    // figure when the issuer doesn't publish one.
    marginTopMm: real('margin_top_mm'),
    // Distinct from photoWidthMm — constrains how wide the HEAD itself must
    // be within the frame (China: 15-22mm). Most issuers don't publish this;
    // nullable.
    headWidthMinMm: real('head_width_min_mm'),
    headWidthMaxMm: real('head_width_max_mm'),
    // Format/print fields — don't affect the crop itself. copiesPerSheet:
    // real-world ID-photo printing convention is N copies of the ONE
    // confirmed shot on one A4 sheet (confirmed with the product owner:
    // one photo -> 6 copies is the default, not a gallery of distinct shots).
    backgroundRequirement: text('background_requirement'),
    // Structured `#RRGGBB` the capture pipeline's real background
    // segmentation (photo-kiosk/backgroundSegmentation.ts) recolors to
    // directly — distinct from backgroundRequirement above, which stays
    // free text for rules that don't reduce to one color ("grey or blue,
    // white forbidden"). Nullable: the booth's own physical backdrop is
    // used unmodified until an admin picks a concrete target color.
    backgroundColorHex: text('background_color_hex'),
    printNotes: text('print_notes'),
    copiesPerSheet: integer('copies_per_sheet').notNull().default(6),
    // Price for one copy (one A4 sheet of copiesPerSheet photos) — same
    // priceCents-in-a-shop-currency convention as products.priceCents /
    // shop/formatPrice.ts (this pavilion prices in EUR). Placeholder default,
    // same posture as src/utils/pricing.ts's own placeholder rate table —
    // real tariffication is a future discovery.
    priceCents: integer('price_cents').notNull().default(500),
    // Shown to the customer before capture, not automatically validated yet
    // (confirmed deliberate phase boundary — expected to become real automatic
    // validation later, not dropped as a rejected idea).
    instructions: text('instructions'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('photo_documents_country_id_idx').on(table.countryId)],
);

// Photo kiosk's audit-only order record (docs/domain/kiosk-session.md's "delete
// the file content; retain the metadata/fact of the transaction" — applied even
// more strictly here: no photo content is ever written server-side at all, since
// A4 sheet composition happens entirely client-side (photo privacy is confirmed
// more sensitive than document privacy). A separate table from printOrders, not a
// polymorphic one, same reasoning as shopOrders' own split by fulfillment shape.
export const photoOrders = pgTable(
  'photo_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').references(() => kioskSessions.id),
    specLabel: text('spec_label').notNull(),
    specWidthMm: real('spec_width_mm').notNull(),
    specHeightMm: real('spec_height_mm').notNull(),
    specDpi: integer('spec_dpi'),
    // Photos tiled on ONE sheet (photoDocuments.copiesPerSheet or the
    // custom-size default) — distinct from `quantity` below.
    shotCount: integer('shot_count').notNull(),
    // How many identical sheets of this configuration — customer-editable in
    // the Cart popup, defaults to 1. Confirmed with the product owner after
    // the cart UI initially conflated this with shotCount as one "N копий"
    // number, which was wrong (shotCount is fixed per document, quantity is
    // the customer's own order size).
    quantity: integer('quantity').notNull().default(1),
    // The financial fact of the transaction (docs/domain/kiosk-session.md's
    // cleanup contract: "Retained ... Financial/payment records (amount,
    // timestamp, status)") — unitPriceCents * quantity at the moment payment
    // was simulated-confirmed.
    amountCents: integer('amount_cents').notNull().default(0),
    // 'paid' -> 'printed'. No 'cancelled' state: a row is only ever created once
    // payment is simulated-confirmed, so a cancelled payment never reaches this
    // table at all.
    status: text('status').notNull().default('paid'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    printedAt: timestamp('printed_at', { withTimezone: true }),
  },
  (table) => [index('photo_orders_session_id_idx').on(table.sessionId)],
);
