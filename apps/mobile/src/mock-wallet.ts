import type { GrapeChain } from '@grape/core';

export type MobileWalletSummary = {
  id: string;
  name: string;
  chain: GrapeChain;
  address: string;
  balanceLabel: string;
  sourceLabel: string;
};

export type MobileAssetRow = {
  id: string;
  symbol: string;
  name: string;
  amountLabel: string;
  valueLabel: string;
};

export const mockWallets: MobileWalletSummary[] = [
  {
    id: 'solana-main',
    name: 'Treasury',
    chain: 'solana',
    address: '9fQg...qTPz',
    balanceLabel: '$859.63',
    sourceLabel: 'Created'
  },
  {
    id: 'sui-main',
    name: 'Sui Ops',
    chain: 'sui',
    address: '0xbe...c176',
    balanceLabel: '$124.08',
    sourceLabel: 'Imported'
  },
  {
    id: 'eth-main',
    name: 'Ledger ETH',
    chain: 'ethereum',
    address: '0x8a...83d2',
    balanceLabel: '$2,104.12',
    sourceLabel: 'Hardware'
  }
];

export const mockAssetsByChain: Record<GrapeChain, MobileAssetRow[]> = {
  solana: [
    { id: 'sol', symbol: 'SOL', name: 'Solana', amountLabel: '3.29 SOL', valueLabel: '$447.81' },
    { id: 'usdc', symbol: 'USDC', name: 'USD Coin', amountLabel: '98.29 USDC', valueLabel: '$98.29' },
    { id: 'jup', symbol: 'JUP', name: 'Jupiter', amountLabel: '167.35 JUP', valueLabel: '$27.45' }
  ],
  sui: [
    { id: 'sui', symbol: 'SUI', name: 'Sui', amountLabel: '41.23 SUI', valueLabel: '$124.08' },
    { id: 'deep', symbol: 'DEEP', name: 'DeepBook', amountLabel: '3,500 DEEP', valueLabel: '$41.20' }
  ],
  monad: [
    { id: 'mon', symbol: 'MON', name: 'Monad', amountLabel: '12.45 MON', valueLabel: '$0.00' }
  ],
  ethereum: [
    { id: 'eth', symbol: 'ETH', name: 'Ether', amountLabel: '0.84 ETH', valueLabel: '$2,104.12' },
    { id: 'usdc', symbol: 'USDC', name: 'USD Coin', amountLabel: '420 USDC', valueLabel: '$420.00' }
  ]
};
