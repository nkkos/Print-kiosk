import { pgTable, uuid, text, integer, timestamp, index, boolean } from 'drizzle-orm/pg-core';

// Real database schema (docs/domain/kiosk-session.md, docs/personal-account-requirements.md,
// docs/cart-requirements.md) — see README.md, "Database." `printOrders`/`paymentOrders` exist
// now so a later real-payments phase doesn't need another migration, but nothing writes to them
// yet — the Cart/Print Order/Payment pipeline in the frontend is still fully mocked. Money is
// stored as integer cents to avoid float-precision bugs.

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  passwordHash: text('password_hash').notNull(),
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
    // 'email-verification' | 'password-reset' | 'session'
    type: text('type').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('account_tokens_account_id_idx').on(table.accountId)],
);

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
    quantity: integer('quantity').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    // present only on orders paid in advance via the portal
    paidQuantity: integer('paid_quantity'),
    sourcePaidOrderId: uuid('source_paid_order_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('print_orders_session_id_idx').on(table.sessionId),
    index('print_orders_account_id_idx').on(table.accountId),
  ],
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
    // 'queued' | 'printing' | 'succeeded' | 'failed'
    status: text('status').notNull().default('queued'),
    // 'printer-not-found' | 'submit-failed' | 'paper-jam' | 'out-of-paper' | 'out-of-ink'
    errorReason: text('error_reason'),
    printerName: text('printer_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('print_tasks_session_id_idx').on(table.sessionId)],
);
