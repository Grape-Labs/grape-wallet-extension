import { z } from 'zod';

const bytesSchema = z.string().min(1);

export const pageOriginSchema = z.object({
  origin: z.string().url(),
  href: z.string().url(),
  title: z.string().optional(),
  faviconUrl: z.string().url().optional()
});

export const providerRequestSchema = z.discriminatedUnion('method', [
  z.object({
    id: z.string(),
    method: z.literal('connect'),
    origin: pageOriginSchema,
    params: z.object({
      silent: z.boolean().optional()
    }).default({})
  }),
  z.object({
    id: z.string(),
    method: z.literal('disconnect'),
    origin: pageOriginSchema,
    params: z.object({}).default({})
  }),
  z.object({
    id: z.string(),
    method: z.literal('signMessage'),
    origin: pageOriginSchema,
    params: z.object({
      message: bytesSchema
    })
  }),
  z.object({
    id: z.string(),
    method: z.literal('signTransaction'),
    origin: pageOriginSchema,
    params: z.object({
      transaction: bytesSchema
    })
  }),
  z.object({
    id: z.string(),
    method: z.literal('signAllTransactions'),
    origin: pageOriginSchema,
    params: z.object({
      transactions: z.array(bytesSchema).min(1)
    })
  }),
  z.object({
    id: z.string(),
    method: z.literal('signAndSendTransaction'),
    origin: pageOriginSchema,
    params: z.object({
      transaction: bytesSchema
    })
  })
]);

export const providerResponseSchema = z.object({
  id: z.string(),
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string()
  }).optional()
});

export const runtimeMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('wallet_get_state')
  }),
  z.object({
    type: z.literal('wallet_create'),
    mnemonic: z.string(),
    password: z.string(),
    publicKey: z.string()
  }),
  z.object({
    type: z.literal('wallet_import'),
    mnemonic: z.string(),
    password: z.string(),
    publicKey: z.string()
  }),
  z.object({
    type: z.literal('wallet_unlock'),
    password: z.string()
  }),
  z.object({
    type: z.literal('wallet_lock')
  }),
  z.object({
    type: z.literal('wallet_set_network'),
    network: z.enum(['mainnet-beta', 'devnet'])
  }),
  z.object({
    type: z.literal('wallet_set_idle_timeout'),
    idleTimeoutMs: z.number().int().positive()
  }),
  z.object({
    type: z.literal('wallet_get_balance')
  }),
  z.object({
    type: z.literal('wallet_get_assets')
  }),
  z.object({
    type: z.literal('wallet_list_permissions')
  }),
  z.object({
    type: z.literal('wallet_revoke_permission'),
    origin: z.string().url()
  }),
  z.object({
    type: z.literal('approval_get'),
    approvalId: z.string()
  }),
  z.object({
    type: z.literal('approval_respond'),
    approvalId: z.string(),
    approved: z.boolean(),
    password: z.string().optional()
  })
]);

export type PageOrigin = z.infer<typeof pageOriginSchema>;
export type ProviderRequest = z.infer<typeof providerRequestSchema>;
export type ProviderResponse = z.infer<typeof providerResponseSchema>;
export type RuntimeMessage = z.infer<typeof runtimeMessageSchema>;
