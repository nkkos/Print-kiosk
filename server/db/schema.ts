import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

// Real database schema (docs/domain/kiosk-session.md, docs/personal-account-requirements.md,
// docs/cart-requirements.md) — see README.md, "Database." `accounts`/`kioskSessions`/
// `printOrders`/`paymentOrders` exist now so later phases (real accounts, real payments) don't
// need another migration, but nothing writes to them yet — only `uploadedFiles`/`receivedEmails`
// are wired up (they're the only real production traffic today: QR/Email upload). Money is
// stored as integer cents to avoid float-precision bugs.

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const kioskSessions = pgTable(
  'kiosk_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kioskId: text('kiosk_id'),
    accountId: uuid('account_id').references(() => accounts.id),
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
    accountId: uuid('account_id').references(() => accounts.id),
    paymentOrderId: uuid('payment_order_id').references(() => paymentOrders.id),
    fileName: text('file_name').notNull(),
    paperSize: text('paper_size').notNull(), // 'A4' | 'A5'
    sides: text('sides').notNull(), // 'single' | 'double'
    color: text('color').notNull(), // 'bw' | 'color'
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
