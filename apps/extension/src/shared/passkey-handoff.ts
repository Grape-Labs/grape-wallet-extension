import {
  decryptText,
  type BiometricUnlockConfig,
  bytesToBase64,
  GRAPE_PASSKEY_WEB_HANDOFF_PATH,
  GRAPE_PASSKEY_WEB_HANDOFF_VERSION,
  passkeyWebHandoffCompletionSchema,
  passkeyWebHandoffSuccessPayloadSchema,
  type PasskeyWebHandoffRequest
} from '@grape/core';

const DEFAULT_PASSKEY_WEB_ORIGIN = 'https://wallet.grape.app';

function randomBase64(length: number): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(length)));
}

function buildFragment(request: PasskeyWebHandoffRequest): string {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(request)) {
    if (typeof rawValue === 'string' || typeof rawValue === 'number') {
      params.set(key, String(rawValue));
    }
  }

  return params.toString();
}

function resolvePasskeyWebOrigin(): string {
  const candidate = import.meta.env.VITE_GRAPE_PASSKEY_WEB_ORIGIN?.trim() || DEFAULT_PASSKEY_WEB_ORIGIN;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'https:') {
    throw new Error('The hosted passkey flow must use HTTPS.');
  }
  return parsed.origin;
}

function parseCompletionUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  const fragment = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
  const params = new URLSearchParams(fragment);
  const payload = {
    version: Number(params.get('version') ?? NaN),
    status: params.get('status'),
    state: params.get('state'),
    payload: params.get('payload')
      ? JSON.parse(params.get('payload') ?? 'null')
      : undefined,
    code: params.get('code'),
    message: params.get('message')
  };

  return passkeyWebHandoffCompletionSchema.parse(payload);
}

function ensureIdentityApi(): typeof chrome.identity {
  if (!chrome.identity?.launchWebAuthFlow || !chrome.identity.getRedirectURL) {
    throw new Error('Hosted passkey setup is not available in this extension build.');
  }

  return chrome.identity;
}

async function launchPasskeyWebFlow(request: PasskeyWebHandoffRequest) {
  const identity = ensureIdentityApi();
  const url = `${resolvePasskeyWebOrigin()}${GRAPE_PASSKEY_WEB_HANDOFF_PATH}#${buildFragment(request)}`;
  const redirectUrl = await identity.launchWebAuthFlow({
    url,
    interactive: true
  });

  if (!redirectUrl) {
    throw new Error('The hosted passkey flow did not return to the extension.');
  }

  const completion = parseCompletionUrl(redirectUrl);
  if (completion.state !== request.state) {
    throw new Error('The hosted passkey flow returned an invalid state.');
  }
  if (completion.status === 'error') {
    throw new Error(completion.message);
  }

  const decrypted = await decryptText(completion.payload, request.sessionKey);
  const payload = passkeyWebHandoffSuccessPayloadSchema.parse(JSON.parse(decrypted));
  if (payload.state !== request.state || payload.action !== request.action) {
    throw new Error('The hosted passkey flow returned an unexpected payload.');
  }

  return payload;
}

export function isHostedDeterministicPasskeyWalletSupported(): boolean {
  return !!chrome.identity?.launchWebAuthFlow && !!chrome.identity?.getRedirectURL;
}

export async function createHostedDeterministicPasskeyWalletSetup() {
  const identity = ensureIdentityApi();
  const state = crypto.randomUUID();
  const request = {
    version: GRAPE_PASSKEY_WEB_HANDOFF_VERSION as 1,
    action: 'create' as const,
    state,
    redirectUrl: identity.getRedirectURL('passkey-wallet'),
    sessionKey: randomBase64(32)
  };

  const payload = await launchPasskeyWebFlow(request);
  if (payload.action !== 'create') {
    throw new Error('The hosted passkey flow did not return wallet setup material.');
  }

  return payload;
}

export async function unlockWithHostedDeterministicPasskey(config: Extract<BiometricUnlockConfig, { mode: 'deterministic-passkey' }>) {
  const identity = ensureIdentityApi();
  const state = crypto.randomUUID();
  const request = {
    version: GRAPE_PASSKEY_WEB_HANDOFF_VERSION as 1,
    action: 'assert' as const,
    state,
    redirectUrl: identity.getRedirectURL('passkey-wallet'),
    sessionKey: randomBase64(32),
    credentialId: config.credentialId,
    credentialIdB64Url: config.credentialIdB64Url,
    rpId: config.rpId
  };

  const payload = await launchPasskeyWebFlow(request);
  if (payload.action !== 'assert') {
    throw new Error('The hosted passkey flow did not return an unlock result.');
  }

  return payload.vaultPassword;
}
