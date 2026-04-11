/**
 * Constant-time API key verification using HMAC comparison.
 *
 * Both the provided and expected keys are HMACed with a fixed salt,
 * producing fixed-length digests. The digests are then compared byte-by-byte
 * in constant time. This prevents timing side-channels that could leak
 * information about which characters of the key are correct.
 */
export async function verifyApiKey(
  provided: string,
  expected: string,
): Promise<boolean> {
  if (!provided || !expected) return false;

  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode('recall-mcp-hmac-comparison');

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const [sigProvided, sigExpected] = await Promise.all([
    crypto.subtle.sign('HMAC', hmacKey, encoder.encode(provided)),
    crypto.subtle.sign('HMAC', hmacKey, encoder.encode(expected)),
  ]);

  const a = new Uint8Array(sigProvided);
  const b = new Uint8Array(sigExpected);

  // Both are SHA-256 outputs, so always 32 bytes — but guard anyway.
  if (a.byteLength !== b.byteLength) return false;

  let mismatch = 0;
  for (let i = 0; i < a.byteLength; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}
