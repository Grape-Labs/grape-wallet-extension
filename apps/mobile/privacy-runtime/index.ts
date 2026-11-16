// This entry is bundled locally, never downloaded into the wallet.
import { base64ToBytes } from '@grape/core';
import { initializePrivacyRuntime, readPrivacyWallet, preparePrivacyTransaction, inspectPrivacyTransaction, signPrivacyTransaction } from '@grape/solana/privacy';
import { redactRpcDetails } from '@grape/core';
const bridge = () => (window as unknown as { ReactNativeWebView: { postMessage(value: string): void } }).ReactNativeWebView;
const send = (value: unknown) => bridge().postMessage(JSON.stringify(value));
let busy = false;
(window as unknown as { grapePrivacy: (request: string) => Promise<void> }).grapePrivacy = async raw => {
  const request = JSON.parse(raw);
  let seed: Uint8Array | undefined;
  if (busy) { send({ id: request.id, error: 'Privacy operation already running.' }); return; }
  busy = true;
  try {
    seed = base64ToBytes(request.seed);
    request.seed = '';
    const input = { endpoint: request.endpoint, network: 'mainnet-beta' as const, owner: request.owner, seed };
    let result: unknown;
    if (request.operation === 'sync') result = await readPrivacyWallet(input);
    else if (request.operation === 'prepare') {
      const action = request.action;
      if (!['register', 'deposit', 'transfer', 'withdraw'].includes(action?.action)) throw new Error('Choose a valid privacy action.');
      const transaction = await preparePrivacyTransaction({ ...input, action: action.action, amount: action.amount, recipient: action.recipient });
      result = { transaction, ...await inspectPrivacyTransaction(input.endpoint, transaction, input.owner) };
    } else if (request.operation === 'sign') result = await signPrivacyTransaction(request.transaction, seed, input.owner);
    else throw new Error('Unknown privacy operation.');
    send({ id: request.id, result });
  } catch (error) { send({ id: request.id, error: redactRpcDetails(error instanceof Error ? error.message : 'Privacy operation failed.') }); }
  finally { seed?.fill(0); busy = false; }
};
void (async () => {
  try {
    if (!globalThis.crypto?.subtle || typeof WebAssembly === 'undefined') throw new Error('Private balances require browser cryptography on this device.');
    // Ed25519 must be supported before setup or deposits are offered.
    await crypto.subtle.importKey('raw', new Uint8Array(32), { name: 'Ed25519' }, false, ['verify']);
    await initializePrivacyRuntime();
    send({ ready: true });
  } catch { send({ fatal: 'Private balances are unavailable on this OS version. Update your device and try again.' }); }
})();
