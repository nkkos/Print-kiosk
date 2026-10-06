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
// Virtual adapters whose names can still contain "Ethernet" — Windows names
// the WSL / Hyper-V switch "vEthernet (WSL ...)", which the old Wi-Fi/Ethernet
// match picked up first, handing phones an address they can't reach.
const VIRTUAL_ADAPTER =
  /vethernet|wsl|hyper-?v|virtualbox|vmware|docker|vpn|hamachi|radmin|tailscale|zerotier|bluetooth|loopback/i;

export function getLanIPv4(): string {
  // Manual override for a machine where the guess is still wrong.
  if (process.env.LAN_HOST) return process.env.LAN_HOST;

  const interfaces = Object.entries(networkInterfaces()).filter(
    ([name]) => !VIRTUAL_ADAPTER.test(name),
  );
  const ipv4Of = (name: string) =>
    interfaces
      .find(([candidate]) => candidate === name)?.[1]
      ?.find((entry) => entry.family === 'IPv4' && !entry.internal)?.address;

  // Wi-Fi first (what a phone is on), then wired.
  for (const pattern of [/wi-?fi|wireless|wlan/i, /ethernet|^eth|^en/i]) {
    for (const [name] of interfaces) {
      if (!pattern.test(name)) continue;
      const address = ipv4Of(name);
      if (address) return address;
    }
  }

  for (const [name] of interfaces) {
    const address = ipv4Of(name);
    if (address) return address;
  }
  return 'localhost';
}

/** This backend's address as another device (a phone scanning a QR code)
 * reaches it: the Railway public domain when deployed, else this machine's
 * LAN IP — the same rule GET /api/config hands the stand for QR upload
 * links (server/routes.ts), also used for receipt links
 * (server/fiscalReceiptStore.ts). */
export function publicBackendUrl(): string {
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) return `https://${railwayDomain}`;
  return `http://${getLanIPv4()}:${Number(process.env.PORT ?? 3001)}`;
}

/** Where the portal (and the shop/business mini-apps next to it) is served:
 * PORTAL_URL when deployed, else this machine's LAN IP at Vite's port. */
export function portalBaseUrl(): string {
  return process.env.PORTAL_URL ?? `http://${getLanIPv4()}:5173`;
}
