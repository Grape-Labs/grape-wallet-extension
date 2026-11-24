import { useEffect, useRef, useState } from 'react';
import { Rocket, Bell } from 'lucide-react';
import { sendRuntimeMessage } from '../../shared/chrome';
import type { FoxMissionStatus } from '../../shared/fox-missions';
// Limit background scans when a wallet has a large Fox collection.
let reading = 0;
const waiting: (() => void)[] = [];
async function read(owner: string, mint: string, cancelled: () => boolean) {
  if (reading >= 3) await new Promise<void>(resolve => waiting.push(resolve));
  else reading++;
  try { if (cancelled()) return null; return await sendRuntimeMessage<FoxMissionStatus>({ type: 'wallet_fox_status', owner, mint, cached: true }); }
  finally { const next = waiting.shift(); if (next) next(); else reading--; }
}
export function FoxMissionBadge({ owner, mint, revision }: { owner: string; mint: string; revision?: unknown }) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: '100px' });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  const [status, setStatus] = useState<FoxMissionStatus | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => { let cancelled = false; if (!visible) return; setStatus(null); setFailed(false);
    void read(owner, mint, () => cancelled).then(result => { if (!cancelled) setStatus(result); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [owner, mint, revision, visible]);
  const active = status?.state === 'locked' || status?.state === 'claimable';
  const label = failed ? 'Check mission status' : !status ? 'Checking mission…' : status.pending ? 'Mission confirming' : status.state === 'locked' ? 'On mission' : status.state === 'claimable' ? 'Mission ended · claim' : status.state === 'ready' ? 'In wallet' : 'Mission status unavailable';
  const end = active && status?.mission ? `Ends ${new Date(status.mission.endsAt * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : undefined;
  return <span ref={element} className={`fox-gallery-status ${active ? 'fox-gallery-active' : ''}`} title={status?.reason ?? end} role="status"><span><Rocket size={13} />{label}{status?.reminderEnabled ? <Bell size={12} aria-label="Reminder enabled" /> : null}</span>{end ? <small>{end}</small> : null}</span>;
}
