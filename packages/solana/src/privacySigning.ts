const prefix = new TextEncoder().encode('TSPP/derive/');
const magic = Uint8Array.of(255, ...new TextEncoder().encode('solana offchain'));
const startsWith = (bytes: Uint8Array, value: Uint8Array) => value.every((byte, index) => bytes[index] === byte);

/** A signature over this payload is a privacy derivation seed, never a dapp signature. */
export function assertSafeSolanaMessage(message: Uint8Array): void {
  let payload = message;
  if (startsWith(message, magic) && message[16] === 0) {
    const count = message[50];
    const offset = 51 + 32 * count;
    const length = message[offset] | (message[offset + 1] << 8);
    if (message.length === offset + 2 + length) payload = message.subarray(offset + 2);
  }
  if (startsWith(payload, prefix)) throw new Error('Privacy key derivation messages cannot be signed for websites.');
}
