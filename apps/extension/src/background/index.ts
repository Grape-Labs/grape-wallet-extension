import {
  createPendingApproval,
  grantPermissions,
  hasPermission,
  isSessionExpired,
  listPermissions,
  revokeOriginPermissions,
  runtimeMessageSchema,
  type ProviderRequest,
  providerRequestSchema,
  RpcError,
  STORAGE_KEYS,
  type RuntimeMessage
} from '@grape/core';
import { deriveSolanaAccount0, signAndSendSerializedTransaction, signMessageBytes, signSerializedTransaction, signSerializedTransactions, summarizeTransaction, SOLANA_RPC_ENDPOINTS } from '@grape/solana';
import { Connection, PublicKey } from '@solana/web3.js';

import type { ApprovalRecord } from '../shared/models';

import { ChromeStorageArea, permissionsStorage, sessionStorage, walletStateStorage } from '../shared/chrome';

const approvalsStorage = new ChromeStorageArea<Record<string, ApprovalRecord>>(chrome.storage.local, STORAGE_KEYS.approvals, {});

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

class WalletController {
  private readonly pendingApprovals = new Map<string, PendingResolver>();

  async getWalletState() {
    return walletStateStorage.get();
  }

  async getSessionState() {
    const wallet = await this.getWalletState();
    const session = await sessionStorage.get();
    if (isSessionExpired(session, wallet.idleTimeoutMs)) {
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
    if (wallet.setup !== 'ready' || !wallet.vault || !wallet.selectedAccountId) {
      throw new RpcError('WALLET_NOT_READY', 'Wallet has not been created or imported yet.');
    }
    return wallet;
  }

  async createWallet(mnemonic: string, password: string, publicKey: string) {
    const { createVaultRecord } = await import('@grape/core');
    const account = {
      id: 'account-0',
      index: 0,
      publicKey,
      derivationPath: `m/44'/501'/0'/0'`
    };
    const current = await this.getWalletState();
    const nextState = {
      ...current,
      setup: 'ready' as const,
      vault: await createVaultRecord({ mnemonic }, password),
      accounts: [account],
      selectedAccountId: account.id
    };
    await walletStateStorage.set(nextState);
    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    return nextState;
  }

  async unlockWallet(password: string) {
    const wallet = await this.ensureReadyWallet();
    const { verifyVaultPassword } = await import('@grape/core');
    const valid = await verifyVaultPassword(wallet.vault!, password);
    if (!valid) {
      throw new RpcError('INVALID_PASSWORD', 'Password is incorrect.');
    }
    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    return true;
  }

  async lockWallet() {
    await this.setSessionState({ locked: true, lastActivityAt: 0 });
    return true;
  }

  async getActiveAccount() {
    const wallet = await this.getWalletState();
    return wallet.accounts.find((account) => account.id === wallet.selectedAccountId);
  }

  async getStateResponse() {
    const [wallet, session, permissions, activeAccount] = await Promise.all([
      this.getWalletState(),
      this.getSessionState(),
      permissionsStorage.get(),
      this.getActiveAccount()
    ]);

    return {
      wallet,
      session,
      permissions: listPermissions(permissions),
      activeAccount: activeAccount ? { publicKey: activeAccount.publicKey } : undefined
    };
  }

  async setNetwork(network: 'mainnet-beta' | 'devnet') {
    const wallet = await this.ensureReadyWallet();
    await walletStateStorage.set({
      ...wallet,
      selectedNetwork: network
    });
    return this.getStateResponse();
  }

  async setIdleTimeout(idleTimeoutMs: number) {
    const wallet = await this.ensureReadyWallet();
    await walletStateStorage.set({
      ...wallet,
      idleTimeoutMs
    });
    return this.getStateResponse();
  }

  async getBalanceLamports() {
    const wallet = await this.ensureReadyWallet();
    const activeAccount = wallet.accounts.find((account) => account.id === wallet.selectedAccountId);
    if (!activeAccount) {
      return null;
    }
    const connection = new Connection(SOLANA_RPC_ENDPOINTS[wallet.selectedNetwork], 'confirmed');
    return connection.getBalance(new PublicKey(activeAccount.publicKey));
  }

  async revokePermission(origin: string) {
    const permissions = await permissionsStorage.get();
    await permissionsStorage.set(revokeOriginPermissions(permissions, origin));
    return this.getStateResponse();
  }

  async handleProviderRequest(request: ProviderRequest): Promise<unknown> {
    const wallet = await this.ensureReadyWallet();
    const activeAccount = wallet.accounts.find((account) => account.id === wallet.selectedAccountId);
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

      const approval = await this.createApproval(request, wallet.selectedNetwork, activeAccount.publicKey, {
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

    const approval = await this.createApproval(request, wallet.selectedNetwork, activeAccount.publicKey, {
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

    if (!password) {
      throw new RpcError('PASSWORD_REQUIRED', 'Password is required to sign.');
    }

    const wallet = await this.ensureReadyWallet();
    const { unlockVaultRecord } = await import('@grape/core');
    const secret = await unlockVaultRecord(wallet.vault!, password);
    const account = deriveSolanaAccount0(secret.mnemonic);

    switch (approval.kind) {
      case 'sign-message': {
        const messageRequest = approval.request as Extract<ProviderRequest, { method: 'signMessage' }>;
        const signature = signMessageBytes(
          atobBytes(messageRequest.params.message),
          account.keypair
        );
        return {
          publicKey: account.publicKey,
          signature: arrayBufferToBase64(signature)
        };
      }
      case 'sign-transaction': {
        const transactionRequest = approval.request as Extract<ProviderRequest, { method: 'signTransaction' }>;
        return {
          transaction: signSerializedTransaction(transactionRequest.params.transaction, account.keypair)
        };
      }
      case 'sign-all-transactions': {
        const transactionsRequest = approval.request as Extract<ProviderRequest, { method: 'signAllTransactions' }>;
        return {
          transactions: signSerializedTransactions(transactionsRequest.params.transactions, account.keypair)
        };
      }
      case 'sign-and-send-transaction': {
        const transactionRequest = approval.request as Extract<ProviderRequest, { method: 'signAndSendTransaction' }>;
        return {
          signature: await signAndSendSerializedTransaction(transactionRequest.params.transaction, account.keypair, approval.network)
        };
      }
      default:
        throw new RpcError('UNKNOWN_APPROVAL', 'Unsupported approval kind.');
    }
  }

  private async createApproval(
    request: ProviderRequest,
    network: 'mainnet-beta' | 'devnet',
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
      transactionSummary: extras?.transactionSummary
    };

    const approvals = await approvalsStorage.get();
    approvals[state.id] = approval;
    await approvalsStorage.set(approvals);

    const createdWindow = await chrome.windows.create({
      url: chrome.runtime.getURL(`approval.html?approvalId=${approval.id}`),
      type: 'popup',
      width: 420,
      height: 760
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
        case 'wallet_import':
          await controller.createWallet(message.mnemonic, message.password, message.publicKey);
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
        case 'wallet_set_idle_timeout':
          sendResponse(await controller.setIdleTimeout(message.idleTimeoutMs));
          break;
        case 'wallet_get_balance':
          sendResponse({ lamports: await controller.getBalanceLamports() });
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
