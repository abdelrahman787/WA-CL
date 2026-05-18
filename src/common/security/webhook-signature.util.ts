import * as crypto from 'crypto';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Generate HMAC-SHA256 signature for outbound webhook payloads.
 */
export function generateWebhookSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return `${SIGNATURE_PREFIX}${hmac.digest('hex')}`;
}

/**
 * Verify an incoming webhook signature (for consumers receiving OpenWA events).
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = generateWebhookSignature(
    typeof payload === 'string' ? payload : payload.toString('utf8'),
    secret,
  );

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
