/**
 * Shared IPv4 CIDR helpers.
 *
 * Originally inlined in `auth.service.ts` for the API-key IP allow-list;
 * extracted here so the CORS handler in `main.ts` (and any future
 * caller) can reuse the same logic without duplicating the bit math.
 */

export function ipToNumber(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  let n = 0;
  for (const p of parts) {
    const v = parseInt(p, 10);
    if (Number.isNaN(v) || v < 0 || v > 255) return 0;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipToNumber(ip) & mask) === (ipToNumber(range) & mask);
}

/**
 * Tailscale tailnet IPv4 range — 100.64.0.0/10 (RFC 6598 CGNAT space).
 * Every node on a Tailscale tailnet receives an address in this block.
 */
export const TAILSCALE_CIDR = '100.64.0.0/10';

/**
 * Tries to pull a literal IPv4 out of an Origin header value
 * (e.g. `http://100.64.1.2:2886`). Returns null if the origin isn't a
 * direct IP (e.g. a DNS name).
 */
export function extractIPv4FromOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
    return null;
  } catch {
    return null;
  }
}
