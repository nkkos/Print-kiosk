# Data Privacy & Confidentiality — Confirmed Requirements

Internal project document. Consolidates the requirements confirmed with the product owner for protecting customer data (uploaded files, account data, and — as a placeholder for later — payment data), driven by the EU market this kiosk targets (GDPR-relevant, even though this document does not attempt to be a legal GDPR compliance analysis). This document defines requirements only — implementation is tracked separately.

## Purpose

Establishes what customer data this system holds, how long it's allowed to live, who can access it, and what happens to it when a Kiosk Session ends — so confidentiality isn't an afterthought bolted onto an already-built pipeline.

## Data inventory

| Data                                               | Where                                            | Lifecycle                                                                               |
| -------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Uploaded file content + filename                   | Disk (`server/uploads/`), `uploaded_files` table | Session-scoped — see "Session-scoped file uploads" below                                |
| Received email subject + body preview              | `received_emails` table                          | Session-scoped, same as its attachments                                                 |
| Account email + bcrypt password hash               | `accounts` table                                 | Persistent — not session-bound, see "Account data" below                                |
| Account verification/reset/session tokens (hashed) | `account_tokens` table                           | Already short-lived by design (single-use or a fixed expiry — `server/accountStore.ts`) |
| Payment data                                       | Not yet implemented                              | Placeholder section below for when Phase 3 lands                                        |

**Already-confirmed good practice, worth noting explicitly:** the inbound-email pipeline (`server/routes.ts`'s `POST /api/email/incoming`) never stores the sender's own email address — only the message subject, a short body preview, and attachments. Not a gap to fix, just worth recording so it isn't accidentally added later without a reason.

## Session-scoped file uploads (QR + Email attachments)

**Confirmed cleanup triggers:** a session's uploaded files (and their `uploaded_files`/`received_emails` records) are deleted when the Kiosk Session ends — either the user pressing "Finish and clear data," or the automatic inactivity timeout (`docs/domain/kiosk-session.md`). Both paths already converge on the same frontend handler (`App.tsx`'s `handleEndSession`) — today that handler only clears client-side state; it needs to also tell the backend to actually delete the session's files.

**Not just deletion — the backend needs to know a session is closed.** Today the backend has no concept of "this session has ended" at all (`kiosk_sessions` isn't written to yet). Deleting existing records on session-end isn't sufficient by itself: if an Email attachment arrives _after_ the session already closed, nothing today would stop it from being accepted and stored as if the session were still active. The backend needs a lightweight marker of "this session id / email prefix is closed" so a late-arriving email can be recognized and immediately discarded rather than silently creating fresh records for an already-ended session.

**Late-arriving email after session close:** deleted immediately on arrival — not queued for later cleanup, not kept even briefly.

**TTL safety net:** if the "session ended" signal never reaches the backend at all (browser crash, connectivity loss, kiosk process restart), orphaned files are deleted automatically after **4 hours** from their upload time, via a scheduled sweep — independent of whether any explicit end-session signal ever arrived. This is the same possibility the domain model already anticipated (`kiosk_sessions.status` already includes a `'cleanup-failed'` value) — the TTL sweep is the fallback for exactly that case.

**Already safe by construction:** a session cannot be ended (manually or by timeout) while actively printing — `sessionActive={false}` on Payment/Print Status already hides "Finish and clear data" and suspends the inactivity timeout on those screens (`docs/domain/kiosk-session.md`). No race between "cleanup fired" and "still mid-print" is possible today.

**Converted/cached files too:** cleanup must also remove the LibreOffice/heic-convert cache files (`<original-path>.pdf` / `.jpg`, `server/documentConverter.ts`) alongside the original — not just the source upload.

## Account data

Accounts are deliberately **not** session-scoped — a returning customer's account is expected to persist across visits, so none of the session-cleanup rules above apply to it.

**Right to erasure (confirmed requirement, not yet implemented):** a logged-in user must be able to request deletion of their own account and its data on demand — most naturally as a self-service action on the portal's Account page (`portal/account.html`, alongside the existing change-password form), since that's already the one place a session token authenticates a request. Exact UX (confirmation step, immediate vs. delayed) is not yet designed. Today, deleting an account is a clean operation (just the `accounts` + `account_tokens` rows — nothing else references `accountId` yet), but once real order history exists (Phase 3+), this will need a policy decision: hard-delete vs. anonymize past orders (financial/tax record-keeping obligations commonly require _keeping_ transaction records even after the account itself is deleted — see "Open items").

## Payment data (placeholder — Phase 3 not yet built)

No payment processing exists yet (`docs/product-overview.md`). Once it does, this section needs its own pass — at minimum: whether card data ever touches our own backend at all (vs. a payment provider's hosted flow, which is strongly preferred precisely to keep this system out of PCI-DSS scope), and how paid-order records interact with the account-erasure requirement above.

## Third-party processors

Customer data (files, email addresses) currently passes through:

- **Railway** — hosting, Postgres, and file storage (the persistent volume backing `server/uploads/`).
- **Cloudflare** — DNS, Email Routing, the relay Worker (`cloudflare-worker/email-relay.js`), and Pages (portal hosting).
- **Resend** — sends account verification/password-reset emails (`server/emailSender.ts`).

Data residency (which regions these providers actually store/process data in) has not been verified against any EU-residency requirement — flagged as an open item, since it depends on each provider's own region settings, not something this document can settle on its own.

## Encryption

- **In transit:** HTTPS end-to-end (Railway/Cloudflare-terminated TLS) — already in place, no action needed.
- **At rest:** not implemented — uploaded files sit unencrypted on Railway's volume. Given files are now short-lived (session-end cleanup + 4-hour TTL safety net above), this is lower urgency than it would be for long-lived data, but still an open item.

## Access control (existing gap — referenced, not solved here)

Already documented elsewhere (`CLAUDE.md`): there are no authorization checks beyond the login endpoints themselves — any client that knows or guesses a session id can list that session's files. This is an accepted prototype-stage limitation today, but it directly undermines the confidentiality goals of this document and should be closed before any real production use.

## Scope boundaries

Out of scope for this document: exact legal GDPR compliance analysis (consent wording, lawful-basis documentation, a user-facing privacy notice's actual text) — those are product/legal decisions this document flags the need for for but doesn't resolve. Also out of scope: the Cart/Print Order/Payment Order data model itself (still mocked, no real backend records yet — see `CLAUDE.md`).

## Open items

- Server-side "session closed" marker — needed to reject/immediately-discard late-arriving email for an already-ended session (see above); not yet designed.
- Whether a user-facing privacy notice is needed at the kiosk itself, and its wording — a product/legal decision, not an engineering one.
- Data residency confirmation for Railway/Cloudflare/Resend against any EU-residency requirement.
- At-rest encryption for uploaded files on the Railway volume.
- Account-erasure policy once real paid order history exists: hard-delete vs. anonymize, balanced against financial record-keeping obligations.
- Whether payment data should ever touch this system's own backend at all, once Phase 3 is designed.
