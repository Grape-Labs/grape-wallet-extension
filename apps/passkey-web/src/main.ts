import {
  base64ToBytes,
  bytesToBase64,
  derivePasskeyWalletMaterialFromPrf,
  encryptText,
  getPasskeyWalletPrfInput,
  GRAPE_PASSKEY_CANONICAL_RP_ID,
  GRAPE_PASSKEY_RP_NAME,
  GRAPE_PASSKEY_WEB_HANDOFF_VERSION,
  passkeyWebHandoffRequestSchema,
  passkeyWebHandoffSuccessPayloadSchema,
  type PasskeyWebHandoffCompletion
} from '@grape/core';

type AppState = {
  title: string;
  description: string;
  detail?: string;
  error?: string;
  busy: boolean;
  ready: boolean;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return base64ToBytes(`${normalized}${padding}`);
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return new Uint8Array(bytes) as unknown as BufferSource;
}

function resolveDeterministicRpId(): string | undefined {
  if (window.location.protocol !== 'https:') {
    return undefined;
  }

  const hostname = window.location.hostname.toLowerCase();
  if (hostname === GRAPE_PASSKEY_CANONICAL_RP_ID || hostname.endsWith(`.${GRAPE_PASSKEY_CANONICAL_RP_ID}`)) {
    return GRAPE_PASSKEY_CANONICAL_RP_ID;
  }

  return undefined;
}

function buildCreateOptions(rpId: string) {
  return {
    challenge: new Uint8Array(randomBytes(32)),
    rp: {
      name: GRAPE_PASSKEY_RP_NAME,
      id: rpId
    },
    user: {
      id: new Uint8Array(new TextEncoder().encode('grape:passkey-wallet')),
      name: 'wallet@grape',
      displayName: 'Grape passkey wallet'
    },
    pubKeyCredParams: [
      { type: 'public-key' as const, alg: -7 },
      { type: 'public-key' as const, alg: -257 }
    ],
    timeout: 60_000,
    authenticatorSelection: {
      authenticatorAttachment: 'platform' as const,
      residentKey: 'required' as const,
      userVerification: 'required' as const
    },
    attestation: 'none' as const
  };
}

function extractPrfFirst(results: AuthenticationExtensionsClientOutputs | undefined): Uint8Array | null {
  const prf = (results as { prf?: { results?: { first?: ArrayBuffer } } } | undefined)?.prf?.results?.first;
  return prf ? new Uint8Array(prf) : null;
}

async function evaluatePrf(credentialId: Uint8Array, rpId: string) {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: asBufferSource(randomBytes(32)),
      timeout: 60_000,
      userVerification: 'required',
      rpId,
      allowCredentials: [
        {
          id: asBufferSource(credentialId),
          type: 'public-key'
        }
      ],
      extensions: {
        prf: {
          eval: {
            first: asBufferSource(getPasskeyWalletPrfInput())
          }
        }
      }
    }
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('Passkey verification was cancelled.');
  }

  const prfBytes = extractPrfFirst(assertion.getClientExtensionResults());
  if (!prfBytes) {
    throw new Error('This authenticator did not return deterministic PRF output.');
  }

  return prfBytes;
}

function parseRequestFromHash() {
  const fragment = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(fragment);
  return passkeyWebHandoffRequestSchema.parse({
    version: Number(params.get('version') ?? NaN),
    action: params.get('action'),
    state: params.get('state'),
    redirectUrl: params.get('redirectUrl'),
    sessionKey: params.get('sessionKey'),
    credentialId: params.get('credentialId'),
    credentialIdB64Url: params.get('credentialIdB64Url'),
    rpId: params.get('rpId') ?? undefined
  });
}

async function redirectCompletion(completion: PasskeyWebHandoffCompletion) {
  const params = new URLSearchParams();
  params.set('version', String(completion.version));
  params.set('status', completion.status);
  params.set('state', completion.state);
  if (completion.status === 'success') {
    params.set('payload', JSON.stringify(completion.payload));
  } else {
    params.set('code', completion.code);
    params.set('message', completion.message);
  }

  const redirectUrl = currentRequest?.redirectUrl;
  if (!redirectUrl) {
    return;
  }

  window.location.assign(`${redirectUrl}#${params.toString()}`);
}

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) {
  throw new Error('App root is missing.');
}
const app = appRoot;

let currentRequest: ReturnType<typeof parseRequestFromHash> | null = null;
let currentState: AppState = {
  title: 'Grape passkey',
  description: 'Preparing the secure passkey handoff.',
  busy: false,
  ready: false
};

function render() {
  app.innerHTML = `
    <main class="shell">
      <section class="panel">
        <div class="eyebrow">Grape</div>
        <h1>${currentState.title}</h1>
        <p class="lead">${currentState.description}</p>
        ${currentState.detail ? `<p class="detail">${currentState.detail}</p>` : ''}
        ${currentState.error ? `<p class="error">${currentState.error}</p>` : ''}
        <div class="actions">
          ${currentState.ready ? `<button id="continue" ${currentState.busy ? 'disabled' : ''}>${currentState.busy ? 'Working…' : 'Continue with passkey'}</button>` : ''}
        </div>
      </section>
    </main>
  `;

  const button = document.querySelector<HTMLButtonElement>('#continue');
  if (button) {
    button.onclick = () => {
      void handleContinue();
    };
  }
}

function setState(nextState: Partial<AppState>) {
  currentState = {
    ...currentState,
    ...nextState
  };
  render();
}

async function handleContinue() {
  if (!currentRequest || currentState.busy) {
    return;
  }

  try {
    setState({
      busy: true,
      error: undefined,
      description: currentRequest.action === 'create' ? 'Creating the deterministic passkey wallet.' : 'Verifying the passkey and deriving the wallet secret.',
      detail: 'The passkey stays under the shared Grape RP and the result is returned to the extension in encrypted form.'
    });

    const rpId = currentRequest.action === 'assert' ? currentRequest.rpId || resolveDeterministicRpId() : resolveDeterministicRpId();
    if (!rpId) {
      throw new Error(`This page must be hosted under HTTPS on ${GRAPE_PASSKEY_CANONICAL_RP_ID}.`);
    }

    const successPayload =
      currentRequest.action === 'create'
        ? await (async () => {
            const credential = (await navigator.credentials.create({
              publicKey: buildCreateOptions(rpId)
            })) as PublicKeyCredential | null;

            if (!credential || !(credential.rawId instanceof ArrayBuffer)) {
              throw new Error('Passkey creation failed.');
            }

            const credentialId = new Uint8Array(credential.rawId);
            const prfBytes = await evaluatePrf(credentialId, rpId);
            const material = await derivePasskeyWalletMaterialFromPrf(prfBytes);

            return passkeyWebHandoffSuccessPayloadSchema.parse({
              version: GRAPE_PASSKEY_WEB_HANDOFF_VERSION,
              action: 'create',
              state: currentRequest.state,
              config: {
                mode: 'deterministic-passkey',
                credentialId: bytesToBase64(credentialId),
                credentialIdB64Url: bytesToBase64Url(credentialId),
                rpId,
                createdAt: Date.now()
              },
              mnemonicEntropy: bytesToBase64(material.mnemonicEntropy),
              vaultPassword: material.vaultPassword
            });
          })()
        : await (async () => {
            const credentialId = currentRequest.credentialIdB64Url
              ? base64UrlToBytes(currentRequest.credentialIdB64Url)
              : base64ToBytes(currentRequest.credentialId);
            const prfBytes = await evaluatePrf(credentialId, rpId);
            const material = await derivePasskeyWalletMaterialFromPrf(prfBytes);

            return passkeyWebHandoffSuccessPayloadSchema.parse({
              version: GRAPE_PASSKEY_WEB_HANDOFF_VERSION,
              action: 'assert',
              state: currentRequest.state,
              vaultPassword: material.vaultPassword
            });
          })();

    const encryptedPayload = await encryptText(JSON.stringify(successPayload), currentRequest.sessionKey);
    await redirectCompletion({
      version: GRAPE_PASSKEY_WEB_HANDOFF_VERSION,
      status: 'success',
      state: currentRequest.state,
      payload: encryptedPayload
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete the passkey flow.';
    setState({
      busy: false,
      error: message
    });
    await redirectCompletion({
      version: GRAPE_PASSKEY_WEB_HANDOFF_VERSION,
      status: 'error',
      state: currentRequest.state,
      code: 'PASSKEY_FLOW_FAILED',
      message
    });
  }
}

async function init() {
  try {
    currentRequest = parseRequestFromHash();
    const platformAvailable =
      typeof PublicKeyCredential !== 'undefined' &&
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!platformAvailable) {
      throw new Error('A platform authenticator is not available on this device.');
    }

    setState({
      title: currentRequest.action === 'create' ? 'Create passkey wallet' : 'Unlock with passkey',
      description:
        currentRequest.action === 'create'
          ? 'Create the shared Grape passkey that deterministically derives this wallet.'
          : 'Verify the shared Grape passkey to derive the same wallet secret again.',
      detail: 'This step runs on wallet.grape.app so the passkey stays bound to the shared RP used across Grape clients.',
      ready: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start the passkey flow.';
    setState({
      title: 'Passkey unavailable',
      description: 'This hosted passkey flow could not be started.',
      error: message,
      ready: false
    });
  }
}

const style = document.createElement('style');
style.textContent = `
  :root {
    color-scheme: dark;
    font-family: "SF Pro Display", "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at top, rgba(114, 231, 193, 0.18), transparent 32%),
      linear-gradient(160deg, #081018 0%, #101826 48%, #04070d 100%);
    color: #f5f7fb;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-height: 100vh;
  }

  .shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .panel {
    width: min(100%, 440px);
    padding: 28px;
    border-radius: 24px;
    background: rgba(10, 17, 27, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(18px);
  }

  .eyebrow {
    font-size: 12px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #72e7c1;
    margin-bottom: 14px;
  }

  h1 {
    margin: 0 0 12px;
    font-size: 34px;
    line-height: 1;
  }

  p {
    margin: 0;
  }

  .lead {
    color: rgba(245, 247, 251, 0.88);
    line-height: 1.6;
  }

  .detail {
    margin-top: 12px;
    color: rgba(194, 203, 217, 0.82);
    line-height: 1.55;
  }

  .error {
    margin-top: 16px;
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(135, 22, 47, 0.3);
    border: 1px solid rgba(255, 120, 146, 0.34);
    color: #ffd6df;
  }

  .actions {
    margin-top: 22px;
  }

  button {
    appearance: none;
    border: 0;
    border-radius: 999px;
    padding: 14px 18px;
    background: linear-gradient(135deg, #7cebc7 0%, #4cc0ff 100%);
    color: #07111c;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    min-width: 220px;
  }

  button:disabled {
    opacity: 0.7;
    cursor: progress;
  }
`;
document.head.append(style);

void init();
