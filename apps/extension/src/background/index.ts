import {
  createVaultRecord,
  createPendingApproval,
  getSelectedWallet,
  grantPermissions,
  hasPermission,
  isSessionExpired,
  listPermissions,
  migrateWalletState,
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
  signSerializedTransaction,
  signSerializedTransactions,
  summarizeTransaction
} from '@grape/solana';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

import type { ApprovalRecord, CollectionHolding, TokenHolding } from '../shared/models';

import { filterCollectibleTokens, sortWalletTokens } from '../shared/assets';
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
const TOKEN_PROGRAM_IDS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
] as const;
const KNOWN_TOKEN_SYMBOLS: Record<string, string> = {
  [JUPITER_SOL_MINT]: 'SOL',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC'
};
const INCIDENT_BATCH_SIZE = 6;

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

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

type UnlockedSecretCache = Record<string, {
  secret: VaultSecret;
  unlockedAt: number;
}>;

class WalletController {
  private readonly pendingApprovals = new Map<string, PendingResolver>();
  private unlockedSecrets: UnlockedSecretCache = {};

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
    password: string,
    publicKey: string,
    signer: import('@grape/core').WalletSigner = { kind: 'software' }
  ) {
    const account = {
      id: 'account-0',
      index: 0,
      publicKey,
      derivationPath:
        signer.kind === 'ledger'
          ? signer.derivationPath
          : secret.kind === 'mnemonic'
            ? `m/44'/501'/0'/0'`
            : 'imported-private-key'
    };
    const current = await this.getWalletState();
    if (current.setup === 'ready') {
      const currentSelectedWallet = getSelectedWallet(current);
      if (!currentSelectedWallet) {
        throw new RpcError('WALLET_NOT_READY', 'Wallet state is invalid.');
      }
      const valid = await verifyVaultPassword(currentSelectedWallet.vault, password);
      if (!valid) {
        throw new RpcError('INVALID_PASSWORD', 'Use your existing wallet password to add another wallet.');
      }
    }

    const walletId = `wallet-${current.wallets.length + 1}`;
    const profile = {
      id: walletId,
      name: `Wallet ${current.wallets.length + 1}`,
      vault: await createVaultRecord(secret, password),
      signer,
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
    this.unlockedSecrets[walletId] = {
      secret,
      unlockedAt: Date.now()
    };
    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    return nextState;
  }

  async unlockWallet(password: string) {
    const { walletState } = await this.ensureReadyWallet();
    const unlockedEntries = await Promise.all(
      walletState.wallets.map(async (wallet) => {
        const secret = await unlockVaultRecord(wallet.vault, password);
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
    await this.setSessionState({ locked: true, lastActivityAt: 0 });
    return true;
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
      activeWallet: activeWallet && activeAccount ? { id: activeWallet.id, name: activeWallet.name, publicKey: activeAccount.publicKey } : undefined,
      activeAccount: activeAccount ? { publicKey: activeAccount.publicKey } : undefined,
      recentRecipients: activeWallet?.recentRecipients ?? [],
      canUseUnlockedSigner: !!(activeWallet && this.unlockedSecrets[activeWallet.id]) && !session.locked
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

  async getBalanceLamports() {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      return null;
    }
    const connection = new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed');
    return connection.getBalance(new PublicKey(activeAccount.publicKey));
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

  async getAssets() {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      return {
        lamports: null,
        tokens: []
      };
    }

    const owner = new PublicKey(activeAccount.publicKey);
    const connection = new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed');
    const [lamports, shyftMetadataResult, shyftCollectionsResult] = await Promise.all([
      connection.getBalance(owner),
      hasShyftApiKey()
        ? fetchShyftWalletTokens(walletState.selectedNetwork, activeAccount.publicKey).catch(() => ({}))
        : Promise.resolve({}),
      hasShyftApiKey()
        ? fetchShyftCollections(walletState.selectedNetwork, activeAccount.publicKey).catch(() => [])
        : Promise.resolve([])
    ]);

    const shyftMetadata = shyftMetadataResult as Record<string, { name?: string; symbol?: string; logoUri?: string }>;
    const collections = shyftCollectionsResult as CollectionHolding[];
    const tokens = (await this.scanWalletTokenAccounts(connection, owner, shyftMetadata)).filter((token) => Number(token.amount) > 0);

    const fungibleTokens = filterCollectibleTokens(tokens, collections);

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

    return {
      lamports,
      tokens: sortedTokens,
      collections,
      totalUsdValue: Number.isFinite(totalUsdValue) ? totalUsdValue : null,
      nativePriceUsd: nativeUsdPrice,
      nativeValueUsd,
      nativePriceChange24h
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
      throw new RpcError('EXPORT_UNAVAILABLE', 'Hardware wallets cannot be exported from Grape Wallet.');
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
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = new Connection(getRpcEndpoint(walletState.selectedNetwork), 'confirmed');
    const owner = new PublicKey(activeAccount.publicKey);
    const transaction = await buildBurnSplTokenTransaction(connection, owner, input);
    const signature = await this.submitTransactionForWallet(selectedWallet, activeAccount.publicKey, secret, connection, transaction);

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

      return {
      signature,
      inputMint: input.quoteResponse.inputMint,
      outputMint: input.quoteResponse.outputMint,
      inputAmountUi: formatUiAmount(input.quoteResponse.inAmount, await getMintDecimals(connection, input.quoteResponse.inputMint)),
      outputAmountUi: formatUiAmount(input.quoteResponse.outAmount, await getMintDecimals(connection, input.quoteResponse.outputMint))
    };
  }

  async handleProviderRequest(request: ProviderRequest): Promise<unknown> {
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
        return { publicKey: activeAccount.publicKey };
      }

      if (isTrusted) {
        return { publicKey: activeAccount.publicKey };
      }

      const approval = await this.createApproval(request, walletState.selectedNetwork, selectedWallet.id, activeAccount.publicKey, {
        requestedPermissions: ['View your public key', 'Request signatures with approval']
      });
      return this.awaitApproval(approval.id);
    }

    const permissions = await permissionsStorage.get();
    if (!hasPermission(permissions, request.origin.origin, 'solana:accounts')) {
      throw new RpcError('NOT_CONNECTED', 'Connect this site before signing.');
    }

    const transactionSummary =
      request.method === 'signTransaction' || request.method === 'signAndSendTransaction'
        ? summarizeTransaction(request.params.transaction)
        : request.method === 'signAllTransactions'
          ? summarizeTransaction(request.params.transactions[0])
          : undefined;

    const approval = await this.createApproval(request, walletState.selectedNetwork, selectedWallet.id, activeAccount.publicKey, {
      transactionSummary
    });
    return this.awaitApproval(approval.id);
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
        this.rejectPendingApproval(approvalId, new RpcError('USER_REJECTED', 'User rejected the request.'));
        return { approved: false };
      }

      const result = await this.executeApproval(approval, password);
      this.resolvePendingApproval(approvalId, result);
      return { approved: true };
    } finally {
      const nextApprovals = { ...approvals };
      delete nextApprovals[approvalId];
      await approvalsStorage.set(nextApprovals);
      if (approval.windowId !== undefined) {
        try {
          await chrome.windows.remove(approval.windowId);
        } catch {
          // Window may already be closed.
        }
      }
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
        grantPermissions(permissions, approval.origin.origin, ['solana:accounts', 'solana:sign'], {
          faviconUrl: approval.origin.faviconUrl,
          title: approval.origin.title
        })
      );
      return { publicKey: approval.publicKey };
    }

    const { selectedWallet } = await this.ensureReadyWallet();
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
        const transactionRequest = approval.request as Extract<ProviderRequest, { method: 'signAndSendTransaction' }>;
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
      requiresPassword: !this.unlockedSecrets[walletId]
    };

    const approvals = await approvalsStorage.get();
    approvals[state.id] = approval;
    await approvalsStorage.set(approvals);

    const createdWindow = await chrome.windows.create({
      url: chrome.runtime.getURL(`approval.html?approvalId=${approval.id}`),
      type: 'popup',
      width:
        request.method === 'signTransaction' ||
        request.method === 'signAllTransactions' ||
        request.method === 'signAndSendTransaction'
          ? 500
          : 440,
      height:
        request.method === 'signTransaction' ||
        request.method === 'signAllTransactions' ||
        request.method === 'signAndSendTransaction'
          ? 820
          : 760
    });

    approval.windowId = createdWindow.id;
    approvals[state.id] = approval;
    await approvalsStorage.set(approvals);
    return approval;
  }

  private awaitApproval(approvalId: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pendingApprovals.set(approvalId, { resolve, reject });
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

  private async getUnlockedSecret(walletId: string, vault: NonNullable<ReturnType<typeof getSelectedWallet>>['vault'], password?: string) {
    const cached = this.unlockedSecrets[walletId];
    if (cached) {
      return cached.secret;
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
          await controller.createWallet({ kind: 'mnemonic', mnemonic: message.mnemonic }, message.password, message.publicKey);
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_import':
          await controller.createWallet({ kind: 'mnemonic', mnemonic: message.mnemonic }, message.password, message.publicKey);
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_import_private_key':
          await controller.createWallet({ kind: 'private-key', secretKey: message.privateKey }, message.password, message.publicKey);
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
            }
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
        case 'wallet_set_network':
          sendResponse(await controller.setNetwork(message.network));
          break;
        case 'wallet_set_theme':
          sendResponse(await controller.setTheme(message.theme));
          break;
        case 'wallet_select':
          sendResponse(await controller.selectWallet(message.walletId));
          break;
        case 'wallet_set_idle_timeout':
          sendResponse(await controller.setIdleTimeout(message.idleTimeoutMs));
          break;
        case 'wallet_get_balance':
          sendResponse({ lamports: await controller.getBalanceLamports() });
          break;
        case 'wallet_get_assets':
          sendResponse(await controller.getAssets());
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
  if (port.name !== 'grape-provider') {
    return;
  }

  port.onMessage.addListener((rawMessage) => {
    void (async () => {
      try {
        const request = providerRequestSchema.parse(rawMessage);
        const result = await controller.handleProviderRequest(request);
        port.postMessage({
          id: request.id,
          success: true,
          result
        });
      } catch (error) {
        const requestId = typeof rawMessage?.id === 'string' ? rawMessage.id : crypto.randomUUID();
        port.postMessage({
          id: requestId,
          success: false,
          error: normalizeError(error)
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
