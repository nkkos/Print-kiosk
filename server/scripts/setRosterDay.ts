// Out-of-band roster editing (server/rosterStore.ts — no HTTP route exposes
// writes, per docs/screens/admin-panel-wireframes.md's confirmed "view-only
// in the admin panel" decision). Usage:
//   npm run set:roster -- monday someone@example.com

try {
  process.loadEnvFile();
} catch {
  // no .env file locally (or on Railway) — fine either way, same as server/index.ts
}

async function main() {
  const { DAYS_OF_WEEK, setRosterDay } = await import('../rosterStore.js');
  const { findStaffAccountByEmail } = await import('../staffAccountStore.js');

  const [day, email] = process.argv.slice(2);
  if (!day || !email || !DAYS_OF_WEEK.includes(day as (typeof DAYS_OF_WEEK)[number])) {
    console.error(`Usage: npm run set:roster -- <${DAYS_OF_WEEK.join('|')}> <email>`);
    process.exit(1);
  }
  const staffAccount = await findStaffAccountByEmail(email);
  if (!staffAccount) {
    console.error(`No staff account with email ${email} — seed one first (npm run seed:staff).`);
    process.exit(1);
  }
  await setRosterDay(day as (typeof DAYS_OF_WEEK)[number], staffAccount.id);
  console.log(`${day} → ${staffAccount.email} (${staffAccount.role})`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[setRosterDay] Failed:', err);
    process.exit(1);
  });
