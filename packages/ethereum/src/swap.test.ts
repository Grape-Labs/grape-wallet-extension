import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  sendTransaction: vi.fn(async () => '0xswap'),
  writeContract: vi.fn(async () => '0xapproval'),
  readContract: vi.fn(async () => 0n),
  waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' }))
}));
vi.mock('viem', async (original) => ({
  ...await original<typeof import('viem')>(),
  createPublicClient: () => mocks,
  createWalletClient: () => mocks
}));
import { sendEthereumTransactionRequest } from './index';
const token = '0x1111111111111111111111111111111111111111';
const spender = '0x2222222222222222222222222222222222222222';
const secret = { kind: 'private-key' as const, secretKey: `0x${'1'.repeat(64)}` };
const input = { to: spender, data: '0x1234', value: '0x01', gas: '0x493e0', gasPrice: '0x3b9aca00' };

describe('Ethereum swap submission', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.readContract.mockResolvedValue(0n); mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'success' }); });
  it('forwards quote calldata, value and gas for native swaps without approval', async () => {
    await sendEthereumTransactionRequest('mainnet', secret, input);
    expect(mocks.writeContract).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).toHaveBeenCalledWith(expect.objectContaining({ to: spender, data: '0x1234', value: 1n, gas: 300000n, gasPrice: 1000000000n }));
  });
  it('waits for an exact amount approval before submitting an ERC20 swap', async () => {
    await sendEthereumTransactionRequest('mainnet', secret, { ...input, approval: { tokenAddress: token, spender, amount: '123' } });
    expect(mocks.writeContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'approve', args: [spender, 123n] }));
    expect(mocks.waitForTransactionReceipt.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendTransaction.mock.invocationCallOrder[0]);
  });
  it('does not submit the swap when approval reverts', async () => {
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });
    await expect(sendEthereumTransactionRequest('mainnet', secret, { ...input, approval: { tokenAddress: token, spender, amount: '123' } })).rejects.toThrow('approval failed');
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });
  it('reports a mined swap revert instead of reporting success', async () => {
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });
    await expect(sendEthereumTransactionRequest('mainnet', secret, { ...input, waitForReceipt: true })).rejects.toThrow('Swap transaction reverted');
  });
  it('resets an insufficient nonzero allowance before exact approval', async () => {
    mocks.readContract.mockResolvedValue(1n);
    await sendEthereumTransactionRequest('mainnet', secret, { ...input, approval: { tokenAddress: token, spender, amount: '123' } });
    expect(mocks.writeContract).toHaveBeenNthCalledWith(1, expect.objectContaining({ args: [spender, 0n] }));
    expect(mocks.writeContract).toHaveBeenNthCalledWith(2, expect.objectContaining({ args: [spender, 123n] }));
  });
  it('skips approval when allowance is sufficient', async () => {
    mocks.readContract.mockResolvedValue(123n);
    await sendEthereumTransactionRequest('mainnet', secret, { ...input, approval: { tokenAddress: token, spender, amount: '123' } });
    expect(mocks.writeContract).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).toHaveBeenCalledOnce();
  });
});
