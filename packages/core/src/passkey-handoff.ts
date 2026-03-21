import { z } from 'zod';

import type { EncryptedPayload } from './crypto';

export const GRAPE_PASSKEY_WEB_HANDOFF_VERSION = 1;
export const GRAPE_PASSKEY_WEB_HANDOFF_PATH = '/extension-passkey.html';

const encryptedPayloadSchema = z.object({
  algorithm: z.literal('AES-GCM'),
  kdf: z.literal('PBKDF2'),
  iterations: z.number().int().positive(),
  salt: z.string().min(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1)
});

const deterministicPasskeyConfigSchema = z.object({
  mode: z.literal('deterministic-passkey'),
  credentialId: z.string().min(1),
  credentialIdB64Url: z.string().min(1),
  rpId: z.string().min(1).optional(),
  createdAt: z.number().int().positive()
});

export const passkeyWebHandoffRequestSchema = z.discriminatedUnion('action', [
  z.object({
    version: z.literal(GRAPE_PASSKEY_WEB_HANDOFF_VERSION),
    action: z.literal('create'),
    state: z.string().min(1),
    redirectUrl: z.string().url(),
    sessionKey: z.string().min(1)
  }),
  z.object({
    version: z.literal(GRAPE_PASSKEY_WEB_HANDOFF_VERSION),
    action: z.literal('assert'),
    state: z.string().min(1),
    redirectUrl: z.string().url(),
    sessionKey: z.string().min(1),
    credentialId: z.string().min(1),
    credentialIdB64Url: z.string().min(1),
    rpId: z.string().min(1).optional()
  })
]);

export const passkeyWebHandoffSuccessPayloadSchema = z.discriminatedUnion('action', [
  z.object({
    version: z.literal(GRAPE_PASSKEY_WEB_HANDOFF_VERSION),
    action: z.literal('create'),
    state: z.string().min(1),
    config: deterministicPasskeyConfigSchema,
    mnemonicEntropy: z.string().min(1),
    vaultPassword: z.string().min(1)
  }),
  z.object({
    version: z.literal(GRAPE_PASSKEY_WEB_HANDOFF_VERSION),
    action: z.literal('assert'),
    state: z.string().min(1),
    vaultPassword: z.string().min(1)
  })
]);

export const passkeyWebHandoffCompletionSchema = z.discriminatedUnion('status', [
  z.object({
    version: z.literal(GRAPE_PASSKEY_WEB_HANDOFF_VERSION),
    status: z.literal('success'),
    state: z.string().min(1),
    payload: encryptedPayloadSchema
  }),
  z.object({
    version: z.literal(GRAPE_PASSKEY_WEB_HANDOFF_VERSION),
    status: z.literal('error'),
    state: z.string().min(1),
    code: z.string().min(1),
    message: z.string().min(1)
  })
]);

export type PasskeyWebHandoffRequest = z.infer<typeof passkeyWebHandoffRequestSchema>;
export type PasskeyWebHandoffSuccessPayload = z.infer<typeof passkeyWebHandoffSuccessPayloadSchema>;
export type PasskeyWebHandoffCompletion = z.infer<typeof passkeyWebHandoffCompletionSchema>;
export type DeterministicPasskeyHandoffConfig = z.infer<typeof deterministicPasskeyConfigSchema>;
export type PasskeyWebHandoffEncryptedPayload = EncryptedPayload;
