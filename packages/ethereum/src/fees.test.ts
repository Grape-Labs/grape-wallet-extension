import { describe, expect, it, vi } from 'vitest';
import { estimateEvmTransfer, estimateEvmRoute, createEthereumPublicClient } from './index';
const sender = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
function client(balance = 1000000000000000001n) {
  return { getBalance: vi.fn(async () => balance), getGasPrice: vi.fn(async () => 1000000000n), estimateGas: vi.fn(async () => 21000n), readContract: vi.fn(async () => 1234567890123456789n) };
}
const asClient = (value: ReturnType<typeof client>) => value as unknown as ReturnType<typeof createEthereumPublicClient>;
describe('EVM send fee budgets', () => {
  it('reserves gas for Max without losing a single wei', async () => {
    const rpc = client();
    const result = await estimateEvmTransfer(asClient(rpc), { sender, recipient, decimals: 18, amount: '0', maximum: true });
    expect(result.amount).toBe('0.999974800000000001');
    expect(result.gas * result.gasPrice).toBe(25200000000000n);
    expect(result.fee).toBe('0.000021');
    expect(result.reserve).toBe('0.0000252');
  });
  it('blocks full balance sends instead of assuming gas is free', async () => {
    await expect(estimateEvmTransfer(asClient(client()), { sender, recipient, decimals: 18, amount: '1' })).rejects.toThrow('Insufficient');
  });
  it('keeps exact token units while reserving gas in the native asset', async () => {
    const result = await estimateEvmTransfer(asClient(client()), { sender, recipient, tokenAddress: recipient, decimals: 18, amount: '0', maximum: true });
    expect(result.amount).toBe('1.234567890123456789');
  });
  it('accounts for Monad charging the submitted gas limit', async () => {
    const result = await estimateEvmTransfer(asClient(client()), { sender, recipient, decimals: 18, amount: '0.5', chargeGasLimit: true });
    expect(result.fee).toBe(result.reserve);
    expect(result.fee).toBe('0.0000252');
  });
  it('propagates RPC failure and validates recipient', async () => {
    const rpc = client(); rpc.getGasPrice.mockRejectedValueOnce(new Error('offline'));
    await expect(estimateEvmTransfer(asClient(rpc), { sender, recipient, decimals: 18, amount: '0.5' })).rejects.toThrow('offline');
    await expect(estimateEvmTransfer(asClient(client()), { sender, recipient: 'bad', decimals: 18, amount: '0.5' })).rejects.toThrow('recipient');
  });
});


describe('prepared EVM route fees', () => {
  it('reserves route value beyond native input and buffers gas', async () => {
    const estimate = await estimateEvmRoute(asClient(client()), { sender, to: recipient, value: '500000000000000000', nativeAmountRaw: 490000000000000000n });
    expect(estimate.feeWei).toBe(21000000000000n);
    expect(estimate.reserveWei).toBe(10025200000000000n);
  });
  it('blocks a route that cannot cover value and gas', async () => {
    await expect(estimateEvmRoute(asClient(client(500000000000000000n)), { sender, to: recipient, value: '500000000000000000', nativeAmountRaw: 500000000000000000n })).rejects.toThrow('Insufficient');
  });
  it('charges Monad on the submitted gas limit and propagates simulation errors', async () => {
    expect((await estimateEvmRoute(asClient(client()), { sender, to: recipient, nativeAmountRaw: 0n, chargeGasLimit: true })).feeWei).toBe(25200000000000n);
    const rpc = client(); rpc.estimateGas.mockRejectedValueOnce(new Error('allowance too low'));
    await expect(estimateEvmRoute(asClient(rpc), { sender, to: recipient, nativeAmountRaw: 0n })).rejects.toThrow('allowance too low');
  });
});
