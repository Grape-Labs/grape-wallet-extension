import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Rocket, ShieldCheck, Bell } from 'lucide-react';
import { redactRpcDetails } from '@grape/core';
import { sendRuntimeMessage } from '../../shared/chrome';
import type { FoxMissionStatus, FoxMissionPreview, FoxMissionResult } from '../../shared/fox-missions';
import './fox-missions.css';
const date = (seconds: number) => new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const sol = (lamports: number) => (lamports / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 });
export function FoxMissionPanel({ mint, owner, watchOnly, unlocked, onLockChange, onChanged }: { mint: string; owner: string; watchOnly: boolean; unlocked: boolean; onLockChange: (locked: boolean) => void; onChanged?: () => void }) {
  const [status, setStatus] = useState<FoxMissionStatus | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [preview, setPreview] = useState<FoxMissionPreview | null>(null), [result, setResult] = useState<FoxMissionResult | null>(null), [password, setPassword] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!preview) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [preview]);
  useEffect(() => { onLockChange(loading || busy || !!preview || !status || !status.eligible || status.state !== 'ready' || !!status.pending); }, [loading, busy, preview, status, onLockChange]);
  useEffect(() => { let cancelled = false; setLoading(true); setStatus(null); setError(''); setPreview(null); setResult(null);
    void sendRuntimeMessage<FoxMissionStatus>({ type: 'wallet_fox_status', owner, mint }).then(s => { if (!cancelled) setStatus(s); }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mint, owner]);
  async function refresh() { setLoading(true); setStatus(null); setPreview(null); setError(''); try { setStatus(await sendRuntimeMessage<FoxMissionStatus>({ type: 'wallet_fox_status', mint, owner })); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load Fox missions.'); } finally { setLoading(false); } }
  async function review(action: 'start' | 'claim') { setBusy(true); setError(''); setPreview(null); setResult(null); try { const p = await sendRuntimeMessage<FoxMissionPreview>({ type: 'wallet_fox_preview', mint, owner, action }); setNow(Date.now()); setPreview(p); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to review mission.'); } finally { setBusy(false); } }
  async function toggleReminder() {
    setBusy(true); setError('');
    try {
      const enabled = !status?.reminderEnabled;
      if (enabled && !await chrome.permissions.request({ permissions: ['notifications'] })) throw new Error('Notifications were not enabled. You can still check mission status here.');
      setStatus(await sendRuntimeMessage<FoxMissionStatus>({ type: 'wallet_fox_reminder', owner, mint, enabled }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update reminders.'); }
    finally { setBusy(false); }
  }
  async function confirm() { if (!preview || now >= preview.expiresAt) return; const id = preview.id; setPreview(null); setBusy(true); setError(''); try { const r = await sendRuntimeMessage<FoxMissionResult>({ type: 'wallet_fox_execute', owner, previewId: id, password: unlocked ? undefined : password || undefined }); setResult(r); setPassword(''); await refresh(); onChanged?.(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to submit mission transaction.'); } finally { setBusy(false); } }
  return <section className="fox-missions" aria-label="Famous Fox missions"><header><span className="fox-missions-icon"><Rocket size={20} /></span><div><h2>Fox missions</h2><small>Famous Fox Federation · Mainnet</small></div><button type="button" aria-label="Refresh Fox missions" onClick={() => void refresh()} disabled={loading || busy}><RefreshCw size={17} /></button></header>
    {loading ? <p role="status">Checking your Fox and the weekly mission…</p> : status?.eligible ? <>
      <div className="fox-mission-stats"><div><small>FAME</small><strong>{status.fame ?? '0'}</strong></div><div><small>Missions completed</small><strong>{status.completedMissions ?? '0'}</strong></div><div><small>Status</small><strong>{status.pending ? 'Confirming' : status.state === 'claimable' ? 'Ready to claim' : status.state === 'locked' ? 'On mission' : status.state === 'ready' ? 'In wallet' : 'Unavailable'}</strong></div></div>
      {status.mission ? <div className="fox-current-mission"><h3>{status.mission.name}</h3><p>{status.state === 'locked' || status.state === 'claimable' ? `${status.state === 'claimable' ? 'Mission ended' : 'Locked until'} ${date(status.mission.endsAt)}` : `Entries: ${date(status.mission.opensAt)} – ${date(status.mission.closesAt)}`}</p>{status.state === 'ready' ? <small>Mission lock ends {date(status.mission.endsAt)}</small> : null}</div> : null}
      {status.state === 'locked' ? <p>Your Fox is on this mission. Claim it after the lock ends before sending it again.</p> : null}
      <button className="fox-reminder-toggle" type="button" role="switch" aria-checked={!!status.reminderEnabled} onClick={() => void toggleReminder()} disabled={busy || loading || status.held === false}><Bell size={17} /><span><strong>{status.reminderEnabled ? 'Mission reminders on' : 'Remind me when missions end'}</strong><small>Get a browser notification to claim this Fox and review the next mission. Grape never deploys it automatically. Reminders appear while your browser is running, or after it reopens.</small></span><i aria-hidden="true">{status.reminderEnabled ? 'On' : 'Off'}</i></button>
      {status.reason ? <p>{status.reason}</p> : null}
      {!preview && !watchOnly ? <>{status.canStart ? <button className="button primary" type="button" disabled={busy || loading} onClick={() => void review('start')}>Review mission</button> : null}{status.canClaim ? <button className="button primary" type="button" disabled={busy || loading} onClick={() => void review('claim')}>Review claim</button> : null}</> : null}
      {watchOnly ? <p>Connect a signing wallet to start or claim missions.</p> : null}
    </> : !error ? <p>{status?.reason ?? 'Mission information is unavailable.'}</p> : null}
    {preview ? <div className="fox-mission-review"><h3><ShieldCheck size={17} />{preview.action === 'start' ? 'Review mission deployment' : 'Review Fox and reward claim'}</h3><strong>{preview.missionName}</strong><p>{preview.action === 'start' ? `Your Fox stays in your wallet but is locked until you claim it after ${date(preview.endsAt)}. There is no early exit. This deploys one Fox without boosts.` : 'Return this Fox and claim its mission chest rewards in the same transaction.'}</p><dl><div><dt>Network fee</dt><dd>{sol(preview.networkFeeLamports)} SOL</dd></div><div><dt>Estimated wallet debit, including fee and setup</dt><dd>{sol(preview.estimatedDebitLamports)} SOL</dd></div></dl>{!unlocked ? <label>Wallet password<input type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} /></label> : null}<p role="status">{now >= preview.expiresAt ? 'Review expired. Refresh and review again.' : `Review expires in ${Math.ceil((preview.expiresAt - now) / 1000)} seconds.`}</p><div className="fox-review-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => { setPreview(null); setPassword(''); }}>Cancel</button><button type="button" className="button primary" disabled={busy || now >= preview.expiresAt || (!unlocked && !password)} onClick={() => void confirm()}>Confirm {preview.action === 'start' ? 'mission' : 'claim'}</button></div></div> : null}
    {busy ? <p role="status">Preparing or submitting your mission transaction…</p> : null}
    {error ? <p className="error-text" role="alert">{redactRpcDetails(error)}</p> : null}
    {result ? <p role="status">{result.confirmed ? 'Mission transaction confirmed.' : result.error}</p> : null}
    {result?.signature || status?.signature ? <a href={`https://explorer.solana.com/tx/${result?.signature ?? status?.signature}`} target="_blank" rel="noopener noreferrer">View transaction <ExternalLink size={13} /></a> : null}
    <footer><small>Native missions support a single unstaked Fox, without squad boosts. Staked Foxes, boosted squads and special rewards can be managed on Famous Foxes.</small><a href="https://famousfoxes.com/missions" target="_blank" rel="noopener noreferrer">Open Famous Foxes <ExternalLink size={14} /></a></footer>
  </section>;
}
