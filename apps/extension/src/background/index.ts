import {
  createEmptyWalletState,
  createInitialSessionState,
  createVaultRecord,
  createPendingApproval,
  getSelectedWallet,
  grantPermissions,
  hasPermission,
  isSessionExpired,
  listPermissions,
  migrateWalletState,
  removeWalletProfile,
  rememberWalletRecipient,
  revokeOriginPermissions,
  runtimeMessageSchema,
  type SendAsset,
  type ProviderRequest,
  providerRequestSchema,
  RpcError,
  STORAGE_KEYS,
  type RuntimeMessage,
  type VaultSecret,
  unlockVaultRecord,
  verifyVaultPassword
} from '@grape/core';
import {
  buildBurnSplTokenTransaction,
  buildCloseTokenAccountTransaction,
  buildSolTransferTransaction,
  buildSplTokenTransferTransaction,
  createAssociatedTokenAccountInstruction,
  createRevokeInstruction,
  createSetAuthorityInstruction,
  createTransferCheckedInstruction,
  estimateLegacyTransactionFee,
  exportSolanaSoftwareWalletSecret,
  getAssociatedTokenAddress,
  resolveSolanaVaultSecret,
  parseDecimalAmount,
  TOKEN_AUTHORITY_TYPES,
  signAndSendLedgerTransaction,
  signAndSendLedgerSerializedTransaction,
  signAndSendSerializedTransaction,
  signLedgerSerializedTransaction,
  signLedgerSerializedTransactions,
  signAndSendTransaction,
  signMessageBytes,
  inspectTransaction,
  signSerializedTransaction,
  signSerializedTransactions
} from '@grape/solana';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

import type { ApprovalRecord, CollectionHolding, CollectibleItem, TokenHolding, WalletAssetsResponse } from '../shared/models';

import { filterCollectibleTokens, inferCollectibleMints, sortWalletTokens } from '../shared/assets';
import { ChromeStorageArea, permissionsStorage, sessionStorage, walletStateStorage } from '../shared/chrome';
import {
  createJupiterSwapTransaction,
  fetchJupiterPrices,
  fetchJupiterQuote,
  JUPITER_SOL_MINT,
  type JupiterQuoteResponse
} from '../shared/jupiter';
import { getRpcEndpoint } from '../shared/rpc';
import { fetchShyftCollections, fetchShyftWalletTokens, hasShyftApiKey } from '../shared/shyft';

const approvalsStorage = new ChromeStorageArea<Record<string, ApprovalRecord>>(chrome.storage.local, STORAGE_KEYS.approvals, {});
const assetCacheStorage = new ChromeStorageArea<Record<string, { cachedAt: number; data: WalletAssetsResponse }>>(
  chrome.storage.session,
  'grape:asset-cache',
  {}
);
type ActiveWalletSurface = {
  port: chrome.runtime.Port;
  surfaceId: string;
  page: string;
};

const activeWalletSurfacePorts = new Map<chrome.runtime.Port, ActiveWalletSurface>();
const TOKEN_PROGRAM_IDS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
] as const;
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const KNOWN_TOKEN_SYMBOLS: Record<string, string> = {
  [JUPITER_SOL_MINT]: 'SOL',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC'
};
const INCIDENT_BATCH_SIZE = 6;
const ASSET_CACHE_TTL_MS = 45_000;

type ParsedWalletTokenAccount = TokenHolding & {
  rawAmount: string;
};

type ControlledMintRecord = {
  mint: string;
  programId: string;
  name?: string;
  symbol?: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  controlsMintAuthority: boolean;
  controlsFreezeAuthority: boolean;
};

type ParsedMetaplexMetadata = {
  updateAuthority: string;
  mint: string;
  name: string | null;
  symbol: string | null;
  uri: string | null;
  sellerFeeBasisPoints: number | null;
};

type CollectibleMetadataHint = {
  name?: string;
  symbol?: string;
  imageUri?: string;
};

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  debug?: (payload: ProviderDebugPayload) => void;
};

type UnlockedSecretCache = Record<string, {
  secret: VaultSecret;
  unlockedAt: number;
}>;

type ProviderDebugPayload = {
  phase: string;
  requestId?: string;
  method?: ProviderRequest['method'];
  approvalId?: string;
  kind?: ApprovalRecord['kind'];
  origin?: string;
  network?: 'mainnet-beta' | 'devnet';
  success?: boolean;
  code?: string;
  message?: string;
};

class WalletController {
  private readonly pendingApprovals = new Map<string, PendingResolver>();
  private unlockedSecrets: UnlockedSecretCache = {};
  private readonly assetRefreshes = new Map<string, Promise<WalletAssetsResponse>>();

  private getAssetCacheKey(walletId: string, network: 'mainnet-beta' | 'devnet', publicKey: string) {
    return `${walletId}:${network}:${publicKey}`;
  }

  private async invalidateAssetCache(cacheKey?: string) {
    const cache = await assetCacheStorage.get();
    if (cacheKey) {
      if (!(cacheKey in cache)) {
        return;
      }
      delete cache[cacheKey];
    } else {
      for (const key of Object.keys(cache)) {
        delete cache[key];
      }
    }
    await assetCacheStorage.set(cache);
  }

  private async refreshAssetsCache(
    walletId: string,
    network: 'mainnet-beta' | 'devnet',
    publicKey: string
  ): Promise<WalletAssetsResponse> {
    const cacheKey = this.getAssetCacheKey(walletId, network, publicKey);
    const inFlight = this.assetRefreshes.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = (async () => {
      const owner = new PublicKey(publicKey);
      const connection = new Connection(getRpcEndpoint(network), 'confirmed');
      const [lamports, shyftMetadataResult, shyftCollectionsResult] = await Promise.all([
        connection.getBalance(owner),
        hasShyftApiKey() ? fetchShyftWalletTokens(network, publicKey).catch(() => ({})) : Promise.resolve({}),
        hasShyftApiKey() ? fetchShyftCollections(network, publicKey).catch(() => []) : Promise.resolve([])
      ]);

      const shyftMetadata = shyftMetadataResult as Record<string, { name?: string; symbol?: string; logoUri?: string }>;
      const collections = shyftCollectionsResult as CollectionHolding[];
      const tokens = (await this.scanWalletTokenAccounts(connection, owner, shyftMetadata)).filter((token) => Number(token.amount) > 0);
      const zeroDecimalTokens = tokens.filter((token) => token.decimals === 0);
      const mintSupplyEntries = await Promise.all(
        zeroDecimalTokens.map(async (token) => {
          try {
            const mintAccountInfo = await connection.getParsedAccountInfo(new PublicKey(token.mint), 'confirmed');
            const mintAccountData = mintAccountInfo.value?.data;
            if (!mintAccountData || typeof mintAccountData !== 'object' || !('parsed' in mintAccountData)) {
              return [token.mint, null] as const;
            }

            const parsedMint = mintAccountData.parsed;
            if (!parsedMint || typeof parsedMint !== 'object' || !('info' in parsedMint) || !parsedMint.info || typeof parsedMint.info !== 'object') {
              return [token.mint, null] as const;
            }

            const mintInfo = parsedMint.info as Record<string, unknown>;
            return [token.mint, { rawSupply: typeof mintInfo.supply === 'string' ? mintInfo.supply : null }] as const;
          } catch {
            return [token.mint, null] as const;
          }
        })
      );
      const mintSupplyMap = Object.fromEntries(mintSupplyEntries);
      const metadataExistenceEntries = await Promise.all(
        zeroDecimalTokens.map(async (token) => {
          try {
            const metadataPda = PublicKey.findProgramAddressSync(
              [new TextEncoder().encode('metadata'), METADATA_PROGRAM_ID.toBytes(), new PublicKey(token.mint).toBytes()],
              METADATA_PROGRAM_ID
            )[0];
            const metadataAccountInfo = await connection.getAccountInfo(metadataPda, 'confirmed');
            return [token.mint, !!metadataAccountInfo] as const;
          } catch {
            return [token.mint, false] as const;
          }
        })
      );
      const metadataExistenceMap = Object.fromEntries(metadataExistenceEntries);
      const inferredCollectibleMints = inferCollectibleMints(
        tokens.map((token) => ({
          ...token,
          rawSupply: mintSupplyMap[token.mint]?.rawSupply ?? null,
          hasMetadata: metadataExistenceMap[token.mint] ?? false
        }))
      );
      const tokenByMint = new Map(tokens.map((token) => [token.mint, token] as const));
      const mergedCollections = collections.map((collection) => ({
        ...collection,
        items: collection.items.map((item) => {
          const token = tokenByMint.get(item.mint);
          const metadata = shyftMetadata[item.mint];
          return {
            ...item,
            name: item.name ?? token?.name ?? metadata?.name,
            symbol: item.symbol ?? token?.symbol ?? metadata?.symbol,
            imageUri: item.imageUri ?? token?.logoUri ?? metadata?.logoUri,
            accountAddress: item.accountAddress ?? token?.accountAddress,
            programId: item.programId ?? token?.programId,
            collectionId: item.collectionId ?? collection.id,
            collectionName: item.collectionName ?? collection.name,
            collectionSymbol: item.collectionSymbol ?? collection.symbol
          };
        })
      }));
      const detectedCollectibleItems = tokens
        .filter((token) => inferredCollectibleMints.has(token.mint))
        .map((token) => ({
          mint: token.mint,
          name: token.name ?? token.symbol,
          symbol: token.symbol,
          imageUri: token.logoUri,
          accountAddress: token.accountAddress,
          programId: token.programId
        }));
      const collectibleMetadataHints = await fetchCollectibleMetadataHints(connection, [
        ...mergedCollections.flatMap((collection) => collection.items),
        ...detectedCollectibleItems
      ]);
      const enrichCollectibleItem = (item: CollectibleItem, collection?: CollectionHolding): CollectibleItem => {
        const hint = collectibleMetadataHints[item.mint];
        return {
          ...item,
          name: item.name ?? hint?.name,
          symbol: item.symbol ?? hint?.symbol,
          imageUri: item.imageUri ?? hint?.imageUri ?? collection?.imageUri
        };
      };
      const enrichedCollections = mergedCollections.map((collection) => {
        const items = collection.items.map((item) => enrichCollectibleItem(item, collection));
        return {
          ...collection,
          imageUri: collection.imageUri ?? items.find((item) => !!item.imageUri)?.imageUri,
          items
        };
      });
      const knownCollectionMints = new Set(enrichedCollections.flatMap((collection) => collection.items.map((item) => item.mint)));
      const fallbackCollectibleItems = detectedCollectibleItems
        .filter((item) => !knownCollectionMints.has(item.mint))
        .map((item) => enrichCollectibleItem(item));
      const finalCollections =
        fallbackCollectibleItems.length > 0
          ? [
              ...enrichedCollections,
              {
                id: 'grape-detected-collectibles',
                name: enrichedCollections.length > 0 ? 'Other Collectibles' : 'Collectibles',
                itemCount: fallbackCollectibleItems.length,
                imageUri: fallbackCollectibleItems[0]?.imageUri,
                items: fallbackCollectibleItems
              }
            ]
          : enrichedCollections;

      const fungibleTokens = filterCollectibleTokens(tokens, finalCollections, inferredCollectibleMints);

      let pricing: Record<string, { usdPrice: number | null; priceChange24h: number | null }> = {};
      try {
        pricing = await fetchJupiterPrices([JUPITER_SOL_MINT, ...fungibleTokens.map((token) => token.mint)]);
      } catch {
        pricing = {};
      }

      const nativeUsdPrice = pricing[JUPITER_SOL_MINT]?.usdPrice ?? null;
      const nativePriceChange24h = pricing[JUPITER_SOL_MINT]?.priceChange24h ?? null;
      const nativeValueUsd = nativeUsdPrice === null ? null : (lamports / 1_000_000_000) * nativeUsdPrice;
      const pricedTokens = fungibleTokens.map((token) => {
        const usdPrice = pricing[token.mint]?.usdPrice ?? null;
        return {
          ...token,
          priceUsd: usdPrice,
          valueUsd: usdPrice === null ? null : Number(token.amount) * usdPrice,
          priceChange24h: pricing[token.mint]?.priceChange24h ?? null
        };
      });
      const sortedTokens = sortWalletTokens(pricedTokens);
      const totalUsdValue = [nativeValueUsd, ...pricedTokens.map((token) => token.valueUsd ?? null)]
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .reduce((sum, value) => sum + value, 0);

      const result: WalletAssetsResponse = {
        lamports,
        tokens: sortedTokens,
        collections: finalCollections,
        totalUsdValue: Number.isFinite(totalUsdValue) ? totalUsdValue : null,
        nativePriceUsd: nativeUsdPrice,
        nativeValueUsd,
        nativePriceChange24h
      };

      const cache = await assetCacheStorage.get();
      cache[cacheKey] = {
        cachedAt: Date.now(),
        data: result
      };
      await assetCacheStorage.set(cache);

      return result;
    })().finally(() => {
      this.assetRefreshes.delete(cacheKey);
    });

    this.assetRefreshes.set(cacheKey, refreshPromise);
    return refreshPromise;
  }

  async getWalletState() {
    const raw = await walletStateStorage.get();
    const migrated = migrateWalletState(raw);
    if (JSON.stringify(raw) !== JSON.stringify(migrated)) {
      await walletStateStorage.set(migrated);
    }
    return migrated;
  }

  async getSessionState() {
    const wallet = await this.getWalletState();
    const session = await sessionStorage.get();
    const selectedWallet = getSelectedWallet(wallet);
    if (
      wallet.wallets.length > 0 &&
      (wallet.wallets.every((entry) => entry.signer.kind === 'watch-only') || selectedWallet?.signer.kind === 'watch-only')
    ) {
      if (session.locked) {
        const unlocked = {
          ...session,
          locked: false,
          lastActivityAt: Date.now()
        };
        await sessionStorage.set(unlocked);
        return unlocked;
      }
      return session;
    }
    if (isSessionExpired(session, wallet.idleTimeoutMs)) {
      this.unlockedSecrets = {};
      const locked = {
        ...session,
        locked: true
      };
      await sessionStorage.set(locked);
      return locked;
    }
    return session;
  }

  async setSessionState(partial: Partial<{ locked: boolean; lastActivityAt: number }>) {
    const current = await this.getSessionState();
    await sessionStorage.set({
      ...current,
      ...partial
    });
  }

  async ensureReadyWallet() {
    const wallet = await this.getWalletState();
    const selectedWallet = getSelectedWallet(wallet);
    if (wallet.setup !== 'ready' || !selectedWallet || !selectedWallet.selectedAccountId) {
      throw new RpcError('WALLET_NOT_READY', 'Wallet has not been created or imported yet.');
    }
    return {
      walletState: wallet,
      selectedWallet
    };
  }

  async createWallet(
    secret: VaultSecret,
    password: string | undefined,
    publicKey: string,
    signer: import('@grape/core').WalletSigner = { kind: 'software' },
    source: import('@grape/core').WalletProfile['source'] = signer.kind === 'ledger'
      ? 'ledger'
      : signer.kind === 'watch-only'
        ? 'watch-only'
      : secret.kind === 'private-key'
        ? 'imported-private-key'
        : 'created'
  ) {
    const account = {
      id: 'account-0',
      index: 0,
      publicKey,
      derivationPath:
        signer.kind === 'ledger'
          ? signer.derivationPath
          : signer.kind === 'watch-only'
            ? 'watch-only'
          : secret.kind === 'mnemonic'
            ? `m/44'/501'/0'/0'`
            : 'imported-private-key'
    };
    const current = await this.getWalletState();
    if (current.setup === 'ready' && signer.kind !== 'watch-only') {
      const passwordProtectedWallet = current.wallets.find((wallet) => !!wallet.vault);
      if (passwordProtectedWallet) {
        if (!password) {
          throw new RpcError('INVALID_PASSWORD', 'Use your existing wallet password to add another wallet.');
        }
        const valid = await verifyVaultPassword(passwordProtectedWallet.vault!, password);
        if (!valid) {
          throw new RpcError('INVALID_PASSWORD', 'Use your existing wallet password to add another wallet.');
        }
      }
    }

    const walletId = `wallet-${current.wallets.length + 1}`;
    const profile = {
      id: walletId,
      name: `Wallet ${current.wallets.length + 1}`,
      vault: signer.kind === 'watch-only' ? undefined : await createVaultRecord(secret, password ?? ''),
      signer,
      source,
      accounts: [account],
      selectedAccountId: account.id,
      recentRecipients: []
    };
    const nextState = {
      ...current,
      setup: 'ready' as const,
      wallets: [...current.wallets, profile],
      selectedWalletId: walletId
    };
    await walletStateStorage.set(nextState);
    if (signer.kind !== 'watch-only') {
      this.unlockedSecrets[walletId] = {
        secret,
        unlockedAt: Date.now()
      };
    }
    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    return nextState;
  }

  async unlockWallet(password: string) {
    const { walletState } = await this.ensureReadyWallet();
    const vaultWallets = walletState.wallets.filter((wallet) => !!wallet.vault);
    if (vaultWallets.length === 0) {
      await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
      return true;
    }
    const unlockedEntries = await Promise.all(
      vaultWallets.map(async (wallet) => {
        const secret = await unlockVaultRecord(wallet.vault!, password);
        return [wallet.id, secret] as const;
      })
    ).catch(() => null);

    if (!unlockedEntries) {
      throw new RpcError('INVALID_PASSWORD', 'Password is incorrect.');
    }
    this.unlockedSecrets = Object.fromEntries(
      unlockedEntries.map(([walletId, secret]) => [walletId, { secret, unlockedAt: Date.now() }])
    );
    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    return true;
  }

  async lockWallet() {
    this.unlockedSecrets = {};
    const walletState = await this.getWalletState();
    if (walletState.wallets.length > 0 && walletState.wallets.every((entry) => entry.signer.kind === 'watch-only')) {
      await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
      return true;
    }
    await this.setSessionState({ locked: true, lastActivityAt: 0 });
    return true;
  }

  async resetWallet() {
    this.unlockedSecrets = {};

    for (const [approvalId, pending] of this.pendingApprovals.entries()) {
      pending.reject(new RpcError('WALLET_RESET', 'Wallet was reset.'));
      this.pendingApprovals.delete(approvalId);
    }

    await Promise.all([
      walletStateStorage.set(createEmptyWalletState()),
      permissionsStorage.set({ origins: {} }),
      sessionStorage.set(createInitialSessionState()),
      approvalsStorage.set({}),
      assetCacheStorage.set({})
    ]);

    return this.getStateResponse();
  }

  async removeWallet(walletId: string) {
    const walletState = await this.getWalletState();
    const approvals = await approvalsStorage.get();
    const targetWallet = walletState.wallets.find((wallet) => wallet.id === walletId);
    if (!targetWallet) {
      throw new RpcError('WALLET_NOT_FOUND', 'Wallet could not be found.');
    }

    delete this.unlockedSecrets[walletId];

    for (const [approvalId, pending] of this.pendingApprovals.entries()) {
      const approval = approvals[approvalId];
      if (approval?.publicKey && targetWallet.accounts.some((account) => account.publicKey === approval.publicKey)) {
        pending.reject(new RpcError('WALLET_REMOVED', 'Wallet was removed.'));
        this.pendingApprovals.delete(approvalId);
      }
    }

    const nextState = removeWalletProfile(walletState, walletId);
    await walletStateStorage.set(nextState);
    await this.invalidateAssetCache();

    if (nextState.wallets.length === 0) {
      await this.setSessionState({ locked: true, lastActivityAt: 0 });
    }

    return this.getStateResponse();
  }

  async getActiveAccount() {
    const wallet = await this.getWalletState();
    const selectedWallet = getSelectedWallet(wallet);
    if (!selectedWallet) {
      return undefined;
    }
    return selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
  }

  async getStateResponse() {
    const [wallet, session, permissions, activeAccount] = await Promise.all([
      this.getWalletState(),
      this.getSessionState(),
      permissionsStorage.get(),
      this.getActiveAccount()
    ]);
    const activeWallet = getSelectedWallet(wallet);

    return {
      wallet,
      session,
      permissions: listPermissions(permissions),
      activeWallet:
        activeWallet && activeAccount
          ? {
              id: activeWallet.id,
              name: activeWallet.name,
              publicKey: activeAccount.publicKey,
              biometricEnabled: !!activeWallet.biometricUnlock,
              source: activeWallet.source,
              signerKind: activeWallet.signer.kind
            }
          : undefined,
      activeAccount: activeAccount ? { publicKey: activeAccount.publicKey } : undefined,
      recentRecipients: activeWallet?.recentRecipients ?? [],
      canUseUnlockedSigner: !!(activeWallet && activeWallet.signer.kind !== 'watch-only' && this.unlockedSecrets[activeWallet.id]) && !session.locked
    };
  }

  async setNetwork(network: 'mainnet-beta' | 'devnet') {
    const { walletState } = await this.ensureReadyWallet();
    await walletStateStorage.set({
      ...walletState,
      selectedNetwork: network
    });
    return this.getStateResponse();
  }

  async setTheme(theme: import('@grape/core').GrapeTheme) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      selectedTheme: theme
    });
    return this.getStateResponse();
  }

  async selectWallet(walletId: string) {
    const walletState = await this.getWalletState();
    const selectedWallet = walletState.wallets.find((wallet) => wallet.id === walletId);
    if (!selectedWallet) {
      throw new RpcError('WALLET_NOT_FOUND', 'Wallet could not be found.');
    }

    await walletStateStorage.set({
      ...walletState,
      selectedWalletId: walletId
    });
    return this.getStateResponse();
  }

  async setIdleTimeout(idleTimeoutMs: number) {
    const { walletState } = await this.ensureReadyWallet();
    await walletStateStorage.set({
      ...walletState,
      idleTimeoutMs
    });
    return this.getStateResponse();
  }

  async setBiometricUnlock(config: import('@grape/core').BiometricUnlockConfig | null) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    if (!selectedWallet.vault || selectedWallet.signer.kind === 'watch-only') {
      throw new RpcError('BIOMETRIC_UNAVAILABLE', 'Biometric unlock is only available for password-protected wallets.');
    }
    await walletStateStorage.set({
      ...walletState,
      wallets: walletState.wallets.map((wallet) =>
        wallet.id === selectedWallet.id
          ? {
              ...wallet,
              biometricUnlock: config ?? undefined
            }
          : wallet
      )
    });
    return this.getStateResponse();
  }

  async getBalanceLamports() {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      return null;
    }
    const connection = new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed');
    return connection.getBalance(new PublicKey(activeAccount.publicKey));
  }

  private assertInteractiveWallet(selectedWallet: NonNullable<ReturnType<typeof getSelectedWallet>>) {
    if (selectedWallet.signer.kind === 'watch-only') {
      throw new RpcError('WATCH_ONLY_WALLET', 'This wallet is watch-only and cannot sign messages or transactions.');
    }
  }

  private async scanWalletTokenAccounts(
    connection: Connection,
    owner: PublicKey,
    shyftMetadata: Record<string, { name?: string; symbol?: string; logoUri?: string }>
  ): Promise<ParsedWalletTokenAccount[]> {
    const tokenResponses = await Promise.all(
      TOKEN_PROGRAM_IDS.map((programId) =>
        connection.getParsedTokenAccountsByOwner(owner, {
          programId: new PublicKey(programId)
        })
      )
    );

    return tokenResponses.flatMap((response) =>
      response.value.map((accountInfo) => {
        const parsed = accountInfo.account.data.parsed.info;
        const tokenAmount = parsed.tokenAmount as {
          uiAmountString?: string;
          amount: string;
          decimals: number;
        };
        const delegatedAmount = parsed.delegatedAmount as { uiAmountString?: string; amount?: string } | undefined;
        const mint = parsed.mint as string;

        return {
          mint,
          amount: tokenAmount.uiAmountString ?? tokenAmount.amount,
          rawAmount: tokenAmount.amount,
          decimals: tokenAmount.decimals,
          programId: accountInfo.account.owner.toBase58(),
          accountAddress: accountInfo.pubkey.toBase58(),
          name: shyftMetadata[mint]?.name,
          symbol: shyftMetadata[mint]?.symbol ?? KNOWN_TOKEN_SYMBOLS[mint],
          logoUri: shyftMetadata[mint]?.logoUri,
          delegate: typeof parsed.delegate === 'string' ? parsed.delegate : null,
          delegatedAmount:
            delegatedAmount?.uiAmountString ??
            (typeof delegatedAmount?.amount === 'string' ? delegatedAmount.amount : null),
          closeAuthority: typeof parsed.closeAuthority === 'string' ? parsed.closeAuthority : null
        } satisfies ParsedWalletTokenAccount;
      })
    );
  }

  private async scanControlledMints(
    connection: Connection,
    walletPublicKey: string,
    tokens: ParsedWalletTokenAccount[],
    collections: CollectionHolding[]
  ): Promise<ControlledMintRecord[]> {
    const mintAddresses = Array.from(
      new Set([
        ...tokens.map((token) => token.mint),
        ...collections.flatMap((collection) => collection.items.map((item) => item.mint))
      ])
    );

    const mintAccounts = await Promise.all(
      mintAddresses.map(async (mint) => {
        const accountInfo = await connection.getParsedAccountInfo(new PublicKey(mint), 'confirmed');
        const parsedData = accountInfo.value?.data;
        if (!parsedData || typeof parsedData !== 'object' || !('parsed' in parsedData)) {
          return null;
        }

        const parsed = parsedData.parsed;
        if (!parsed || typeof parsed !== 'object' || !('info' in parsed) || !parsed.info || typeof parsed.info !== 'object') {
          return null;
        }

        const info = parsed.info as Record<string, unknown>;
        const mintAuthority = typeof info.mintAuthority === 'string' ? info.mintAuthority : null;
        const freezeAuthority = typeof info.freezeAuthority === 'string' ? info.freezeAuthority : null;
        const token = tokens.find((entry) => entry.mint === mint);

        const entry: ControlledMintRecord = {
          mint,
          programId: accountInfo.value?.owner.toBase58() ?? token?.programId ?? TOKEN_PROGRAM_IDS[0],
          name: token?.name,
          symbol: token?.symbol,
          mintAuthority,
          freezeAuthority,
          controlsMintAuthority: mintAuthority === walletPublicKey,
          controlsFreezeAuthority: freezeAuthority === walletPublicKey
        };

        return entry;
      })
    );

    return mintAccounts.filter(
      (entry): entry is ControlledMintRecord => !!entry && (entry.controlsMintAuthority || entry.controlsFreezeAuthority)
    );
  }

  private async submitTransactionForWallet(
    selectedWallet: NonNullable<ReturnType<typeof getSelectedWallet>>,
    activePublicKey: string,
    secret: VaultSecret,
    connection: Connection,
    transaction: Transaction
  ) {
    try {
      return selectedWallet.signer.kind === 'ledger'
        ? await signAndSendLedgerTransaction(transaction, activePublicKey, selectedWallet.signer.derivationPath, connection)
        : await signAndSendTransaction(transaction, resolveSolanaVaultSecret(secret), connection);
    } catch (error) {
      throw normalizeSigningError(error);
    } finally {
      await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    }
  }

  private async submitInstructionBatches(
    selectedWallet: NonNullable<ReturnType<typeof getSelectedWallet>>,
    activePublicKey: string,
    secret: VaultSecret,
    connection: Connection,
    owner: PublicKey,
    instructions: TransactionInstruction[],
    batchSize = INCIDENT_BATCH_SIZE
  ): Promise<string[]> {
    const signatures: string[] = [];

    for (let index = 0; index < instructions.length; index += batchSize) {
      const batch = instructions.slice(index, index + batchSize);
      if (batch.length === 0) {
        continue;
      }

      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      const transaction = new Transaction({
        feePayer: owner,
        recentBlockhash: blockhash
      });
      transaction.add(...batch);
      signatures.push(await this.submitTransactionForWallet(selectedWallet, activePublicKey, secret, connection, transaction));
    }

    return signatures;
  }

  async getAssets(options?: { staleWhileRevalidate?: boolean }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      return {
        lamports: null,
        tokens: []
      };
    }

    const cacheKey = this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
    const cache = await assetCacheStorage.get();
    const cached = cache[cacheKey];

    if (cached) {
      const stale = Date.now() - cached.cachedAt >= ASSET_CACHE_TTL_MS;
      if (!stale) {
        return {
          ...cached.data,
          cachedAt: cached.cachedAt,
          fromCache: true,
          stale: false
        };
      }

      if (options?.staleWhileRevalidate) {
        void this.refreshAssetsCache(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
        return {
          ...cached.data,
          cachedAt: cached.cachedAt,
          fromCache: true,
          stale: true
        };
      }
    }

    return this.refreshAssetsCache(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
  }

  async getTokenDetails(input: { mint: string; accountAddress: string; programId: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const connection = new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed');
    const [shyftMetadataResult, tokenAccountInfo, mintAccountInfo] = await Promise.all([
      hasShyftApiKey()
        ? fetchShyftWalletTokens(walletState.selectedNetwork, activeAccount.publicKey).catch(() => ({}))
        : Promise.resolve({}),
      connection.getParsedAccountInfo(new PublicKey(input.accountAddress), 'confirmed'),
      connection.getParsedAccountInfo(new PublicKey(input.mint), 'confirmed')
    ]);

    const shyftMetadata = shyftMetadataResult as Record<string, { name?: string; symbol?: string; logoUri?: string }>;
    const tokenAccountData = tokenAccountInfo.value?.data;
    const mintAccountData = mintAccountInfo.value?.data;

    if (!tokenAccountData || typeof tokenAccountData !== 'object' || !('parsed' in tokenAccountData)) {
      throw new RpcError('TOKEN_NOT_FOUND', 'Token account could not be loaded.');
    }

    const parsedToken = tokenAccountData.parsed;
    if (!parsedToken || typeof parsedToken !== 'object' || !('info' in parsedToken) || !parsedToken.info || typeof parsedToken.info !== 'object') {
      throw new RpcError('TOKEN_NOT_FOUND', 'Token account could not be parsed.');
    }

    const tokenInfo = parsedToken.info as Record<string, unknown>;
    const tokenAmount = tokenInfo.tokenAmount as { uiAmountString?: string; amount: string; decimals: number };
    const delegatedAmount = tokenInfo.delegatedAmount as { uiAmountString?: string; amount?: string } | undefined;

    let supply: string | null = null;
    let rawSupply: string | null = null;
    let mintInitialized: boolean | null = null;
    let mintAuthority: string | null = null;
    let freezeAuthority: string | null = null;

    if (mintAccountData && typeof mintAccountData === 'object' && 'parsed' in mintAccountData) {
      const parsedMint = mintAccountData.parsed;
      if (parsedMint && typeof parsedMint === 'object' && 'info' in parsedMint && parsedMint.info && typeof parsedMint.info === 'object') {
        const mintInfo = parsedMint.info as Record<string, unknown>;
        rawSupply = typeof mintInfo.supply === 'string' ? mintInfo.supply : null;
        supply =
          typeof rawSupply === 'string' && typeof tokenAmount.decimals === 'number'
            ? formatUiAmount(rawSupply, tokenAmount.decimals)
            : null;
        mintInitialized = typeof mintInfo.isInitialized === 'boolean' ? mintInfo.isInitialized : null;
        mintAuthority = typeof mintInfo.mintAuthority === 'string' ? mintInfo.mintAuthority : null;
        freezeAuthority = typeof mintInfo.freezeAuthority === 'string' ? mintInfo.freezeAuthority : null;
      }
    }

    const metadataPda = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode('metadata'), METADATA_PROGRAM_ID.toBytes(), new PublicKey(input.mint).toBytes()],
      METADATA_PROGRAM_ID
    )[0].toBase58();
    const metadataAccountInfo = await connection.getAccountInfo(new PublicKey(metadataPda), 'confirmed');
    const parsedMetadata = metadataAccountInfo?.data ? parseMetaplexMetadataAccount(metadataAccountInfo.data) : null;

    return {
      mint: input.mint,
      programId: input.programId,
      accountAddress: input.accountAddress,
      name: shyftMetadata[input.mint]?.name ?? parsedMetadata?.name ?? undefined,
      symbol: shyftMetadata[input.mint]?.symbol ?? parsedMetadata?.symbol ?? KNOWN_TOKEN_SYMBOLS[input.mint],
      logoUri: shyftMetadata[input.mint]?.logoUri,
      amount: tokenAmount.uiAmountString ?? tokenAmount.amount,
      rawAmount: tokenAmount.amount,
      decimals: tokenAmount.decimals,
      supply,
      rawSupply,
      mintInitialized,
      mintAuthority,
      freezeAuthority,
      delegate: typeof tokenInfo.delegate === 'string' ? tokenInfo.delegate : null,
      delegatedAmount:
        delegatedAmount?.uiAmountString ?? (typeof delegatedAmount?.amount === 'string' ? delegatedAmount.amount : null),
      closeAuthority: typeof tokenInfo.closeAuthority === 'string' ? tokenInfo.closeAuthority : null,
      accountState: typeof tokenInfo.state === 'string' ? tokenInfo.state : null,
      metadataPda,
      metadataName: parsedMetadata?.name ?? null,
      metadataSymbol: parsedMetadata?.symbol ?? null,
      metadataUri: parsedMetadata?.uri ?? null,
      sellerFeeBasisPoints: parsedMetadata?.sellerFeeBasisPoints ?? null,
      updateAuthority: parsedMetadata?.updateAuthority ?? null
    };
  }

  async revokePermission(origin: string) {
    const permissions = await permissionsStorage.get();
    await permissionsStorage.set(revokeOriginPermissions(permissions, origin));
    return this.getStateResponse();
  }

  async exportWalletSecret(password: string) {
    const { selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    if (selectedWallet.signer.kind !== 'software') {
      throw new RpcError('EXPORT_UNAVAILABLE', 'Only software wallets can be exported from Grape.');
    }
    if (!selectedWallet.vault) {
      throw new RpcError('EXPORT_UNAVAILABLE', 'This wallet does not have an exportable local vault.');
    }

    const secret = await unlockVaultRecord(selectedWallet.vault, password).catch(() => {
      throw new RpcError('INVALID_PASSWORD', 'Password is incorrect.');
    });
    const exported = exportSolanaSoftwareWalletSecret(secret);

    if (exported.publicKey !== activeAccount.publicKey) {
      throw new RpcError('EXPORT_FAILED', 'Exported wallet does not match the selected account.');
    }

    return {
      walletId: selectedWallet.id,
      walletName: selectedWallet.name,
      publicKey: exported.publicKey,
      derivationPath: exported.derivationPath,
      kind: exported.kind,
      privateKeyBase58: exported.privateKeyBase58,
      mnemonic: exported.mnemonic
    };
  }

  async sendTransfer(input: { recipient: string; amount: string; password?: string; asset: SendAsset }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed');
    const owner = new PublicKey(activeAccount.publicKey);

    const transaction =
      input.asset.kind === 'sol'
        ? await buildSolTransferTransaction(connection, owner, {
            recipient: input.recipient,
            amount: input.amount
          })
        : await buildSplTokenTransferTransaction(connection, owner, {
            recipient: input.recipient,
            amount: input.amount,
            mint: input.asset.mint,
            decimals: input.asset.decimals,
            programId: input.asset.programId
          });

    if (input.asset.kind === 'sol') {
      const [balanceLamports, feeLamports] = await Promise.all([
        connection.getBalance(owner, 'confirmed'),
        estimateLegacyTransactionFee(connection, transaction)
      ]);
      const transferLamports = parseDecimalAmount(input.amount, 9);
      const requiredLamports = transferLamports + BigInt(feeLamports);
      if (BigInt(balanceLamports) < requiredLamports) {
        throw new RpcError(
          'INSUFFICIENT_FUNDS',
          `Not enough SOL. You need ${(Number(requiredLamports) / 1_000_000_000).toFixed(9)} SOL including network fee, but only ${(balanceLamports / 1_000_000_000).toFixed(9)} SOL is available.`
        );
      }
    }

    let signature: string;
    try {
      signature =
        selectedWallet.signer.kind === 'ledger'
          ? await signAndSendLedgerTransaction(
              transaction,
              activeAccount.publicKey,
              selectedWallet.signer.derivationPath,
              connection
            )
          : await signAndSendTransaction(transaction, resolveSolanaVaultSecret(secret), connection);
    } catch (error) {
      throw normalizeSigningError(error);
    }

    await walletStateStorage.set({
      ...walletState,
      wallets: walletState.wallets.map((wallet) =>
        wallet.id === selectedWallet.id ? rememberWalletRecipient(wallet, input.recipient) : wallet
      )
    });
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });

    return {
      signature,
      recipient: input.recipient,
      amount: input.amount,
      asset: input.asset,
      network: walletState.selectedNetwork
    };
  }

  async burnToken(input: {
    mint: string;
    accountAddress: string;
    amount: string;
    decimals: number;
    programId: string;
    password?: string;
  }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed');
    const owner = new PublicKey(activeAccount.publicKey);
    const transaction = await buildBurnSplTokenTransaction(connection, owner, input);
    const signature = await this.submitTransactionForWallet(selectedWallet, activeAccount.publicKey, secret, connection, transaction);
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    return {
      signature,
      mint: input.mint,
      accountAddress: input.accountAddress,
      action: 'burn' as const,
      amount: input.amount,
      network: walletState.selectedNetwork
    };
  }

  async closeTokenAccount(input: { mint: string; accountAddress: string; programId: string; password?: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed');
    const owner = new PublicKey(activeAccount.publicKey);
    const tokenAccounts = await this.scanWalletTokenAccounts(connection, owner, {});
    const tokenAccount = tokenAccounts.find(
      (account) =>
        account.mint === input.mint &&
        account.programId === input.programId &&
        account.accountAddress === input.accountAddress
    );
    if (!tokenAccount) {
      throw new RpcError('TOKEN_ACCOUNT_MISSING', 'The selected token account could not be found.');
    }
    if (BigInt(tokenAccount.rawAmount) > 0n) {
      throw new RpcError('TOKEN_ACCOUNT_NOT_EMPTY', 'Burn or transfer the remaining token balance before closing this account.');
    }
    if (tokenAccount.delegate) {
      throw new RpcError('DELEGATE_PRESENT', 'Revoke the token delegate before closing this account.');
    }

    const transaction = await buildCloseTokenAccountTransaction(connection, owner, input);
    const signature = await this.submitTransactionForWallet(selectedWallet, activeAccount.publicKey, secret, connection, transaction);
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    return {
      signature,
      mint: input.mint,
      accountAddress: input.accountAddress,
      action: 'close' as const,
      network: walletState.selectedNetwork
    };
  }

  async getSecurityReport() {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const connection = new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed');
    const owner = new PublicKey(activeAccount.publicKey);
    const [shyftMetadataResult, shyftCollectionsResult] = await Promise.all([
      hasShyftApiKey()
        ? fetchShyftWalletTokens(walletState.selectedNetwork, activeAccount.publicKey).catch(() => ({}))
        : Promise.resolve({}),
      hasShyftApiKey()
        ? fetchShyftCollections(walletState.selectedNetwork, activeAccount.publicKey).catch(() => [])
        : Promise.resolve([])
    ]);
    const shyftMetadata = shyftMetadataResult as Record<string, { name?: string; symbol?: string; logoUri?: string }>;
    const collections = shyftCollectionsResult as CollectionHolding[];
    const tokens = await this.scanWalletTokenAccounts(connection, owner, shyftMetadata);
    const controlledMints = await this.scanControlledMints(connection, activeAccount.publicKey, tokens, collections);
    const delegatedTokenAccounts = tokens
      .filter((token) => !!token.delegate)
      .map((token) => ({
        accountAddress: token.accountAddress,
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        delegate: token.delegate ?? '',
        delegatedAmount: token.delegatedAmount ?? null,
        closeAuthority: token.closeAuthority ?? null
      }));
    const externalCloseAuthorities = tokens
      .filter((token) => !!token.closeAuthority && token.closeAuthority !== activeAccount.publicKey)
      .map((token) => ({
        accountAddress: token.accountAddress,
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        closeAuthority: token.closeAuthority ?? ''
      }));
    const warnings: string[] = [];

    if (delegatedTokenAccounts.length > 0) {
      warnings.push(`${delegatedTokenAccounts.length} token account${delegatedTokenAccounts.length === 1 ? '' : 's'} have an active delegate.`);
    }
    if (externalCloseAuthorities.length > 0) {
      warnings.push(`${externalCloseAuthorities.length} token account${externalCloseAuthorities.length === 1 ? '' : 's'} have an external close authority.`);
    }
    if (controlledMints.length > 0) {
      warnings.push(`${controlledMints.length} discovered mint${controlledMints.length === 1 ? '' : 's'} still trust this wallet with mint and/or freeze authority.`);
    }

    return {
      delegatedTokenAccounts,
      externalCloseAuthorities,
      controlledMints,
      warnings,
      scannedAt: Date.now()
    };
  }

  async runIncidentResponse(input: {
    safeWallet: string;
    reserveSol: string;
    password?: string;
    revokeDelegates: boolean;
    sweepSplTokens: boolean;
    sweepSol: boolean;
    rotateCloseAuthorities: boolean;
    rotateMintAuthorities: boolean;
  }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed');
    const owner = new PublicKey(activeAccount.publicKey);
    const safeWallet = new PublicKey(input.safeWallet);
    const [shyftMetadataResult, shyftCollectionsResult] = await Promise.all([
      hasShyftApiKey()
        ? fetchShyftWalletTokens(walletState.selectedNetwork, activeAccount.publicKey).catch(() => ({}))
        : Promise.resolve({}),
      hasShyftApiKey()
        ? fetchShyftCollections(walletState.selectedNetwork, activeAccount.publicKey).catch(() => [])
        : Promise.resolve([])
    ]);
    const shyftMetadata = shyftMetadataResult as Record<string, { name?: string; symbol?: string; logoUri?: string }>;
    const collections = shyftCollectionsResult as CollectionHolding[];
    const tokenAccounts = await this.scanWalletTokenAccounts(connection, owner, shyftMetadata);
    const fungibleTokens = (filterCollectibleTokens(tokenAccounts, collections) as ParsedWalletTokenAccount[]).filter(
      (token) => BigInt(token.rawAmount) > 0n
    );
    const controlledMints = await this.scanControlledMints(connection, activeAccount.publicKey, tokenAccounts, collections);
    const warnings: string[] = [];
    const actions: Array<{
      kind: 'revoke-delegates' | 'sweep-spl' | 'sweep-sol' | 'rotate-close-authorities' | 'rotate-mint-authorities';
      signatures: string[];
      itemCount: number;
    }> = [];

    if (input.revokeDelegates) {
      const revokeInstructions = tokenAccounts
        .filter((token) => !!token.delegate)
        .map((token) =>
          createRevokeInstruction(
            new PublicKey(token.accountAddress),
            owner,
            new PublicKey(token.programId)
          )
        );
      if (revokeInstructions.length > 0) {
        actions.push({
          kind: 'revoke-delegates',
          signatures: await this.submitInstructionBatches(
            selectedWallet,
            activeAccount.publicKey,
            secret,
            connection,
            owner,
            revokeInstructions
          ),
          itemCount: revokeInstructions.length
        });
      }
    }

    if (input.sweepSplTokens) {
      const destinationLookups = await Promise.all(
        fungibleTokens.map(async (token) => {
          const mint = new PublicKey(token.mint);
          const tokenProgramId = new PublicKey(token.programId);
          const destinationAta = getAssociatedTokenAddress(safeWallet, mint, tokenProgramId);
          const destinationInfo = await connection.getAccountInfo(destinationAta, 'confirmed');
          return {
            token,
            mint,
            tokenProgramId,
            destinationAta,
            destinationExists: !!destinationInfo
          };
        })
      );
      const sweepInstructions: TransactionInstruction[] = [];
      for (const entry of destinationLookups) {
        if (!entry.destinationExists) {
          sweepInstructions.push(
            createAssociatedTokenAccountInstruction(owner, entry.destinationAta, safeWallet, entry.mint, entry.tokenProgramId)
          );
        }
        sweepInstructions.push(
          createTransferCheckedInstruction(
            new PublicKey(entry.token.accountAddress),
            entry.mint,
            entry.destinationAta,
            owner,
            BigInt(entry.token.rawAmount),
            entry.token.decimals,
            entry.tokenProgramId
          )
        );
      }
      if (sweepInstructions.length > 0) {
        actions.push({
          kind: 'sweep-spl',
          signatures: await this.submitInstructionBatches(
            selectedWallet,
            activeAccount.publicKey,
            secret,
            connection,
            owner,
            sweepInstructions
          ),
          itemCount: fungibleTokens.length
        });
      }
    }

    if (input.rotateCloseAuthorities) {
      const closeAuthorityInstructions = tokenAccounts
        .filter((token) => !token.closeAuthority || token.closeAuthority === activeAccount.publicKey)
        .map((token) =>
          createSetAuthorityInstruction(
            new PublicKey(token.accountAddress),
            owner,
            new PublicKey(token.programId),
            TOKEN_AUTHORITY_TYPES.closeAccount,
            safeWallet
          )
        );
      if (closeAuthorityInstructions.length > 0) {
        actions.push({
          kind: 'rotate-close-authorities',
          signatures: await this.submitInstructionBatches(
            selectedWallet,
            activeAccount.publicKey,
            secret,
            connection,
            owner,
            closeAuthorityInstructions
          ),
          itemCount: closeAuthorityInstructions.length
        });
      }
      const skippedExternalCloseAuthorities = tokenAccounts.filter(
        (token) => !!token.closeAuthority && token.closeAuthority !== activeAccount.publicKey
      );
      if (skippedExternalCloseAuthorities.length > 0) {
        warnings.push(`Skipped ${skippedExternalCloseAuthorities.length} token account close authorit${skippedExternalCloseAuthorities.length === 1 ? 'y' : 'ies'} because another authority controls them.`);
      }
    }

    if (input.rotateMintAuthorities) {
      const mintAuthorityInstructions = controlledMints.flatMap((mint) => {
        const instructions: TransactionInstruction[] = [];
        const tokenProgramId = new PublicKey(mint.programId);
        const mintAddress = new PublicKey(mint.mint);

        if (mint.controlsMintAuthority) {
          instructions.push(
            createSetAuthorityInstruction(mintAddress, owner, tokenProgramId, TOKEN_AUTHORITY_TYPES.mintTokens, safeWallet)
          );
        }
        if (mint.controlsFreezeAuthority) {
          instructions.push(
            createSetAuthorityInstruction(mintAddress, owner, tokenProgramId, TOKEN_AUTHORITY_TYPES.freezeAccount, safeWallet)
          );
        }

        return instructions;
      });
      if (mintAuthorityInstructions.length > 0) {
        actions.push({
          kind: 'rotate-mint-authorities',
          signatures: await this.submitInstructionBatches(
            selectedWallet,
            activeAccount.publicKey,
            secret,
            connection,
            owner,
            mintAuthorityInstructions
          ),
          itemCount: controlledMints.length
        });
      }
    }

    if (input.sweepSol) {
      const reserveLamports = parseDecimalAmount(input.reserveSol, 9);
      const balanceLamports = await connection.getBalance(owner, 'confirmed');
      const transferLamports = BigInt(balanceLamports) - reserveLamports;
      if (transferLamports > 0n) {
        let transaction = await buildSolTransferTransaction(connection, owner, {
          recipient: safeWallet.toBase58(),
          amount: (Number(transferLamports) / 1_000_000_000).toFixed(9).replace(/\.?0+$/, '')
        });
        const feeLamports = await estimateLegacyTransactionFee(connection, transaction);
        const adjustedLamports = BigInt(balanceLamports) - reserveLamports - BigInt(feeLamports);
        if (adjustedLamports > 0n) {
          transaction = await buildSolTransferTransaction(connection, owner, {
            recipient: safeWallet.toBase58(),
            amount: (Number(adjustedLamports) / 1_000_000_000).toFixed(9).replace(/\.?0+$/, '')
          });
          actions.push({
            kind: 'sweep-sol',
            signatures: [
              await this.submitTransactionForWallet(
                selectedWallet,
                activeAccount.publicKey,
                secret,
                connection,
                transaction
              )
            ],
            itemCount: 1
          });
        } else {
          warnings.push('Skipped SOL sweep because the requested reserve leaves no balance after fees.');
        }
      } else {
        warnings.push('Skipped SOL sweep because the requested reserve is greater than the current SOL balance.');
      }
    }

    await walletStateStorage.set({
      ...walletState,
      wallets: walletState.wallets.map((wallet) =>
        wallet.id === selectedWallet.id ? rememberWalletRecipient(wallet, safeWallet.toBase58()) : wallet
      )
    });
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    return {
      safeWallet: safeWallet.toBase58(),
      reserveSol: input.reserveSol,
      actions,
      warnings
    };
  }

  async getSwapQuote(input: { amount: string; slippageBps: number; inputAsset: SendAsset; outputMint: string }) {
    const { walletState } = await this.ensureReadyWallet();
    if (walletState.selectedNetwork !== 'mainnet-beta') {
      throw new RpcError('SWAP_UNAVAILABLE', 'Native swaps are currently available only on mainnet-beta.');
    }

    const connection = new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed');
    const inputMint = input.inputAsset.kind === 'sol' ? JUPITER_SOL_MINT : input.inputAsset.mint;
    if (inputMint === input.outputMint) {
      throw new RpcError('INVALID_SWAP', 'Choose a different output token.');
    }

    const inputDecimals = input.inputAsset.kind === 'sol' ? 9 : input.inputAsset.decimals;
    const quoteResponse = await fetchJupiterQuote({
      inputMint,
      outputMint: input.outputMint,
      amount: parseDecimalAmount(input.amount, inputDecimals).toString(),
      slippageBps: input.slippageBps
    });
    const outputDecimals = await getMintDecimals(connection, input.outputMint);

    return {
      quoteResponse,
      inputMint,
      outputMint: input.outputMint,
      inputAmountUi: input.amount,
      outputAmountUi: formatUiAmount(quoteResponse.outAmount, outputDecimals),
      priceImpactPct: typeof quoteResponse.priceImpactPct === 'string' ? quoteResponse.priceImpactPct : null,
      routeLabels: Array.isArray(quoteResponse.routePlan)
        ? quoteResponse.routePlan
            .map((route) => (typeof route?.swapInfo?.label === 'string' ? route.swapInfo.label : null))
            .filter((label): label is string => !!label)
        : [],
      slippageBps: input.slippageBps
    };
  }

  async executeSwap(input: { quoteResponse: JupiterQuoteResponse; password?: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    if (walletState.selectedNetwork !== 'mainnet-beta') {
      throw new RpcError('SWAP_UNAVAILABLE', 'Native swaps are currently available only on mainnet-beta.');
    }

    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed');
    const swap = await createJupiterSwapTransaction({
      quoteResponse: input.quoteResponse,
      userPublicKey: activeAccount.publicKey
    });

    let signature: string;
    try {
      signature =
        selectedWallet.signer.kind === 'ledger'
          ? await signAndSendLedgerSerializedTransaction(
              swap.swapTransaction,
              activeAccount.publicKey,
              selectedWallet.signer.derivationPath,
              getRpcEndpoint(walletState.selectedNetwork)
            )
          : await signAndSendSerializedTransaction(
              swap.swapTransaction,
              resolveSolanaVaultSecret(secret),
              getRpcEndpoint(walletState.selectedNetwork)
            );
    } catch (error) {
      throw normalizeSigningError(error);
    }

    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    return {
      signature,
      inputMint: input.quoteResponse.inputMint,
      outputMint: input.quoteResponse.outputMint,
      inputAmountUi: formatUiAmount(input.quoteResponse.inAmount, await getMintDecimals(connection, input.quoteResponse.inputMint)),
      outputAmountUi: formatUiAmount(input.quoteResponse.outAmount, await getMintDecimals(connection, input.quoteResponse.outputMint))
    };
  }

  async handleProviderRequest(request: ProviderRequest, debug?: (payload: ProviderDebugPayload) => void): Promise<unknown> {
    debug?.({
      phase: 'handle_provider_request_start',
      requestId: request.id,
      method: request.method,
      origin: request.origin.origin
    });
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    if (request.method === 'disconnect') {
      return { disconnected: true };
    }

    if (request.method === 'connect') {
      const permissions = await permissionsStorage.get();
      const isTrusted = hasPermission(permissions, request.origin.origin, 'solana:accounts');
      if (request.params.silent) {
        if (!isTrusted) {
          throw new RpcError('NOT_CONNECTED', 'This site has not been approved yet.');
        }
        debug?.({
          phase: 'connect_silent_trusted',
          requestId: request.id,
          method: request.method,
          origin: request.origin.origin,
          success: true
        });
        return { publicKey: activeAccount.publicKey };
      }

      if (isTrusted) {
        debug?.({
          phase: 'connect_already_trusted',
          requestId: request.id,
          method: request.method,
          origin: request.origin.origin,
          success: true
        });
        return { publicKey: activeAccount.publicKey };
      }

      const approval = await this.createApproval(request, walletState.selectedNetwork, selectedWallet.id, activeAccount.publicKey, {
        requestedPermissions:
          selectedWallet.signer.kind === 'watch-only'
            ? ['View your public key']
            : ['View your public key', 'Request signatures with approval']
      });
      debug?.({
        phase: 'approval_created',
        requestId: request.id,
        method: request.method,
        approvalId: approval.id,
        kind: approval.kind,
        origin: request.origin.origin,
        network: walletState.selectedNetwork
      });
      return this.awaitApproval(approval.id, debug);
    }

    const permissions = await permissionsStorage.get();
    if (!hasPermission(permissions, request.origin.origin, 'solana:accounts')) {
      throw new RpcError('NOT_CONNECTED', 'Connect this site before signing.');
    }

    if (selectedWallet.signer.kind === 'watch-only') {
      throw new RpcError('WATCH_ONLY_WALLET', 'This wallet is watch-only and cannot sign messages or transactions.');
    }

    const transactionSummary =
      request.method === 'signTransaction' || request.method === 'signAndSendTransaction' || request.method === 'sendTransaction'
        ? await inspectTransaction(request.params.transaction, new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed'))
        : request.method === 'signAllTransactions'
          ? {
              ...(await inspectTransaction(
                request.params.transactions[0],
                new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed')
              )),
              warnings: ['Only the first transaction in this batch was decoded and simulated.']
            }
          : undefined;

    const approval = await this.createApproval(request, walletState.selectedNetwork, selectedWallet.id, activeAccount.publicKey, {
      transactionSummary
    });
    debug?.({
      phase: 'approval_created',
      requestId: request.id,
      method: request.method,
      approvalId: approval.id,
      kind: approval.kind,
      origin: request.origin.origin,
      network: walletState.selectedNetwork
    });
    return this.awaitApproval(approval.id, debug);
  }

  async getApproval(approvalId: string) {
    const approvals = await approvalsStorage.get();
    return approvals[approvalId];
  }

  async respondToApproval(approvalId: string, approved: boolean, password?: string) {
    const approvals = await approvalsStorage.get();
    const approval = approvals[approvalId];
    if (!approval) {
      throw new RpcError('APPROVAL_NOT_FOUND', 'Approval request could not be found.');
    }

    try {
      if (!approved) {
        this.emitPendingApprovalDebug(approvalId, {
          phase: 'approval_rejected',
          requestId: approval.request.id,
          method: approval.request.method,
          approvalId,
          kind: approval.kind,
          origin: approval.origin.origin,
          success: false,
          code: 'USER_REJECTED',
          message: 'User rejected the request.'
        });
        this.rejectPendingApproval(approvalId, new RpcError('USER_REJECTED', 'User rejected the request.'));
        return { approved: false };
      }

      this.emitPendingApprovalDebug(approvalId, {
        phase: 'approval_execute_start',
        requestId: approval.request.id,
        method: approval.request.method,
        approvalId,
        kind: approval.kind,
        origin: approval.origin.origin,
        network: approval.network
      });
      const result = await this.executeApproval(approval, password);
      this.emitPendingApprovalDebug(approvalId, {
        phase: 'approval_execute_success',
        requestId: approval.request.id,
        method: approval.request.method,
        approvalId,
        kind: approval.kind,
        origin: approval.origin.origin,
        network: approval.network,
        success: true
      });
      this.resolvePendingApproval(approvalId, result);
      return { approved: true };
    } catch (error) {
      const normalized = normalizeError(error);
      this.emitPendingApprovalDebug(approvalId, {
        phase: 'approval_execute_error',
        requestId: approval.request.id,
        method: approval.request.method,
        approvalId,
        kind: approval.kind,
        origin: approval.origin.origin,
        network: approval.network,
        success: false,
        code: normalized.code,
        message: normalized.message
      });
      throw error;
    } finally {
      const nextApprovals = { ...approvals };
      delete nextApprovals[approvalId];
      await approvalsStorage.set(nextApprovals);
    }
  }

  async cancelApproval(approvalId: string) {
    const approvals = await approvalsStorage.get();
    const approval = approvals[approvalId];
    if (!approval) {
      return;
    }
    const nextApprovals = { ...approvals };
    delete nextApprovals[approvalId];
    await approvalsStorage.set(nextApprovals);
    this.rejectPendingApproval(approvalId, new RpcError('APPROVAL_CLOSED', 'Approval window was closed.'));
  }

  private async executeApproval(approval: ApprovalRecord, password?: string) {
    if (approval.kind === 'connect') {
      const permissions = await permissionsStorage.get();
      await permissionsStorage.set(
        grantPermissions(
          permissions,
          approval.origin.origin,
          approval.requestedPermissions?.includes('Request signatures with approval') ? ['solana:accounts', 'solana:sign'] : ['solana:accounts'],
          {
          faviconUrl: approval.origin.faviconUrl,
          title: approval.origin.title
          }
        )
      );
      return { publicKey: approval.publicKey };
    }

    const { selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, password);
    switch (approval.kind) {
      case 'sign-message': {
        if (selectedWallet.signer.kind === 'ledger') {
          throw new RpcError('LEDGER_UNSUPPORTED', 'Ledger message signing is not supported in this MVP.');
        }

        const signer = resolveSolanaVaultSecret(secret);
        const messageRequest = approval.request as Extract<ProviderRequest, { method: 'signMessage' }>;
        const signature = signMessageBytes(
          atobBytes(messageRequest.params.message),
          signer
        );
        return {
          publicKey: signer.publicKey.toBase58(),
          signature: arrayBufferToBase64(signature)
        };
      }
      case 'sign-transaction': {
        const transactionRequest = approval.request as Extract<ProviderRequest, { method: 'signTransaction' }>;
        return {
          transaction:
            selectedWallet.signer.kind === 'ledger'
              ? await signLedgerSerializedTransaction(
                  transactionRequest.params.transaction,
                  approval.publicKey ?? '',
                  selectedWallet.signer.derivationPath
                )
              : signSerializedTransaction(transactionRequest.params.transaction, resolveSolanaVaultSecret(secret))
        };
      }
      case 'sign-all-transactions': {
        const transactionsRequest = approval.request as Extract<ProviderRequest, { method: 'signAllTransactions' }>;
        return {
          transactions:
            selectedWallet.signer.kind === 'ledger'
              ? await signLedgerSerializedTransactions(
                  transactionsRequest.params.transactions,
                  approval.publicKey ?? '',
                  selectedWallet.signer.derivationPath
                )
              : signSerializedTransactions(transactionsRequest.params.transactions, resolveSolanaVaultSecret(secret))
        };
      }
      case 'sign-and-send-transaction': {
        const transactionRequest = approval.request as Extract<
          ProviderRequest,
          { method: 'signAndSendTransaction' | 'sendTransaction' }
        >;
        try {
          return {
            signature:
              selectedWallet.signer.kind === 'ledger'
                ? await signAndSendLedgerSerializedTransaction(
                    transactionRequest.params.transaction,
                    approval.publicKey ?? '',
                    selectedWallet.signer.derivationPath,
                    getRpcEndpoint(approval.network)
                  )
                : await signAndSendSerializedTransaction(
                    transactionRequest.params.transaction,
                    resolveSolanaVaultSecret(secret),
                    getRpcEndpoint(approval.network)
                  )
          };
        } catch (error) {
          throw normalizeSigningError(error);
        }
      }
      default:
        throw new RpcError('UNKNOWN_APPROVAL', 'Unsupported approval kind.');
    }
  }

  private async createApproval(
    request: ProviderRequest,
    network: 'mainnet-beta' | 'devnet',
    walletId: string,
    publicKey: string,
    extras?: Pick<ApprovalRecord, 'requestedPermissions' | 'transactionSummary'>
  ) {
    const kind = toApprovalKind(request);
    const state = createPendingApproval(crypto.randomUUID(), kind);
    const approval: ApprovalRecord = {
      id: state.id,
      kind,
      state,
      request,
      origin: request.origin,
      createdAt: state.createdAt,
      publicKey,
      network,
      requestedPermissions: extras?.requestedPermissions,
      transactionSummary: extras?.transactionSummary,
      requiresPassword: !this.unlockedSecrets[walletId],
      hostSurfaceId: getPreferredApprovalSurface()?.surfaceId
    };

    const approvals = await approvalsStorage.get();
    approvals[state.id] = approval;
    await approvalsStorage.set(approvals);

    if (!approval.hostSurfaceId) {
      const createdWindow = await chrome.windows.create({
        url: chrome.runtime.getURL(`approval.html?approvalId=${state.id}`),
        type: 'popup',
        focused: true,
        width: 520,
        height: 820
      });
      approval.windowId = createdWindow.id;
    }

    approvals[state.id] = approval;
    await approvalsStorage.set(approvals);
    return approval;
  }

  private awaitApproval(approvalId: string, debug?: (payload: ProviderDebugPayload) => void): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pendingApprovals.set(approvalId, { resolve, reject, debug });
    });
  }

  private resolvePendingApproval(approvalId: string, value: unknown) {
    const pending = this.pendingApprovals.get(approvalId);
    if (pending) {
      pending.resolve(value);
      this.pendingApprovals.delete(approvalId);
    }
  }

  private rejectPendingApproval(approvalId: string, error: Error) {
    const pending = this.pendingApprovals.get(approvalId);
    if (pending) {
      pending.reject(error);
      this.pendingApprovals.delete(approvalId);
    }
  }

  private emitPendingApprovalDebug(approvalId: string, payload: ProviderDebugPayload) {
    this.pendingApprovals.get(approvalId)?.debug?.(payload);
  }

  private async getUnlockedSecret(walletId: string, vault: NonNullable<ReturnType<typeof getSelectedWallet>>['vault'], password?: string) {
    const cached = this.unlockedSecrets[walletId];
    if (cached) {
      return cached.secret;
    }
    if (!vault) {
      throw new RpcError('WATCH_ONLY_WALLET', 'This wallet does not have local signing secrets.');
    }

    if (!password) {
      throw new RpcError('PASSWORD_REQUIRED', 'Password is required to sign.');
    }

    const secret = await unlockVaultRecord(vault, password);
    this.unlockedSecrets[walletId] = {
      secret,
      unlockedAt: Date.now()
    };
    return secret;
  }
}

function getSurfacePriority(page: string): number {
  switch (page) {
    case 'sidepanel':
      return 3;
    case 'popup':
      return 2;
    case 'wallet':
      return 1;
    default:
      return 0;
  }
}

function getPreferredApprovalSurface(): ActiveWalletSurface | undefined {
  return [...activeWalletSurfacePorts.values()].sort((left, right) => getSurfacePriority(right.page) - getSurfacePriority(left.page))[0];
}

async function assignPendingApprovalsToPreferredSurface() {
  const preferred = getPreferredApprovalSurface();
  if (!preferred) {
    return;
  }

  const approvals = await approvalsStorage.get();
  let changed = false;
  for (const approval of Object.values(approvals)) {
    if (!approval.hostSurfaceId) {
      approval.hostSurfaceId = preferred.surfaceId;
      changed = true;
    }
  }

  if (changed) {
    await approvalsStorage.set(approvals);
  }
}

async function reassignApprovalsFromSurface(surfaceId: string) {
  const approvals = await approvalsStorage.get();
  const preferred = getPreferredApprovalSurface();
  let changed = false;

  for (const approval of Object.values(approvals)) {
    if (approval.hostSurfaceId === surfaceId) {
      approval.hostSurfaceId = preferred?.surfaceId;
      changed = true;
    }
  }

  if (changed) {
    await approvalsStorage.set(approvals);
  }
}

function toApprovalKind(request: ProviderRequest) {
  switch (request.method) {
    case 'connect':
      return 'connect';
    case 'signMessage':
      return 'sign-message';
    case 'signTransaction':
      return 'sign-transaction';
    case 'signAllTransactions':
      return 'sign-all-transactions';
    case 'signAndSendTransaction':
    case 'sendTransaction':
      return 'sign-and-send-transaction';
    default:
      throw new RpcError('UNKNOWN_REQUEST', 'Unsupported request type.');
  }
}

function atobBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function arrayBufferToBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

function normalizeError(error: unknown) {
  if (error instanceof RpcError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: error.message };
  }
  return { code: 'INTERNAL_ERROR', message: 'An unknown error occurred.' };
}

function normalizeSigningError(error: unknown) {
  if (error instanceof RpcError) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const maybeMessage = 'message' in error && typeof error.message === 'string' ? error.message : 'Transaction failed.';
    const maybeLogs = 'logs' in error && Array.isArray(error.logs) ? error.logs.filter((log): log is string => typeof log === 'string') : [];
    const compactLogs = maybeLogs.slice(0, 2).join(' ');

    if (maybeMessage.toLowerCase().includes('insufficient lamports') || compactLogs.toLowerCase().includes('insufficient lamports')) {
      return new RpcError('INSUFFICIENT_FUNDS', 'Not enough SOL to cover the transfer amount and network fee.');
    }

    return new RpcError('TRANSACTION_FAILED', compactLogs ? `${maybeMessage} ${compactLogs}` : maybeMessage);
  }

  return new RpcError('TRANSACTION_FAILED', 'Transaction failed.');
}

function emitProviderDebug(port: chrome.runtime.Port, payload: ProviderDebugPayload) {
  console.debug('[Grape][background]', payload);
  try {
    port.postMessage({
      __grapeDebug: true,
      payload
    });
  } catch {
    // Ignore debug transport failures.
  }
}

function readBorshString(bytes: Uint8Array, offset: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(offset, true);
  const start = offset + 4;
  const end = start + length;
  const value = new TextDecoder().decode(bytes.slice(start, end)).replace(/\0/g, '').trim();
  return {
    value: value || null,
    offset: end
  };
}

function parseMetaplexMetadataAccount(bytes: Uint8Array): ParsedMetaplexMetadata | null {
  if (bytes.byteLength < 65) {
    return null;
  }

  let offset = 1;
  const updateAuthority = new PublicKey(bytes.slice(offset, offset + 32)).toBase58();
  offset += 32;
  const mint = new PublicKey(bytes.slice(offset, offset + 32)).toBase58();
  offset += 32;

  const name = readBorshString(bytes, offset);
  const symbol = readBorshString(bytes, name.offset);
  const uri = readBorshString(bytes, symbol.offset);

  if (uri.offset + 2 > bytes.byteLength) {
    return {
      updateAuthority,
      mint,
      name: name.value,
      symbol: symbol.value,
      uri: uri.value,
      sellerFeeBasisPoints: null
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sellerFeeBasisPoints = view.getUint16(uri.offset, true);

  return {
    updateAuthority,
    mint,
    name: name.value,
    symbol: symbol.value,
    uri: uri.value,
    sellerFeeBasisPoints
  };
}

async function fetchCollectibleMetadataHints(
  connection: Connection,
  items: CollectibleItem[]
): Promise<Record<string, CollectibleMetadataHint>> {
  const uniqueMintsNeedingHints = Array.from(
    new Set(
      items
        .filter((item) => !item.imageUri || !item.name || !item.symbol)
        .map((item) => item.mint)
        .filter((mint): mint is string => !!mint)
    )
  );

  const entries = await Promise.all(
    uniqueMintsNeedingHints.map(async (mint) => {
      try {
        const metadataPda = PublicKey.findProgramAddressSync(
          [new TextEncoder().encode('metadata'), METADATA_PROGRAM_ID.toBytes(), new PublicKey(mint).toBytes()],
          METADATA_PROGRAM_ID
        )[0];
        const metadataAccountInfo = await connection.getAccountInfo(metadataPda, 'confirmed');
        const parsedMetadata = metadataAccountInfo?.data ? parseMetaplexMetadataAccount(metadataAccountInfo.data) : null;
        let imageUri: string | undefined;
        let jsonName: string | undefined;
        let jsonSymbol: string | undefined;

        if (parsedMetadata?.uri) {
          try {
            const response = await fetch(parsedMetadata.uri, { cache: 'no-store' });
            if (response.ok) {
              const payload = (await response.json()) as { image?: unknown; name?: unknown; symbol?: unknown };
              imageUri = typeof payload.image === 'string' && payload.image.trim() ? payload.image.trim() : undefined;
              jsonName = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : undefined;
              jsonSymbol = typeof payload.symbol === 'string' && payload.symbol.trim() ? payload.symbol.trim() : undefined;
            }
          } catch {
            imageUri = undefined;
          }
        }

        return [
          mint,
          {
            name: jsonName ?? parsedMetadata?.name ?? undefined,
            symbol: jsonSymbol ?? parsedMetadata?.symbol ?? undefined,
            imageUri
          }
        ] as const;
      } catch {
        return [mint, {}] as const;
      }
    })
  );

  return Object.fromEntries(entries);
}

async function getMintDecimals(connection: Connection, mint: string): Promise<number> {
  if (mint === JUPITER_SOL_MINT) {
    return 9;
  }

  const accountInfo = await connection.getParsedAccountInfo(new PublicKey(mint), 'confirmed');
  const parsedData = accountInfo.value?.data;
  if (!parsedData || typeof parsedData !== 'object' || !('parsed' in parsedData)) {
    return 9;
  }

  const parsed = parsedData.parsed;
  if (!parsed || typeof parsed !== 'object' || !('info' in parsed) || !parsed.info || typeof parsed.info !== 'object') {
    return 9;
  }

  return 'decimals' in parsed.info && typeof parsed.info.decimals === 'number' ? parsed.info.decimals : 9;
}

function formatUiAmount(rawAmount: string, decimals: number): string {
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) {
    return rawAmount;
  }

  return (amount / 10 ** decimals).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(Math.max(decimals, 0), 6)
  });
}

const controller = new WalletController();

chrome.runtime.onInstalled.addListener(async () => {
  await Promise.all([walletStateStorage.get(), permissionsStorage.get(), sessionStorage.get()]);
});

chrome.runtime.onMessage.addListener((rawMessage: RuntimeMessage, _sender, sendResponse) => {
  const message = runtimeMessageSchema.parse(rawMessage);

  void (async () => {
    try {
      switch (message.type) {
        case 'wallet_get_state':
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_create':
          await controller.createWallet({ kind: 'mnemonic', mnemonic: message.mnemonic }, message.password, message.publicKey, { kind: 'software' }, 'created');
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_import':
          await controller.createWallet(
            { kind: 'mnemonic', mnemonic: message.mnemonic },
            message.password,
            message.publicKey,
            { kind: 'software' },
            'imported-mnemonic'
          );
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_import_private_key':
          await controller.createWallet(
            { kind: 'private-key', secretKey: message.privateKey },
            message.password,
            message.publicKey,
            { kind: 'software' },
            'imported-private-key'
          );
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_import_ledger':
          await controller.createWallet(
            { kind: 'auth-token', token: crypto.randomUUID() },
            message.password,
            message.publicKey,
            {
              kind: 'ledger',
              transport: 'webhid',
              derivationPath: message.derivationPath
            },
            'ledger'
          );
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_import_watch_only':
          await controller.createWallet(
            { kind: 'auth-token', token: crypto.randomUUID() },
            undefined,
            message.publicKey,
            { kind: 'watch-only' },
            'watch-only'
          );
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_unlock':
          await controller.unlockWallet(message.password);
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_lock':
          await controller.lockWallet();
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_reset':
          sendResponse(await controller.resetWallet());
          break;
        case 'wallet_set_network':
          sendResponse(await controller.setNetwork(message.network));
          break;
        case 'wallet_set_theme':
          sendResponse(await controller.setTheme(message.theme));
          break;
        case 'wallet_select':
          sendResponse(await controller.selectWallet(message.walletId));
          break;
        case 'wallet_remove':
          sendResponse(await controller.removeWallet(message.walletId));
          break;
        case 'wallet_set_idle_timeout':
          sendResponse(await controller.setIdleTimeout(message.idleTimeoutMs));
          break;
        case 'wallet_set_biometric_unlock':
          sendResponse(await controller.setBiometricUnlock(message.config));
          break;
        case 'wallet_get_balance':
          sendResponse({ lamports: await controller.getBalanceLamports() });
          break;
        case 'wallet_get_assets':
          sendResponse(await controller.getAssets({ staleWhileRevalidate: message.staleWhileRevalidate }));
          break;
        case 'wallet_get_token_details':
          sendResponse(
            await controller.getTokenDetails({
              mint: message.mint,
              accountAddress: message.accountAddress,
              programId: message.programId
            })
          );
          break;
        case 'wallet_send_transfer':
          sendResponse(
            await controller.sendTransfer({
              recipient: message.recipient,
              amount: message.amount,
              password: message.password,
              asset: message.asset
            })
          );
          break;
        case 'wallet_burn_token':
          sendResponse(
            await controller.burnToken({
              mint: message.mint,
              accountAddress: message.accountAddress,
              amount: message.amount,
              decimals: message.decimals,
              programId: message.programId,
              password: message.password
            })
          );
          break;
        case 'wallet_close_token_account':
          sendResponse(
            await controller.closeTokenAccount({
              mint: message.mint,
              accountAddress: message.accountAddress,
              programId: message.programId,
              password: message.password
            })
          );
          break;
        case 'wallet_get_swap_quote':
          sendResponse(
            await controller.getSwapQuote({
              amount: message.amount,
              slippageBps: message.slippageBps,
              inputAsset: message.inputAsset,
              outputMint: message.outputMint
            })
          );
          break;
        case 'wallet_execute_swap':
          sendResponse(
            await controller.executeSwap({
              quoteResponse: message.quoteResponse,
              password: message.password
            })
          );
          break;
        case 'wallet_get_security_report':
          sendResponse(await controller.getSecurityReport());
          break;
        case 'wallet_run_incident_response':
          sendResponse(
            await controller.runIncidentResponse({
              safeWallet: message.safeWallet,
              reserveSol: message.reserveSol,
              password: message.password,
              revokeDelegates: message.revokeDelegates,
              sweepSplTokens: message.sweepSplTokens,
              sweepSol: message.sweepSol,
              rotateCloseAuthorities: message.rotateCloseAuthorities,
              rotateMintAuthorities: message.rotateMintAuthorities
            })
          );
          break;
        case 'wallet_export_secret':
          sendResponse(await controller.exportWalletSecret(message.password));
          break;
        case 'wallet_list_permissions':
          sendResponse((await controller.getStateResponse()).permissions);
          break;
        case 'wallet_revoke_permission':
          sendResponse(await controller.revokePermission(message.origin));
          break;
        case 'approval_get':
          sendResponse(await controller.getApproval(message.approvalId));
          break;
        case 'approval_respond':
          sendResponse(await controller.respondToApproval(message.approvalId, message.approved, message.password));
          break;
        default:
          sendResponse(undefined);
      }
    } catch (error) {
      sendResponse({ error: normalizeError(error) });
    }
  })();

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'grape-surface') {
    port.onMessage.addListener((message) => {
      if (
        message &&
        typeof message === 'object' &&
        message.type === 'register-surface' &&
        typeof message.surfaceId === 'string' &&
        typeof message.page === 'string'
      ) {
        activeWalletSurfacePorts.set(port, {
          port,
          surfaceId: message.surfaceId,
          page: message.page
        });
        void assignPendingApprovalsToPreferredSurface();
      }
    });
    port.onDisconnect.addListener(() => {
      const surface = activeWalletSurfacePorts.get(port);
      activeWalletSurfacePorts.delete(port);
      if (surface) {
        void reassignApprovalsFromSurface(surface.surfaceId);
      }
    });
    return;
  }

  if (port.name !== 'grape-provider') {
    return;
  }

  port.onMessage.addListener((rawMessage) => {
    void (async () => {
      try {
        const requestId = typeof rawMessage?.id === 'string' ? rawMessage.id : undefined;
        const requestMethod = typeof rawMessage?.method === 'string' ? rawMessage.method : undefined;
        emitProviderDebug(port, {
          phase: 'port_message_received',
          requestId,
          method: requestMethod as ProviderRequest['method'] | undefined,
          origin: typeof rawMessage?.origin?.origin === 'string' ? rawMessage.origin.origin : undefined
        });
        const request = providerRequestSchema.parse(rawMessage);
        emitProviderDebug(port, {
          phase: 'provider_request_parsed',
          requestId: request.id,
          method: request.method,
          origin: request.origin.origin
        });
        const result = await controller.handleProviderRequest(request, (payload) => emitProviderDebug(port, payload));
        emitProviderDebug(port, {
          phase: 'provider_request_resolved',
          requestId: request.id,
          method: request.method,
          origin: request.origin.origin,
          success: true
        });
        port.postMessage({
          id: request.id,
          success: true,
          result
        });
      } catch (error) {
        const requestId = typeof rawMessage?.id === 'string' ? rawMessage.id : crypto.randomUUID();
        const normalized = normalizeError(error);
        emitProviderDebug(port, {
          phase: 'provider_request_error',
          requestId,
          method: typeof rawMessage?.method === 'string' ? (rawMessage.method as ProviderRequest['method']) : undefined,
          origin: typeof rawMessage?.origin?.origin === 'string' ? rawMessage.origin.origin : undefined,
          success: false,
          code: normalized.code,
          message: normalized.message
        });
        port.postMessage({
          id: requestId,
          success: false,
          error: normalized
        });
      }
    })();
  });
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const approvals = await approvalsStorage.get();
  const pendingApproval = Object.values(approvals).find((approval) => approval.windowId === windowId);
  if (!pendingApproval) {
    return;
  }
  await controller.cancelApproval(pendingApproval.id);
});
