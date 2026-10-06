// Lists the Viva terminals on the merchant account with their Terminal IDs
// and status (Viva: statusId 1 = live) — to fill VIVA_TERMINAL_IDS
// (server/vivaTerminal.ts). Usage: npm run viva:devices
//
// .env must be loaded before vivaTerminal.ts is evaluated (it reads
// VIVA_ENV at load), hence the dynamic import.
try {
  process.loadEnvFile();
} catch {
  // no .env file — fine when the variables are set in the environment
}

const { searchDevices } = await import('../vivaTerminal.js');
console.log(JSON.stringify(await searchDevices(), null, 2));
