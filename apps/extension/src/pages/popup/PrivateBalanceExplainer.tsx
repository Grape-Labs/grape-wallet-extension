import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, BookOpen, ExternalLink, KeyRound, LockKeyhole, Send, X } from 'lucide-react';
import { PRIVACY_GUIDE } from '@grape/core';
import './private-balance-explainer.css';
const stepIcons = { setup: KeyRound, deposit: ArrowDownToLine, send: Send, withdraw: ArrowUpRight };
export function PrivateBalanceExplainer() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    node.showModal();
    return () => { if (node.open) node.close(); };
  }, [open]);
  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus(); }
  return <>
    <button ref={trigger} type="button" className="privacy-guide-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}><BookOpen size={17} aria-hidden="true" /><span>{PRIVACY_GUIDE.title}</span><ArrowUpRight size={15} aria-hidden="true" /></button>
    {open ? <dialog ref={dialog} className="privacy-guide-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="privacy-guide-shell">
        <header className="privacy-guide-header"><span className="privacy-guide-icon"><LockKeyhole size={22} aria-hidden="true" /></span><div><span className="privacy-guide-eyebrow">Grape · Private balances</span><h2 id={titleId}>{PRIVACY_GUIDE.title}</h2></div><button type="button" className="privacy-guide-close" aria-label="Close private balance guide" onClick={close} autoFocus><X size={21} /></button></header>
        <div className="privacy-guide-content">
          <p className="privacy-guide-intro">{PRIVACY_GUIDE.intro}</p>
          <ol className="privacy-guide-steps">{PRIVACY_GUIDE.steps.map((step, index) => { const Icon = stepIcons[step.id]; return <li key={step.id}><div className="privacy-guide-step-top"><span className="privacy-guide-step-number">{index + 1}</span><span>{step.label}</span><Icon size={18} aria-hidden="true" /></div><h3>{step.title}</h3><p>{step.body}</p></li>; })}</ol>
          <section className="privacy-guide-visibility" aria-label="On-chain visibility"><h3>What can other people see?</h3><div className="privacy-guide-table-wrap"><table><thead><tr><th scope="col">Activity</th><th scope="col">Public on-chain</th><th scope="col">Hidden from the public</th></tr></thead><tbody>{PRIVACY_GUIDE.visibility.map(row => <tr key={row.action}><th scope="row">{row.action}</th><td>{row.public}</td><td>{row.hidden}</td></tr>)}</tbody></table></div><p className="privacy-guide-limit">{PRIVACY_GUIDE.limit}</p></section>
          <section className="privacy-guide-faq" aria-label="Private balance questions">{PRIVACY_GUIDE.questions.map(question => <details key={question.id}><summary>{question.title}</summary><p>{question.body}</p></details>)}</section>
          <footer className="privacy-guide-sources"><span>Learn more from Helius</span>{PRIVACY_GUIDE.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ExternalLink size={13} aria-hidden="true" /></a>)}</footer>
        </div>
      </div>
    </dialog> : null}
  </>;
}
