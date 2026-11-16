import { useId } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import './grape-privacy-flow.css';

/** An illustration of the selected route, never a transaction progress indicator. */
export function GrapePrivacyFlow({ action }: { action: 'deposit' | 'withdraw' | 'transfer' }) {
  const id = `grape-flow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const reverse = action === 'withdraw';
  const privateSource = action === 'transfer';
  const title = action === 'deposit' ? 'Deposit preview' : reverse ? 'Withdrawal preview' : 'Private send preview';
  const vines = [
    'M75 70 C112 70 110 36 144 36 C181 36 179 104 216 104 C253 104 250 70 285 70',
    'M75 70 C112 70 110 104 144 104 C181 104 179 36 216 36 C253 36 250 70 285 70',
  ];
  const grape = (x: number) => <g transform={`translate(${x} 70)`}>
    <circle r="28" className="grape-flow-private-node" />
    <image href="/icons/grape_logo_white.svg" x="-21" y="-23" width="42" height="42" />
    <g transform="translate(17 18)" className="grape-flow-lock"><circle r="10" /><path d="M-3-1v-2a3 3 0 0 1 6 0v2M-4-1h8v6h-8z" /></g>
  </g>;

  return <figure className={`grape-flow grape-flow-${action}`} aria-label={title}>
    <div className="grape-flow-eyebrow"><span className="grape-flow-dot" />{title}</div>
    <svg viewBox="0 0 360 140" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-vine`} x1="0" x2="1"><stop stopColor="#54d8c8" /><stop offset=".5" stopColor="#b190ff" /><stop offset="1" stopColor="#b744f6" /></linearGradient>
        <radialGradient id={`${id}-aura`}><stop stopColor="#a451ed" stopOpacity=".22" /><stop offset="1" stopColor="#a451ed" stopOpacity="0" /></radialGradient>
        {vines.map((path, index) => <path key={index} id={`${id}-vine-${index}`} d={path} />)}
      </defs>
      <circle cx="180" cy="70" r="60" fill={`url(#${id}-aura)`} />
      {vines.map((path, index) => <path key={index} d={path} fill="none" stroke={`url(#${id}-vine)`} strokeWidth="1.3" opacity=".32" />)}
      <g className="grape-flow-moving">
        {Array.from({ length: 8 }, (_, index) => <circle key={index} r={index % 3 === 0 ? 3.4 : 2.3} fill={index % 2 ? '#b999ff' : '#60decd'}>
          <animateMotion dur="4.8s" repeatCount="indefinite" begin={`${-index * .6}s`} keyPoints={reverse ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear"><mpath href={`#${id}-vine-${index % 2}`} /></animateMotion>
          <animate attributeName="opacity" values="0;.9;.9;0" keyTimes="0;.12;.88;1" dur="4.8s" repeatCount="indefinite" begin={`${-index * .6}s`} />
        </circle>)}
      </g>
      <g className="grape-flow-still" fill="#b999ff"><circle cx="136" cy="37" r="2.8" /><circle cx="180" cy="70" r="2.8" /><circle cx="224" cy="103" r="2.8" /></g>
      <g transform="translate(180 70)">
        <g className="grape-flow-orbit"><ellipse rx="30" ry="42" fill="none" stroke="#b18ae8" strokeWidth=".75" strokeDasharray="2 7" opacity=".4" /></g>
        <path d="M0-31 C12-26 22-17 22-3 C22 12 12 23 0 31 C-12 23-22 12-22-3 C-22-17-12-26 0-31Z" className="grape-flow-veil" />
        <g className="grape-flow-cluster" fill="#bb94f4">
          <circle cx="-7" cy="-7" r="5" /><circle cx="7" cy="-7" r="5" />
          <circle cx="-7" cy="7" r="5" /><circle cx="7" cy="7" r="5" /><circle cy="19" r="4" />
          <path d="M0-14 Q-2-25 9-25 Q9-17 0-14" fill="#66d3b4" />
        </g>
      </g>
      {privateSource ? grape(45) : <g transform="translate(45 70)">
        <circle r="28" className="grape-flow-public-node" />
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M-12-10h20v4h-20a3 3 0 0 1 0-6h17M-12-6v17h25V-6z" /><path d="M5 0h8v6H5z" /><circle cx="8" cy="3" r=".8" fill="currentColor" /></g>
      </g>}
      {grape(315)}
    </svg>
    <figcaption><span>{privateSource ? 'Your private balance' : 'Public balance'}</span>{reverse ? <ArrowLeft size={15} aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}<span>{privateSource ? 'Recipient’s private balance' : 'Private balance'}</span></figcaption>
  </figure>;
}
