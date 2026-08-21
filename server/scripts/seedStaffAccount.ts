import bcrypt from 'bcryptjs';
import type { StaffRole } from '../staffAccountStore.js';

// Out-of-band provisioning for admin panel staff (server/db/schema.ts's
// `staffAccounts` — deliberately no public registration route). Usage:
//   npm run seed:staff -- someone@example.com somePassword operator
//   npm run seed:staff -- someone@example.com somePassword senior
//
// process.loadEnvFile() must run before staffAccountStore.js (and
// transitively db/client.js) is ever evaluated — a static top-level import
// would be hoisted ahead of it, so that import is deliberately dynamic,
// after loadEnvFile(), same fix this session's own throwaway test scripts
// needed for the same reason.
try {
  process.loadEnvFile();
} catch {
  // no .env file locally (or on Railway) — fine either way, same as server/index.ts
}

async function main() {
  const { createStaffAccount, StaffEmailTakenError } = await import('../staffAccountStore.js');
  const [email, password, role] = process.argv.slice(2);
  if (!email || !password || (role !== 'operator' && role !== 'senior')) {
    console.error('Usage: npm run seed:staff -- <email> <password> <operator|senior>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const account = await createStaffAccount(email, passwordHash, role as StaffRole);
    console.log(`Created staff account: ${account.email} (${account.role}), id=${account.id}`);
  } catch (err) {
    if (err instanceof StaffEmailTakenError) {
      console.error(`A staff account with email ${email} already exists.`);
      process.exit(1);
    }
    throw err;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[seedStaffAccount] Failed:', err);
    process.exit(1);
  });
