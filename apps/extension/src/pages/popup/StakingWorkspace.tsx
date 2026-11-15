import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, ChevronDown, ChevronRight, Copy, ExternalLink, Info, MoreHorizontal, Plus, RefreshCcw, Search, Sprout, X } from 'lucide-react';
import { redactRpcDetails, stakeWithdrawalMax } from '@grape/core';
import type { StakeAccountRow, StakeValidatorRow, WalletStakeActionResponse } from '../../shared/models';
import { parseStakeAmount, stakeAccountStatus, stakeSol } from './stakingPresentation';
import './staking.css';

type Action = 'stake' | 'deactivate' | 'withdraw';
type Screen = 'overview' | 'account' | 'stake' | 'withdraw' | 'review';
type Props = {
  accounts: StakeAccountRow[]; validators: StakeValidatorRow[]; loading: boolean; error: string | null;
  warnings: string[]; result: WalletStakeActionResponse | null; busy: Action | null;
  balanceLamports: number | null; solPrice: number | null; owner: string; privacy: boolean; watchOnly: boolean;
  network: 'mainnet-beta' | 'devnet'; signingControl: ReactNode; signingReady: boolean;
  onRefresh: () => void; onClearFeedback: () => void;
  onStake: (amount: string, vote: string) => Promise<boolean>;
  onUnstake: (address: string) => Promise<boolean>;
  onWithdraw: (address: string, amount: string) => Promise<boolean>;
};
const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
const validatorName = (validator: StakeValidatorRow | undefined, vote: string | null) => validator?.name || (vote ? `Validator ${short(vote)}` : 'Undelegated SOL');

export function StakingWorkspace(props: Props) {
  const [screen, setScreen] = useState<Screen>('overview');
  const [accountAddress, setAccountAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [vote, setVote] = useState('');
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState(false);
  const [action, setAction] = useState<Action>('stake');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const picker = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pickerTitle = useId();
  const amountId = useId();
  const manualId = useId();
  const account = props.accounts.find(item => item.address === accountAddress);
  const validator = props.validators.find(item => item.voteAccount === vote);
  const accountValidator = props.validators.find(item => item.voteAccount === account?.voter);
  const status = account ? stakeAccountStatus(account) : null;
  const total = props.accounts.reduce((sum, item) => sum + item.delegatedLamports, 0);
  const withdrawalMax = account ? stakeWithdrawalMax(account.lamports) : null;
  const amountLamports = parseStakeAmount(amount);
  const amountValid = amountLamports != null && (screen === 'withdraw' || action === 'withdraw' && screen === 'review'
    ? !!account && amountLamports <= BigInt(account.lamports)
    : props.balanceLamports != null && amountLamports < BigInt(props.balanceLamports));
  const voteValid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(vote.trim());
  const canUnstake = !!account && account.staker === props.owner && account.delegatedLamports > 0 && !status?.coolingDown && status?.tone !== 'neutral';
  const canWithdraw = !!account && account.withdrawer === props.owner;
  const maxDisabled = !withdrawalMax || !canWithdraw || props.watchOnly || !!props.busy;
  const applyWithdrawalMax = () => { if (!maxDisabled && withdrawalMax) setAmount(withdrawalMax); };
  const visibleValidators = useMemo(() => {
    const query = search.trim().toLowerCase();
    return props.validators.filter(item => `${item.name ?? ''} ${item.voteAccount}`.toLowerCase().includes(query)).slice(0, 80);
  }, [props.validators, search]);
  const fiat = (lamports: number) => props.privacy ? '••••' : props.solPrice != null && props.solPrice > 0
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(lamports / 1e9 * props.solPrice) : null;
  const sol = (lamports: number) => props.privacy ? '•••• SOL' : `${stakeSol(lamports)} SOL`;
  const explorer = (address: string) => `https://explorer.solana.com/address/${address}${props.network === 'devnet' ? '?cluster=devnet' : ''}`;

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [screen]);
  // A refresh may remove a closed stake account while its detail screen is open.
  useEffect(() => {
    if (!props.loading && !props.error && accountAddress && !account && screen !== 'overview' && screen !== 'stake' && !props.busy) setScreen('overview');
  }, [props.loading, props.error, props.busy, accountAddress, account, screen]);

  function go(next: Screen) { if (props.busy) return; props.onClearFeedback(); setScreen(next); setCopyError(false); setCopied(false); }
  function startStake() { setAmount(''); go('stake'); }
  function review(next: Action) { setAction(next); go('review'); }
  async function submit() {
    if (props.busy || props.watchOnly || !props.signingReady) return;
    if (action === 'stake' && (!amountValid || !voteValid)) return;
    if (action === 'deactivate' && !canUnstake || action === 'withdraw' && (!canWithdraw || !amountValid)) return;
    const success = action === 'stake' ? await props.onStake(amount.trim(), vote.trim())
      : action === 'deactivate' ? await props.onUnstake(accountAddress) : await props.onWithdraw(accountAddress, amount.trim());
    if (success) { setAmount(''); setScreen('overview'); }
  }
  const backTarget: Screen = screen === 'account' || screen === 'stake' ? 'overview' : screen === 'withdraw' ? 'account' : action === 'stake' ? 'stake' : action === 'withdraw' ? 'withdraw' : 'account';
  const title = screen === 'overview' ? 'Staking' : screen === 'account' ? 'Account details' : screen === 'stake' ? 'Stake SOL' : screen === 'withdraw' ? 'Withdraw SOL' : action === 'deactivate' ? 'Review unstaking' : action === 'withdraw' ? 'Review withdrawal' : 'Review stake';
  const balance = (lamports: number, label: string) => <div className="stake-balance"><span className="stake-eyebrow">{label}</span><strong>{fiat(lamports) ?? sol(lamports)}</strong>{fiat(lamports) ? <span className="stake-balance-sol">{sol(lamports)}</span> : null}</div>;
  const badge = (item: StakeAccountRow) => { const state = stakeAccountStatus(item); return <span className={`stake-badge ${state.tone}`}>{state.label}</span>; };
  const avatar = (name: string) => <span className="stake-validator-avatar" aria-hidden="true">{name.startsWith('Validator ') || name === 'Undelegated SOL' ? <Sprout size={22} /> : name.slice(0, 1).toUpperCase()}</span>;

  return <section className={`stake-workspace stake-screen-${screen}`} aria-busy={!!props.busy}>
    <header className="stake-topbar">
      {screen !== 'overview' ? <button type="button" className="stake-icon-button" aria-label="Back" disabled={!!props.busy} onClick={() => go(backTarget)}><ArrowLeft size={21} /></button> : null}
      <h2 ref={heading} tabIndex={-1}>{title}</h2>
      {screen === 'overview' ? <button type="button" className="stake-icon-button" onClick={props.onRefresh} disabled={props.loading || !!props.busy} aria-label="Refresh staking"><RefreshCcw className={props.loading ? 'stake-spin' : ''} size={18} /></button> : screen === 'account' && account ? <details className="stake-account-menu"><summary aria-label="Account options"><MoreHorizontal size={22} /></summary><div><a href={explorer(account.address)} target="_blank" rel="noopener noreferrer">View on explorer <ExternalLink size={15} /></a><button type="button" onClick={() => { void navigator.clipboard.writeText(account.address).then(() => { setCopied(true); setCopyError(false); }).catch(() => setCopyError(true)); }}>{copied ? 'Address copied' : 'Copy address'} {copied ? <Check size={15} /> : <Copy size={15} />}</button></div></details> : null}
    </header>
    {props.watchOnly ? <p className="stake-notice"><Info size={16} />You can view this wallet’s stakes. Connect a signing wallet to make changes.</p> : null}
    {props.error ? <p className="danger-box" role="alert">{redactRpcDetails(props.error)}</p> : null}
    {props.result && screen === 'overview' ? <div className="stake-submitted" role="status"><Check size={18} /><span>{props.result.action === 'stake' ? 'Stake submitted' : props.result.action === 'deactivate' ? 'Unstaking requested' : 'Withdrawal submitted'}<small>Waiting for the network to confirm.</small></span><a href={`https://explorer.solana.com/tx/${props.result.signature}${props.network === 'devnet' ? '?cluster=devnet' : ''}`} target="_blank" rel="noopener noreferrer" aria-label="View submitted transaction"><ExternalLink size={16} /></a></div> : null}

    {screen === 'overview' ? <>
      <div className="stake-overview-hero">
        {props.loading && !props.accounts.length ? <div className="stake-balance stake-skeleton" aria-label="Loading staking balances"><span /><strong /><span /></div> : props.error ? <div className="stake-balance"><span className="stake-eyebrow">Total staked</span><strong>Unavailable</strong><span className="stake-balance-sol">Refresh to check your stake accounts</span></div> : balance(total, props.warnings.length ? 'Staked · partial balance' : 'Total staked')}
        {!props.watchOnly ? <button type="button" className="stake-primary" disabled={props.loading || !!props.busy} onClick={startStake}><Plus size={18} />Stake SOL</button> : null}
      </div>
      {props.warnings.length ? <details className="stake-discovery-notice"><summary><Info size={15} />Some stake accounts may be missing<ChevronDown size={15} /></summary><p>The balance above includes only the accounts we could load.</p>{props.warnings.map(warning => <p key={warning}>{redactRpcDetails(warning)}</p>)}</details> : null}
      <div className="stake-overview-layout"><section className="stake-accounts-section"><div className="stake-section-heading"><h3>Your stake accounts</h3><span>{props.loading ? 'Refreshing…' : `${props.accounts.length} account${props.accounts.length === 1 ? '' : 's'}`}</span></div>
        {props.accounts.map(item => { const name = validatorName(props.validators.find(entry => entry.voteAccount === item.voter), item.voter); return <button key={item.address} type="button" className="stake-account-row" onClick={() => { setAccountAddress(item.address); go('account'); }}>
          {avatar(name)}<span className="stake-account-copy"><strong>{name}</strong><span>{badge(item)}<small>{short(item.address)}</small></span></span><span className="stake-account-value"><strong>{fiat(item.lamports) ?? sol(item.lamports)}</strong>{fiat(item.lamports) ? <small>{sol(item.lamports)}</small> : null}</span><ChevronRight size={17} /></button>; })}
        {!props.loading && !props.error && !props.accounts.length ? <div className="stake-empty"><Sprout size={32} /><h3>Your SOL can do more</h3><p>Stake with a validator and manage your stake accounts here.</p>{!props.watchOnly ? <button type="button" className="stake-text-button" onClick={startStake}>Create your first stake <ArrowUpRight size={16} /></button> : null}</div> : null}
      </section><aside className="stake-learn"><span className="stake-eyebrow">Good to know</span><h3>Staking, made simple</h3><details><summary>How does staking work?<ChevronDown size={15} /></summary><p>You delegate SOL to a validator while keeping control of your stake account. Rewards, when earned, are added to the staked balance.</p></details><details><summary>How do I get my SOL back?<ChevronDown size={15} /></summary><p>Open a stake account and choose Unstake. Once the network finishes deactivation, withdraw SOL to your wallet. This flow does not offer instant unstaking.</p></details><details><summary>Where are my rewards?<ChevronDown size={15} /></summary><p>Rewards are included in your stake account balance. Historical rewards and live APY are not currently available in Grape.</p></details></aside></div>
    </> : null}

    {screen === 'account' && account ? <div className="stake-detail-layout"><div>
      <div className="stake-detail-hero">{balance(account.lamports, 'Stake account balance')}{badge(account)}</div>
      <div className="stake-validator-detail">{avatar(validatorName(accountValidator, account.voter))}<span><strong>{validatorName(accountValidator, account.voter)}</strong><small>{accountValidator ? `${accountValidator.commission}% commission` : account.voter ? short(account.voter) : 'No validator selected'}</small></span>{account.voter ? <a href={explorer(account.voter)} aria-label="View validator on explorer" target="_blank" rel="noopener noreferrer"><ExternalLink size={17} /></a> : null}</div>
      <dl className="stake-facts"><div><dt>Delegated</dt><dd>{sol(account.delegatedLamports)}</dd></div><div><dt>Stake account</dt><dd><a href={explorer(account.address)} target="_blank" rel="noopener noreferrer">{short(account.address)}<ExternalLink size={13} /></a></dd></div><div><dt>Rewards</dt><dd>Included in balance</dd></div></dl>
      {copyError ? <p className="danger-box" role="alert">Could not copy. Open the explorer to copy the account address.</p> : null}
    </div><div className="stake-detail-actions">
      {status?.coolingDown ? <div className="stake-notice"><Info size={17} /><span>Unstaking is in progress. The network determines when your SOL becomes withdrawable.</span></div> : null}
      {canUnstake ? <button type="button" className="stake-primary" disabled={props.watchOnly || !!props.busy} onClick={() => review('deactivate')}>Unstake SOL</button> : null}
      {canWithdraw ? <button type="button" className="stake-secondary" disabled={props.watchOnly || !!props.busy} onClick={() => { setAmount(''); go('withdraw'); }}><ArrowDownToLine size={17} />Withdraw SOL</button> : null}
      <p className="stake-helper">Unstaking and withdrawing are separate steps. The network only permits withdrawing available SOL.</p>
      {!canUnstake && !canWithdraw ? <p className="stake-helper">Account permissions could not be verified for this wallet. Refresh staking to check again.</p> : null}
    </div></div> : null}

    {screen === 'stake' || screen === 'withdraw' ? <form className="stake-compose" onSubmit={event => { event.preventDefault(); if (amountValid && (screen === 'withdraw' ? canWithdraw : voteValid)) review(screen === 'withdraw' ? 'withdraw' : 'stake'); }}>
      <div className="stake-field-label"><label htmlFor={amountId}>Amount</label>{screen === 'withdraw' && account ? <button type="button" className="stake-balance-shortcut" aria-label="Use full account balance" disabled={maxDisabled} onClick={applyWithdrawalMax}>Account balance: {sol(account.lamports)}</button> : <span>{props.balanceLamports == null ? 'Balance unavailable' : `Available: ${sol(props.balanceLamports)}`}</span>}</div>
      <div className="stake-amount-input"><span className="stake-sol-avatar" aria-hidden="true">≋</span><strong>SOL</strong><input id={amountId} inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onChange={event => setAmount(event.target.value.replace(',', '.'))} aria-describedby="stake-amount-hint" />{screen === 'withdraw' ? <button type="button" className="stake-max-button" aria-label="Use maximum withdrawal amount" disabled={maxDisabled} onClick={applyWithdrawalMax}>Max</button> : null}</div>
      <p className="stake-helper" id="stake-amount-hint">{amount && !amountValid ? 'Enter a valid SOL amount within the available balance (up to 9 decimals).' : screen === 'stake' ? 'Leave SOL in your wallet for network fees and the stake account deposit.' : 'The account balance may include SOL that is still staked. Availability is enforced by the network.'}</p>
      {screen === 'stake' ? <><span className="stake-field-label">Validator</span><button type="button" className="stake-validator-trigger" aria-haspopup="dialog" onClick={() => { setSearch(''); picker.current?.showModal(); }}>{avatar(validatorName(validator, vote || null))}<span><strong>{vote ? validatorName(validator, vote) : 'Choose a validator'}</strong><small>{validator ? `${validator.commission}% commission` : 'Search by name or vote account'}</small></span><ChevronDown size={19} /></button>
      {validator ? <dl className="stake-facts"><div><dt>Validator commission</dt><dd>{validator.commission}%</dd></div><div><dt>Total validator stake</dt><dd>{sol(validator.activatedStakeLamports)}</dd></div></dl> : null}
      <button className="stake-text-button stake-manual-toggle" type="button" aria-expanded={manual} onClick={() => setManual(!manual)}>Use a validator vote address<ChevronDown size={14} /></button>{manual ? <label className="stake-manual" htmlFor={manualId}>Validator vote address<input id={manualId} value={vote} onChange={event => setVote(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste vote account address" /></label> : null}</> : null}
      <div className="stake-compose-footer"><p className="stake-helper">{screen === 'stake' ? 'You keep control of your stake account. Review your selection before authorizing.' : 'SOL will be sent to this wallet after a successful withdrawal.'}</p><button type="submit" className="stake-primary" disabled={!amountValid || (screen === 'stake' && !voteValid) || props.watchOnly || !!props.busy}>Review {screen === 'stake' ? 'stake' : 'withdrawal'}<ChevronRight size={18} /></button></div>
    </form> : null}

    {screen === 'review' ? <div className="stake-review">
      <span className="stake-review-icon"><Sprout size={28} /></span><h3>{action === 'deactivate' ? 'Start unstaking?' : `${action === 'stake' ? 'Stake' : 'Withdraw'} ${props.privacy ? '••••' : amount} SOL`}</h3>
      <p className="stake-helper">{action === 'deactivate' ? 'This deactivates your stake. Your SOL stays in the stake account until it is available to withdraw.' : action === 'stake' ? 'Creates a stake account and delegates your SOL to the selected validator. Network fees and a refundable account deposit are additional.' : 'Withdraws available SOL from this stake account to your wallet. The network rejects withdrawals that are not yet available.'}</p>
      <dl className="stake-facts"><div><dt>{action === 'stake' ? 'Validator' : 'Stake account'}</dt><dd>{action === 'stake' ? validatorName(validator, vote) : short(accountAddress)}</dd></div>{action === 'stake' ? <div><dt>Vote address</dt><dd className="stake-review-address">{vote}</dd></div> : null}<div><dt>Network</dt><dd>{props.network === 'devnet' ? 'Solana Devnet' : 'Solana Mainnet'}</dd></div><div><dt>{action === 'withdraw' ? 'Destination' : 'Wallet'}</dt><dd>{short(props.owner)}</dd></div></dl>
      {props.signingControl}
      <button type="button" className="stake-primary" onClick={() => void submit()} disabled={props.watchOnly || !!props.busy || !props.signingReady || (action === 'stake' ? !amountValid || !voteValid : action === 'deactivate' ? !canUnstake : !canWithdraw || !amountValid)}>{props.busy ? 'Submitting…' : action === 'stake' ? 'Confirm stake' : action === 'deactivate' ? 'Confirm unstaking' : 'Confirm withdrawal'}</button>
    </div> : null}

    <dialog ref={picker} className="stake-validator-picker" aria-labelledby={pickerTitle} onClick={event => { if (event.target === event.currentTarget) picker.current?.close(); }}><div className="stake-picker-heading"><h3 id={pickerTitle}>Choose a validator</h3><button type="button" className="stake-icon-button" aria-label="Close validator picker" onClick={() => picker.current?.close()}><X size={20} /></button></div><label className="stake-validator-search"><Search size={18} /><input aria-label="Search validators" placeholder="Search name or vote address" value={search} onChange={event => setSearch(event.target.value)} autoComplete="off" /></label><div className="stake-validator-list">{visibleValidators.map(item => <button type="button" key={item.voteAccount} onClick={() => { setVote(item.voteAccount); picker.current?.close(); }}>{avatar(validatorName(item, item.voteAccount))}<span><strong>{validatorName(item, item.voteAccount)}</strong><small>{item.commission}% commission · {short(item.voteAccount)}</small></span>{vote === item.voteAccount ? <Check size={18} /> : <ChevronRight size={16} />}</button>)}{!visibleValidators.length ? <p className="stake-helper">{props.loading ? 'Loading validators…' : search ? 'No matching validators. Try a vote address.' : 'Validators could not be loaded. Refresh staking or enter a vote address manually.'}</p> : null}</div></dialog>
  </section>;
}
