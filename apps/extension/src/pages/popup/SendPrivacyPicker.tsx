import { useId, useRef, useState } from 'react';
import { ChevronDown, LockKeyhole, Shield, X } from 'lucide-react';

export function SendPrivacyPicker({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [draft, setDraft] = useState(value);
  return <div className="send-field-group">
    <span className="send-field-label">Send privacy</span>
    <button type="button" className="send-privacy-trigger" aria-haspopup="dialog" onClick={() => { setDraft(value); dialog.current?.showModal(); }}>
      {value ? <LockKeyhole size={20} /> : <Shield size={20} />}<strong>{value ? 'Private · Houdini' : 'Public'}</strong><ChevronDown size={18} />
    </button>
    <dialog ref={dialog} className="send-privacy-sheet" aria-labelledby={titleId} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="send-privacy-sheet-content">
        <div className="send-privacy-sheet-heading"><h2 id={titleId}>Send privacy</h2><button type="button" className="send-back-button" aria-label="Close privacy options" onClick={() => dialog.current?.close()}><X size={20} /></button></div>
        <p className="muted">Choose how to send your tokens.</p>
        <div className="send-privacy-options" role="group" aria-label="Send privacy options">
          {[{ value: false, title: 'Public send', detail: 'Fast, low-cost transfer. The recipient can see your wallet address.' }, { value: true, title: 'Private send', detail: 'Routes through Houdini exchange partners. Higher fees and longer delivery. Review a quote before sending.' }].map(option =>
            <button key={option.title} type="button" className={`send-privacy-option ${draft === option.value ? 'selected' : ''}`} aria-pressed={draft === option.value} onClick={() => setDraft(option.value)}><span className="send-privacy-indicator" aria-hidden="true" /><span><strong>{option.title}</strong><small>{option.detail}</small></span></button>
          )}
        </div>
        <button type="button" className="button primary button-block" onClick={() => { onChange(draft); dialog.current?.close(); }}>Save</button>
      </div>
    </dialog>
  </div>;
}
