import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTransaction } from 'viem';

const mocks = vi.hoisted(() => ({
  getAddress: vi.fn(), clearSignTransaction: vi.fn(), signTransaction: vi.fn(),
  openConnected: vi.fn(), close: vi.fn(async () => {}),
  prepareTransactionRequest: vi.fn(), sendRawTransaction: vi.fn(),
  readContract: vi.fn(), waitForTransactionReceipt: vi.fn()
}));
vi.mock('@ledgerhq/hw-app-eth', () => ({ default: class { constructor() { return mocks; } } }));
vi.mock('@ledgerhq/hw-transport-webhid', () => ({ default: { openConnected: mocks.openConnected } }));
vi.mock('viem', async (original) => ({
  ...await original<typeof import('viem')>(), createPublicClient: () => mocks
}));
import { sendEthereumTransactionRequestWithLedger } from './ledger';

const owner = '0x1111111111111111111111111111111111111111';
const target = '0x2222222222222222222222222222222222222222';
const token = '0x3333333333333333333333333333333333333333';
const path = "44'/60'/0'/0/2";
const input = { to: target, expectedAddress: owner, data: '0x1234', value: '10000000000000000', gas: '0x493e0', gasPrice: '1000000000', waitForReceipt: true };

describe('Ledger Ethereum swaps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openConnected.mockResolvedValue({ close: mocks.close });
    mocks.getAddress.mockResolvedValue({ address: owner });
    mocks.clearSignTransaction.mockResolvedValue({ r: '1'.repeat(64), s: '2'.repeat(64), v: '25' });
    mocks.prepareTransactionRequest.mockImplementation(async (tx) => ({ ...tx, chainId: 1, type: 'legacy', nonce: 0, gas: tx.gas ?? 60000n, gasPrice: tx.gasPrice ?? 1000000000n }));
    mocks.sendRawTransaction.mockResolvedValue(`0x${'a'.repeat(64)}`);
    mocks.readContract.mockResolvedValue(0n);
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
  });

  it('signs ETH quote calldata and gas on the selected Ledger account and broadcasts it', async () => {
    await sendEthereumTransactionRequestWithLedger('mainnet', path, input);
    expect(mocks.getAddress).toHaveBeenCalledWith(path, false, false, '1');
    expect(mocks.clearSignTransaction).toHaveBeenCalledWith(path, expect.any(String), { erc20: true, externalPlugins: true, nft: false });
    const tx = parseTransaction(mocks.sendRawTransaction.mock.calls[0][0].serializedTransaction);
    expect(tx).toMatchObject({ chainId: 1, to: target, data: '0x1234', value: 10000000000000000n, gas: 300000n, gasPrice: 1000000000n });
    expect(mocks.readContract).not.toHaveBeenCalled();
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('does not sign or broadcast for the wrong Ledger account', async () => {
    mocks.getAddress.mockResolvedValue({ address: target });
    await expect(sendEthereumTransactionRequestWithLedger('mainnet', path, input)).rejects.toThrow('does not match');
    expect(mocks.clearSignTransaction).not.toHaveBeenCalled();
    expect(mocks.sendRawTransaction).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('preserves user rejection and closes the transport without broadcasting', async () => {
    mocks.clearSignTransaction.mockRejectedValue({ statusCode: 0x6985 });
    await expect(sendEthereumTransactionRequestWithLedger('mainnet', path, input)).rejects.toThrow('rejected on Ledger');
    expect(mocks.sendRawTransaction).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('confirms the exact ERC20 approval before asking Ledger to sign the swap', async () => {
    await sendEthereumTransactionRequestWithLedger('mainnet', path, { ...input, approval: { tokenAddress: token, spender: target, amount: '123' } });
    expect(mocks.clearSignTransaction).toHaveBeenCalledTimes(2);
    const approval = parseTransaction(mocks.sendRawTransaction.mock.calls[0][0].serializedTransaction);
    expect(approval.to).toBe(token);
    expect(approval.value ?? 0n).toBe(0n);
    expect(approval.data).toBe(`0x095ea7b3${target.slice(2).padStart(64, '0')}${'7b'.padStart(64, '0')}`);
    expect(mocks.waitForTransactionReceipt.mock.invocationCallOrder[0]).toBeLessThan(mocks.clearSignTransaction.mock.invocationCallOrder[1]);
  });

  it('does not request a swap signature if approval reverts', async () => {
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });
    await expect(sendEthereumTransactionRequestWithLedger('mainnet', path, { ...input, approval: { tokenAddress: token, spender: target, amount: '123' } })).rejects.toThrow('Token approval reverted');
    expect(mocks.clearSignTransaction).toHaveBeenCalledOnce();
  });

  it('skips approval when allowance is sufficient', async () => {
    mocks.readContract.mockResolvedValue(123n);
    await sendEthereumTransactionRequestWithLedger('mainnet', path, { ...input, approval: { tokenAddress: token, spender: target, amount: '123' } });
    expect(mocks.clearSignTransaction).toHaveBeenCalledOnce();
  });

  it('reports disconnected devices without broadcasting', async () => {
    mocks.openConnected.mockResolvedValue(null);
    await expect(sendEthereumTransactionRequestWithLedger('mainnet', path, input)).rejects.toThrow('Ledger device not found');
    expect(mocks.sendRawTransaction).not.toHaveBeenCalled();
  });
});
