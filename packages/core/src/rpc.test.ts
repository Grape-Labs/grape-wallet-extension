import { describe, expect, it } from 'vitest';
import { DEFAULT_SOLANA_MAINNET_RPC_URL, redactRpcDetails } from './rpc';

describe('RPC display privacy', () => {
  it('removes the default request URL while retaining useful failure details', () => {
    expect(redactRpcDetails(`Request to ${DEFAULT_SOLANA_MAINNET_RPC_URL} failed: 429 rate limited`))
      .toBe('Request to [default Solana RPC] failed: 429 rate limited');
  });
  it('redacts a key echoed without its URL', () => {
    const key = new URL(DEFAULT_SOLANA_MAINNET_RPC_URL).searchParams.get('api_key')!;
    expect(redactRpcDetails(`Invalid API key: ${key}`)).toBe('Invalid API key: [hidden]');
  });
  it('redacts credentials in custom provider query parameters', () => {
    expect(redactRpcDetails('https://custom.example/?api_key=private&network=mainnet&token=secret'))
      .toBe('https://custom.example/?api_key=[hidden]&network=mainnet&token=[hidden]');
  });
  it('preserves ordinary RPC errors', () => {
    expect(redactRpcDetails('Insufficient SOL for transaction fees.')).toBe('Insufficient SOL for transaction fees.');
  });
});
