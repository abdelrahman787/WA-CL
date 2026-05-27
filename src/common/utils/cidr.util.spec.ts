import { extractIPv4FromOrigin, ipInCidr, ipToNumber, TAILSCALE_CIDR } from './cidr.util';

describe('cidr.util', () => {
  describe('ipToNumber', () => {
    it('converts a dotted quad', () => {
      expect(ipToNumber('1.2.3.4')).toBe((1 << 24) | (2 << 16) | (3 << 8) | 4);
    });
    it('rejects malformed input', () => {
      expect(ipToNumber('not.an.ip')).toBe(0);
      expect(ipToNumber('256.0.0.0')).toBe(0);
    });
  });

  describe('ipInCidr', () => {
    it('accepts a Tailscale address', () => {
      expect(ipInCidr('100.64.1.2', TAILSCALE_CIDR)).toBe(true);
      expect(ipInCidr('100.127.255.254', TAILSCALE_CIDR)).toBe(true);
    });
    it('rejects outside the Tailscale range', () => {
      expect(ipInCidr('100.128.0.0', TAILSCALE_CIDR)).toBe(false);
      expect(ipInCidr('192.168.1.1', TAILSCALE_CIDR)).toBe(false);
      expect(ipInCidr('10.0.0.1', TAILSCALE_CIDR)).toBe(false);
    });
    it('handles a /32 host route', () => {
      expect(ipInCidr('1.2.3.4', '1.2.3.4/32')).toBe(true);
      expect(ipInCidr('1.2.3.5', '1.2.3.4/32')).toBe(false);
    });
    it('rejects garbage cidr', () => {
      expect(ipInCidr('1.2.3.4', 'nope')).toBe(false);
    });
  });

  describe('extractIPv4FromOrigin', () => {
    it('returns null for hostname origins', () => {
      expect(extractIPv4FromOrigin('https://example.com')).toBeNull();
    });
    it('extracts ipv4 from origin with port', () => {
      expect(extractIPv4FromOrigin('http://100.64.0.1:2886')).toBe('100.64.0.1');
    });
    it('returns null for malformed input', () => {
      expect(extractIPv4FromOrigin('not a url')).toBeNull();
    });
  });
});
