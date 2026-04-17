import { createPrivateKey, createPublicKey } from 'node:crypto';
import { accessSync, constants, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const workspaceRoot = resolve(new URL('.', import.meta.url).pathname, '..');

function resolveMode(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === '--mode') {
      return argv[index + 1] || 'production';
    }
    if (entry.startsWith('--mode=')) {
      return entry.slice('--mode='.length) || 'production';
    }
  }
  return 'production';
}

function normalizeExtensionManifestKey(rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error('Chromium extension key cannot be empty.');
  }

  try {
    if (trimmed.includes('BEGIN PUBLIC KEY')) {
      return createPublicKey(trimmed)
        .export({ format: 'der', type: 'spki' })
        .toString('base64');
    }

    if (trimmed.includes('BEGIN PRIVATE KEY') || trimmed.includes('BEGIN RSA PRIVATE KEY')) {
      return createPublicKey(createPrivateKey(trimmed))
        .export({ format: 'der', type: 'spki' })
        .toString('base64');
    }

    const normalized = trimmed.replace(/\s+/g, '');
    createPublicKey({
      key: Buffer.from(normalized, 'base64'),
      format: 'der',
      type: 'spki'
    });
    return normalized;
  } catch {
    throw new Error(
      'Invalid Chromium extension key. Use a PEM public/private key or a base64-encoded SPKI public key.'
    );
  }
}

function shouldAllowEphemeralExtensionId(env) {
  const rawValue = env.GRAPE_ALLOW_EPHEMERAL_EXTENSION_ID?.trim().toLowerCase();
  return rawValue === '1' || rawValue === 'true' || rawValue === 'yes';
}

function resolveExtensionManifestKey(env) {
  const inlineKey = env.GRAPE_EXTENSION_KEY?.trim();
  const keyFile = env.GRAPE_EXTENSION_KEY_FILE?.trim();

  if (inlineKey && keyFile) {
    throw new Error('Set only one of GRAPE_EXTENSION_KEY or GRAPE_EXTENSION_KEY_FILE.');
  }

  if (keyFile) {
    const keyFilePath = resolve(workspaceRoot, keyFile);
    accessSync(keyFilePath, constants.R_OK);
    return normalizeExtensionManifestKey(readFileSync(keyFilePath, 'utf8'));
  }

  if (inlineKey) {
    return normalizeExtensionManifestKey(inlineKey);
  }

  return undefined;
}

const mode = resolveMode(process.argv.slice(2));
const env = {
  ...loadEnv(mode, workspaceRoot, ''),
  ...process.env
};
const extensionKey = resolveExtensionManifestKey(env);
const allowEphemeralExtensionId = shouldAllowEphemeralExtensionId(env);

if (!extensionKey && !allowEphemeralExtensionId) {
  throw new Error(
    'Missing Chromium extension key. Add GRAPE_EXTENSION_KEY_FILE=.extension-keys/grape-chromium.pem ' +
    'or GRAPE_EXTENSION_KEY=... to the repo-root .env so rebuilt zips keep the same extension ID. ' +
    'If you are updating an existing install, reuse the original key. If you intentionally want an ephemeral unpacked-only build, set GRAPE_ALLOW_EPHEMERAL_EXTENSION_ID=true.'
  );
}

console.log('Extension build preflight passed.');
