import { useId, useState } from 'react';
import type { StakeValidatorRow } from '../../shared/models';

export function currentStakeApr(validator: StakeValidatorRow | undefined, now = Date.now()): number | null {
  const rate = validator?.estimatedApr;
  const updated = validator?.yieldUpdatedAt;
  return updated != null && updated <= now && now - updated < 15 * 60_000 && rate != null && Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
}

export function projectedStakeBalance(principal: number, apr: number, months: number) {
  return principal * (1 + apr / 100 * months / 12);
}

export function StakeComparison({ selected, validators, principal, solPrice, privacy, unavailable }: {
  selected: StakeValidatorRow | undefined; validators: StakeValidatorRow[]; principal: number | null;
  solPrice: number | null; privacy: boolean; unavailable: boolean;
}) {
  const [comparison, setComparison] = useState('wallet');
  const [months, setMonths] = useState(12);
  const id = useId();
  const other = validators.find(item => item.voteAccount === comparison);
  const rate = unavailable ? null : currentStakeApr(selected);
  const otherRate = comparison === 'wallet' ? 0 : unavailable || comparison === selected?.voteAccount ? null : currentStakeApr(other);
  const ready = rate != null && otherRate != null && principal != null && principal > 0;
  const name = (item: StakeValidatorRow | undefined) => item?.name || (item ? `${item.voteAccount.slice(0, 4)}…${item.voteAccount.slice(-4)}` : 'Selected validator');
  const otherName = comparison === 'wallet' ? 'Unstaked SOL' : name(other);
  const number = (value: number) => privacy ? '••••' : value > 0 && value < .0001 ? '<0.0001' : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  const end = ready ? projectedStakeBalance(principal, rate, months) : 0;
  const otherEnd = ready ? projectedStakeBalance(principal, otherRate, months) : 0;
  const difference = end - otherEnd;
  const fiat = !privacy && solPrice != null && Number.isFinite(solPrice) && solPrice > 0 ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Math.abs(difference) * solPrice) : null;
  // Start the value axis at zero so a small yield difference is not exaggerated.
  const ceiling = ready ? Math.max(end, otherEnd) * 1.08 : 1;
  const y = (value: number) => 150 - value / ceiling * 125;
  const path = (apr: number) => Array.from({ length: months + 1 }, (_, index) => `${index ? 'L' : 'M'} ${48 + index / months * 400} ${y(projectedStakeBalance(principal!, apr, index))}`).join(' ');

  return <details className="stake-comparison">
    <summary>Compare potential returns<span aria-hidden="true">↗</span></summary>
    <div className="stake-comparison-body">
      <div className="stake-comparison-controls"><label htmlFor={`${id}-validator`}>Compare {name(selected)} with<select id={`${id}-validator`} value={comparison} onChange={event => setComparison(event.target.value)}><option value="wallet">Unstaked SOL · 0%</option>{validators.filter(item => item.voteAccount !== selected?.voteAccount).map(item => <option key={item.voteAccount} value={item.voteAccount}>{name(item)} · {currentStakeApr(item) == null ? 'Rate unavailable' : `${currentStakeApr(item)!.toLocaleString(undefined, { maximumFractionDigits: 2 })}% est. APR`}</option>)}</select></label><label htmlFor={`${id}-period`}>Time period<select id={`${id}-period`} value={months} onChange={event => setMonths(Number(event.target.value))}>{[3, 6, 12].map(value => <option key={value} value={value}>{value} months</option>)}</select></label></div>
      {ready ? <>
        <p className="stake-comparison-difference">Over {months} months, {name(selected)} could earn <strong>{difference === 0 ? 'the same SOL rewards' : `${number(Math.abs(difference))} SOL ${difference > 0 ? 'more' : 'less'}${fiat ? ` (${fiat})` : ''}`}</strong> than {otherName}.</p>
        <dl className="stake-comparison-legend"><div><dt><i />{name(selected)} · {rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}% APR</dt><dd>{number(end)} SOL</dd></div><div><dt><i />{otherName} · {otherRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}% APR</dt><dd>{number(otherEnd)} SOL</dd></div></dl>
        {!privacy ? <svg className="stake-comparison-chart" viewBox="0 0 460 180" role="img" aria-labelledby={`${id}-chart`}><title id={`${id}-chart`}>Projected SOL balances over {months} months, assuming unchanged rates and no compounding. {name(selected)}: {number(end)} SOL. {otherName}: {number(otherEnd)} SOL.</title>{[0, .5, 1].map(fraction => <g key={fraction}><line x1="48" x2="448" y1={y(ceiling * fraction)} y2={y(ceiling * fraction)} className="stake-chart-grid" /><text x="40" y={y(ceiling * fraction) + 4} textAnchor="end">{(ceiling * fraction).toLocaleString(undefined, { maximumSignificantDigits: 3 })}</text></g>)}<path d={path(otherRate)} className="stake-chart-other" /><path d={path(rate)} className="stake-chart-selected" /><text x="48" y="174">Today</text><text x="448" y="174" textAnchor="end">{months} months</text></svg> : <p className="stake-helper">Chart hidden while balance privacy is on.</p>}
      </> : <p className="stake-helper">{!selected ? 'Choose a validator to compare returns.' : principal == null ? 'Enter a valid SOL amount to compare returns.' : 'Fresh rates are unavailable for this comparison. Refresh staking or choose another validator.'}</p>}
      <p className="stake-helper">Projection using current estimated APRs, after validator commission. Rates are held constant; differences between validators reflect commission only. Excludes compounding, validator performance, MEV, fees, and activation time. USD uses today’s SOL price.</p>
    </div>
  </details>;
}
