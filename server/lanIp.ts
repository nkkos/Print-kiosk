import { networkInterfaces } from 'node:os';

// Auto-detects the dev machine's LAN-facing IPv4 so a URL handed to a phone
// (a different device, on the same Wi-Fi) can actually be reached —
// "localhost" only works for a browser running on this same machine. Dev
// machines commonly also have VPN/virtual adapters (Radmin VPN, Hamachi,
// Hyper-V, Docker, etc.) that also report a non-internal IPv4 but aren't
// reachable from another device on the physical Wi-Fi — picking the first
// non-internal address (the old approach) could return one of those
// instead. Preferring an interface whose name actually says Wi-Fi/Ethernet
// avoids that.
//
// Extracted from server/routes.ts (docs/qr-upload-requirements.md, "How it
// works") once server/emailSender.ts needed the identical logic for its own
// local-dev console-logged verification/reset links — importing it from
// routes.ts directly would be circular (routes.ts already imports from
// emailSender.ts).
export function getLanIPv4(): string {
  const interfaces = Object.entries(networkInterfaces());

  const wifiOrEthernet = interfaces.find(([name]) => /wi-?fi|wireless|ethernet/i.test(name));
  const wifiAddress = wifiOrEthernet?.[1]?.find(
    (entry) => entry.family === 'IPv4' && !entry.internal,
  );
  if (wifiAddress) return wifiAddress.address;

  for (const [, entries] of interfaces) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return 'localhost';
}
