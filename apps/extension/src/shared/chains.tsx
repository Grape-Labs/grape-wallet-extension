import { useId } from 'react';
import type { GrapeChain } from '@grape/core';

function SolanaIcon(props: { gradientId: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chain-icon-svg">
      <defs>
        <linearGradient id={props.gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00ffa3" />
          <stop offset="100%" stopColor="#dc1fff" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${props.gradientId})`}
        d="M6.2 6.2A1.5 1.5 0 0 1 7.3 5.7h10.5c1.3 0 1.9 1.6.9 2.5l-2 1.8a1.5 1.5 0 0 1-1 .4H5.2c-1.3 0-1.9-1.6-.9-2.5z"
      />
      <path
        fill={`url(#${props.gradientId})`}
        d="M6.2 12.8a1.5 1.5 0 0 1 1.1-.5h10.5c1.3 0 1.9 1.6.9 2.5l-2 1.8a1.5 1.5 0 0 1-1 .4H5.2c-1.3 0-1.9-1.6-.9-2.5z"
      />
      <path
        fill={`url(#${props.gradientId})`}
        d="M18.8 9.5A1.5 1.5 0 0 0 17.7 9H7.2c-1.3 0-1.9 1.6-.9 2.5l2 1.8a1.5 1.5 0 0 0 1 .4h10.5c1.3 0 1.9-1.6.9-2.5z"
      />
    </svg>
  );
}

function SuiIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chain-icon-svg">
      <path
        fill="currentColor"
        d="M12 3.2c2.9 3.4 6.2 7.3 6.2 11.1A6.2 6.2 0 1 1 5.8 14.3C5.8 10.5 9.1 6.6 12 3.2m0 3.1c-2.2 2.7-4.1 5.3-4.1 8a4.1 4.1 0 1 0 8.2 0c0-2.7-1.9-5.3-4.1-8m0 2.4c1.2 1.6 2.2 3.2 2.2 4.8a2.2 2.2 0 1 1-4.4 0c0-1.6 1-3.2 2.2-4.8"
      />
    </svg>
  );
}

function EthereumIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chain-icon-svg">
      <path fill="currentColor" opacity="0.92" d="M12 2.8 6.7 11.6 12 14.7l5.3-3.1z" />
      <path fill="currentColor" opacity="0.65" d="M12 2.8v11.9l5.3-3.1z" />
      <path fill="currentColor" opacity="0.82" d="m6.7 12.8 5.3 8.4 5.3-8.4-5.3 3.1z" />
      <path fill="currentColor" opacity="0.58" d="M12 15.9v5.3l5.3-8.4z" />
    </svg>
  );
}

function MonadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chain-icon-svg">
      <path
        fill="currentColor"
        d="M6.2 17.8V6.2h2.2l3.6 4.5 3.7-4.5h2.1v11.6h-2.5v-7.5l-3.3 4h-.1l-3.2-4v7.5z"
      />
    </svg>
  );
}

export function ChainLogoBadge(props: { chain: GrapeChain; className?: string }) {
  const gradientId = useId().replace(/:/g, '-');

  return (
    <span className={`chain-logo-badge chain-logo-${props.chain} ${props.className ?? ''}`.trim()} aria-hidden="true">
      {props.chain === 'solana' ? (
        <SolanaIcon gradientId={`chain-solana-gradient-${gradientId}`} />
      ) : props.chain === 'sui' ? (
        <SuiIcon />
      ) : props.chain === 'ethereum' ? (
        <EthereumIcon />
      ) : (
        <MonadIcon />
      )}
    </span>
  );
}
