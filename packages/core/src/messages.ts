import { z } from 'zod';

const bytesSchema = z.string().min(1);
const decimalAmountSchema = z.string().trim().regex(/^\d+(\.\d+)?$/, 'Amount must be a positive decimal value.');

const sendAssetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('sol')
  }),
  z.object({
    kind: z.literal('spl-token'),
    mint: z.string().min(32),
    decimals: z.number().int().min(0).max(255),
    programId: z.string().min(32)
  })
]);

const jupiterQuoteResponseSchema = z
  .object({
    inputMint: z.string().min(32),
    inAmount: z.string().min(1),
    outputMint: z.string().min(32),
    outAmount: z.string().min(1),
    slippageBps: z.number().int().positive()
  })
  .passthrough();

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
  }),
  z.object({
    id: z.string(),
    method: z.literal('sendTransaction'),
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
    type: z.literal('wallet_import_private_key'),
    privateKey: z.string().min(1),
    password: z.string(),
    publicKey: z.string()
  }),
  z.object({
    type: z.literal('wallet_import_ledger'),
    derivationPath: z.string().min(1),
    password: z.string(),
    publicKey: z.string()
  }),
  z.object({
    type: z.literal('wallet_import_ledger_batch'),
    password: z.string(),
    accounts: z
      .array(
        z.object({
          derivationPath: z.string().min(1),
          publicKey: z.string().min(32)
        })
      )
      .min(1)
  }),
  z.object({
    type: z.literal('wallet_import_watch_only'),
    publicKey: z.string().min(32)
  }),
  z.object({
    type: z.literal('wallet_unlock'),
    password: z.string()
  }),
  z.object({
    type: z.literal('wallet_lock')
  }),
  z.object({
    type: z.literal('wallet_reset')
  }),
  z.object({
    type: z.literal('wallet_set_network'),
    network: z.enum(['mainnet-beta', 'devnet'])
  }),
  z.object({
    type: z.literal('wallet_set_theme'),
    theme: z.enum(['grape', 'comic', 'sunset', 'matrix', 'apple', 'aurora', 'champagne', 'liquid-chrome', 'obsidian'])
  }),
  z.object({
    type: z.literal('wallet_select'),
    walletId: z.string().min(1)
  }),
  z.object({
    type: z.literal('wallet_remove'),
    walletId: z.string().min(1)
  }),
  z.object({
    type: z.literal('wallet_set_idle_timeout'),
    idleTimeoutMs: z.number().int().positive()
  }),
  z.object({
    type: z.literal('wallet_set_biometric_unlock'),
    config: z
      .object({
        credentialId: z.string().min(1),
        credentialIdB64Url: z.string().min(1),
        keySalt: z.string().min(1),
        wrappedPassword: z.object({
          algorithm: z.literal('AES-GCM'),
          kdf: z.literal('PBKDF2'),
          iterations: z.number().int().positive(),
          salt: z.string().min(1),
          iv: z.string().min(1),
          ciphertext: z.string().min(1)
        }),
        createdAt: z.number().int().positive()
      })
      .nullable()
  }),
  z.object({
    type: z.literal('wallet_get_balance')
  }),
  z.object({
    type: z.literal('wallet_get_assets'),
    staleWhileRevalidate: z.boolean().optional()
  }),
  z.object({
    type: z.literal('wallet_get_stake_accounts')
  }),
  z.object({
    type: z.literal('wallet_get_token_details'),
    mint: z.string().min(32),
    accountAddress: z.string().min(32),
    programId: z.string().min(32)
  }),
  z.object({
    type: z.literal('wallet_stake_create'),
    amount: decimalAmountSchema,
    voteAccount: z.string().min(32),
    password: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal('wallet_stake_deactivate'),
    stakeAccount: z.string().min(32),
    password: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal('wallet_stake_withdraw'),
    stakeAccount: z.string().min(32),
    amount: decimalAmountSchema,
    password: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal('wallet_send_transfer'),
    recipient: z.string().min(32),
    amount: decimalAmountSchema,
    password: z.string().min(1).optional(),
    asset: sendAssetSchema
  }),
  z.object({
    type: z.literal('wallet_burn_token'),
    mint: z.string().min(32),
    accountAddress: z.string().min(32),
    amount: decimalAmountSchema,
    decimals: z.number().int().min(0).max(255),
    programId: z.string().min(32),
    password: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal('wallet_close_token_account'),
    mint: z.string().min(32),
    accountAddress: z.string().min(32),
    programId: z.string().min(32),
    password: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal('wallet_get_swap_quote'),
    amount: decimalAmountSchema,
    slippageBps: z.number().int().min(1).max(5000),
    inputAsset: sendAssetSchema,
    outputMint: z.string().min(32)
  }),
  z.object({
    type: z.literal('wallet_execute_swap'),
    quoteResponse: jupiterQuoteResponseSchema,
    password: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal('wallet_get_security_report')
  }),
  z.object({
    type: z.literal('wallet_run_incident_response'),
    safeWallet: z.string().min(32),
    reserveSol: decimalAmountSchema,
    password: z.string().min(1).optional(),
    revokeDelegates: z.boolean(),
    sweepSplTokens: z.boolean(),
    sweepSol: z.boolean(),
    rotateCloseAuthorities: z.boolean(),
    rotateMintAuthorities: z.boolean()
  }),
  z.object({
    type: z.literal('wallet_export_secret'),
    password: z.string().min(1)
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
export type SendAsset = z.infer<typeof sendAssetSchema>;
