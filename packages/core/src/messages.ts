import { z } from 'zod';

const bytesSchema = z.string().min(1);
const decimalAmountSchema = z.string().trim().regex(/^(?:\d+(?:\.\d+)?|\.\d+)$/, 'Amount must be a positive decimal value.');

const sendAssetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('sol')
  }),
  z.object({
    kind: z.literal('sui')
  }),
  z.object({
    kind: z.literal('mon')
  }),
  z.object({
    kind: z.literal('eth')
  }),
  z.object({
    kind: z.literal('sui-coin'),
    coinType: z.string().min(1),
    decimals: z.number().int().min(0).max(255)
  }),
  z.object({
    kind: z.literal('evm-token'),
    tokenAddress: z.string().min(42),
    decimals: z.number().int().min(0).max(255),
    symbol: z.string().min(1).max(32).optional()
  }),
  z.object({
    kind: z.literal('spl-token'),
    mint: z.string().min(32),
    decimals: z.number().int().min(0).max(255),
    programId: z.string().min(32),
    accountAddress: z.string().min(32).optional()
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

const bridgeQuoteResponseSchema = z
  .object({
    transactionRequest: z
      .object({
        to: z.string().optional(),
        data: z.string().optional(),
        value: z.string().optional()
      })
      .optional(),
    estimate: z
      .object({
        fromAmount: z.string().optional(),
        toAmount: z.string().optional(),
        toAmountMin: z.string().optional(),
        fromToken: z
          .object({
            symbol: z.string().optional(),
            decimals: z.number().optional()
          })
          .passthrough()
          .optional(),
        toToken: z
          .object({
            symbol: z.string().optional(),
            decimals: z.number().optional()
          })
          .passthrough()
          .optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export const pageOriginSchema = z.object({
  origin: z.string().url(),
  href: z.string().url(),
  title: z.string().optional(),
  faviconUrl: z.string().url().optional()
});

const monadTransactionRequestSchema = z.object({
  from: z.string().min(2).optional(),
  to: z.string().min(2).optional(),
  data: z.string().min(2).optional(),
  value: z.string().min(1).optional(),
  gas: z.string().min(1).optional(),
  gasPrice: z.string().min(1).optional(),
  maxFeePerGas: z.string().min(1).optional(),
  maxPriorityFeePerGas: z.string().min(1).optional(),
  nonce: z.string().min(1).optional(),
  chainId: z.string().min(1).optional()
});

const monadAddChainSchema = z.object({
  chainId: z.string().min(1),
  chainName: z.string().min(1).optional(),
  rpcUrls: z.array(z.string().url()).optional(),
  blockExplorerUrls: z.array(z.string().url()).optional(),
  nativeCurrency: z
    .object({
      name: z.string().min(1),
      symbol: z.string().min(1),
      decimals: z.number().int().min(0).max(255)
    })
    .optional()
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
  }),
  z.object({
    id: z.string(),
    method: z.literal('sui_connect'),
    origin: pageOriginSchema,
    params: z
      .object({
        silent: z.boolean().optional()
      })
      .default({})
  }),
  z.object({
    id: z.string(),
    method: z.literal('sui_disconnect'),
    origin: pageOriginSchema,
    params: z.object({}).default({})
  }),
  z.object({
    id: z.string(),
    method: z.literal('sui_getAccounts'),
    origin: pageOriginSchema,
    params: z.object({}).default({})
  }),
  z.object({
    id: z.string(),
    method: z.literal('sui_signPersonalMessage'),
    origin: pageOriginSchema,
    params: z.object({
      message: bytesSchema
    })
  }),
  z.object({
    id: z.string(),
    method: z.literal('sui_signTransaction'),
    origin: pageOriginSchema,
    params: z.object({
      transaction: bytesSchema
    })
  }),
  z.object({
    id: z.string(),
    method: z.literal('sui_signAndExecuteTransaction'),
    origin: pageOriginSchema,
    params: z.object({
      transaction: bytesSchema
    })
  }),
  z.object({
    id: z.string(),
    method: z.literal('monad_accounts'),
    origin: pageOriginSchema,
    params: z.object({}).default({})
  }),
  z.object({
    id: z.string(),
    method: z.literal('monad_requestAccounts'),
    origin: pageOriginSchema,
    params: z.object({}).default({})
  }),
  z.object({
    id: z.string(),
    method: z.literal('monad_chainId'),
    origin: pageOriginSchema,
    params: z.object({}).default({})
  }),
  z.object({
    id: z.string(),
    method: z.literal('monad_switchChain'),
    origin: pageOriginSchema,
    params: z.object({
      chainId: z.string().min(1)
    })
  }),
  z.object({
    id: z.string(),
    method: z.literal('monad_addChain'),
    origin: pageOriginSchema,
    params: monadAddChainSchema
  }),
  z.object({
    id: z.string(),
    method: z.literal('monad_sendTransaction'),
    origin: pageOriginSchema,
    params: z.object({
      transaction: monadTransactionRequestSchema
    })
  }),
  z.object({
    id: z.string(),
    method: z.literal('monad_signMessage'),
    origin: pageOriginSchema,
    params: z.object({
      message: z.string().min(1),
      address: z.string().min(2).optional()
    })
  }),
  z.object({
    id: z.string(),
    method: z.literal('monad_signTypedData'),
    origin: pageOriginSchema,
    params: z.object({
      address: z.string().min(2),
      typedData: z.string().min(2)
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
    publicKey: z.string(),
    biometricUnlockConfig: z
      .union([
        z.object({
          mode: z.literal('wrapped-password').optional(),
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
        }),
        z.object({
          mode: z.literal('deterministic-passkey'),
          credentialId: z.string().min(1),
          credentialIdB64Url: z.string().min(1),
          rpId: z.string().min(1).optional(),
          createdAt: z.number().int().positive()
        })
      ])
      .optional()
  }),
  z.object({
    type: z.literal('wallet_import'),
    mnemonic: z.string(),
    password: z.string(),
    publicKey: z.string(),
    biometricUnlockConfig: z
      .union([
        z.object({
          mode: z.literal('wrapped-password').optional(),
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
        }),
        z.object({
          mode: z.literal('deterministic-passkey'),
          credentialId: z.string().min(1),
          credentialIdB64Url: z.string().min(1),
          rpId: z.string().min(1).optional(),
          createdAt: z.number().int().positive()
        })
      ])
      .optional()
  }),
  z.object({
    type: z.literal('wallet_import_private_key'),
    chain: z.enum(['solana', 'sui', 'monad', 'ethereum']),
    privateKey: z.string().min(1),
    password: z.string(),
    publicKey: z.string()
  }),
  z.object({
    type: z.literal('wallet_import_ledger'),
    chain: z.enum(['solana', 'monad', 'ethereum']),
    derivationPath: z.string().min(1),
    password: z.string(),
    publicKey: z.string()
  }),
  z.object({
    type: z.literal('wallet_import_ledger_batch'),
    chain: z.enum(['solana', 'monad', 'ethereum']),
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
    chain: z.enum(['solana', 'sui', 'monad', 'ethereum']),
    publicKey: z.string().min(32)
  }),
  z.object({
    type: z.literal('wallet_scan_ledger_accounts'),
    chain: z.enum(['solana', 'monad', 'ethereum']),
    network: z.enum(['mainnet-beta', 'devnet']),
    count: z.number().int().positive().max(128).optional()
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
    type: z.literal('wallet_set_chain'),
    chain: z.enum(['solana', 'sui', 'monad', 'ethereum'])
  }),
  z.object({
    type: z.literal('wallet_set_theme'),
    theme: z.enum([
      'grape',
      'comic',
      'sunset',
      'matrix',
      'tron',
      'apple',
      'aurora',
      'champagne',
      'liquid-chrome',
      'obsidian'
    ])
  }),
  z.object({
    type: z.literal('wallet_set_privacy_mode'),
    enabled: z.boolean()
  }),
  z.object({
    type: z.literal('wallet_set_custom_rpc'),
    network: z.enum(['mainnet-beta', 'devnet']),
    rpcUrl: z.string().url().nullable()
  }),
  z.object({
    type: z.literal('wallet_set_sui_custom_rpc'),
    rpcUrl: z.string().url().nullable()
  }),
  z.object({
    type: z.literal('wallet_set_monad_custom_rpc'),
    rpcUrl: z.string().url().nullable()
  }),
  z.object({
    type: z.literal('wallet_set_ethereum_custom_rpc'),
    rpcUrl: z.string().url().nullable()
  }),
  z.object({
    type: z.literal('wallet_select'),
    walletId: z.string().min(1)
  }),
  z.object({
    type: z.literal('wallet_set_label'),
    walletId: z.string().min(1),
    name: z.string().trim().min(1).max(32)
  }),
  z.object({
    type: z.literal('wallet_remove'),
    walletId: z.string().min(1)
  }),
  z.object({
    type: z.literal('wallet_remove_recent_recipient'),
    address: z.string().trim().min(1)
  }),
  z.object({
    type: z.literal('wallet_set_idle_timeout'),
    idleTimeoutMs: z.number().int().positive()
  }),
  z.object({
    type: z.literal('wallet_set_reputation_spaces'),
    daoIds: z.array(z.string().trim().min(32)).max(64)
  }),
  z.object({
    type: z.literal('wallet_set_verification_spaces'),
    daoIds: z.array(z.string().trim().min(32)).max(64)
  }),
  z.object({
    type: z.literal('wallet_set_governance_daos'),
    daoIds: z.array(z.string().trim().min(32)).max(64)
  }),
  z.object({
    type: z.literal('wallet_set_biometric_unlock'),
    config: z
      .union([
        z.object({
          mode: z.literal('wrapped-password').optional(),
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
        }),
        z.object({
          mode: z.literal('deterministic-passkey'),
          credentialId: z.string().min(1),
          credentialIdB64Url: z.string().min(1),
          rpId: z.string().min(1).optional(),
          createdAt: z.number().int().positive()
        })
      ])
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
    type: z.literal('wallet_get_reputation')
  }),
  z.object({
    type: z.literal('wallet_get_verification')
  }),
  z.object({
    type: z.literal('wallet_refresh_access')
  }),
  z.object({
    type: z.literal('wallet_clear_access')
  }),
  z.object({
    type: z.literal('wallet_get_governance')
  }),
  z.object({
    type: z.literal('wallet_scan_governance_eligibility')
  }),
  z.object({
    type: z.literal('wallet_get_activity'),
    limit: z.number().int().min(1).max(100).optional()
  }),
  z.object({
    type: z.literal('wallet_cast_governance_vote'),
    daoId: z.string().trim().min(32),
    governanceProgramId: z.string().trim().min(32).optional(),
    governanceId: z.string().trim().min(32),
    proposalId: z.string().trim().min(32),
    proposalOwnerRecordId: z.string().trim().min(32),
    tokenOwnerRecordId: z.string().trim().min(32),
    governingTokenMint: z.string().trim().min(32),
    voteKind: z.enum(['approve', 'deny', 'abstain']),
    choiceRank: z.number().int().min(0).max(32).optional(),
    password: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal('wallet_preview_chain_token'),
    tokenAddress: z.string().min(42)
  }),
  z.object({
    type: z.literal('wallet_get_stake_accounts')
  }),
  z.object({
    type: z.literal('wallet_get_stake_validators')
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
    type: z.literal('wallet_get_bridge_quote'),
    amount: decimalAmountSchema,
    toChain: z.enum(['solana', 'sui', 'monad', 'ethereum']),
    destinationWalletId: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal('wallet_execute_bridge'),
    quoteResponse: bridgeQuoteResponseSchema,
    toChain: z.enum(['solana', 'sui', 'monad', 'ethereum']),
    destinationWalletId: z.string().min(1).optional(),
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
    type: z.literal('wallet_create_device_link_session'),
    password: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal('wallet_list_device_link_sessions')
  }),
  z.object({
    type: z.literal('wallet_delete_device_link_session'),
    sessionId: z.string().min(1)
  }),
  z.object({
    type: z.literal('wallet_import_device_link'),
    payload: z.string().min(1),
    pairingCode: z.string().min(4),
    password: z.string().min(8)
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
