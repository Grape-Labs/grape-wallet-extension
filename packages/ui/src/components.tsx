import type { PropsWithChildren, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';

import React from 'react';

export function PageShell(props: PropsWithChildren<{ title: string; subtitle?: string; actions?: React.ReactNode }>) {
  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Grape Wallet</p>
          <h1>{props.title}</h1>
          {props.subtitle ? <p className="muted">{props.subtitle}</p> : null}
        </div>
        {props.actions ? <div className="page-actions">{props.actions}</div> : null}
      </header>
      <main className="page-content">{props.children}</main>
    </div>
  );
}

export function Card(props: PropsWithChildren<{ title?: string; footer?: React.ReactNode; className?: string }>) {
  return (
    <section className={`card ${props.className ?? ''}`.trim()}>
      {props.title ? <h2>{props.title}</h2> : null}
      <div className="card-body">{props.children}</div>
      {props.footer ? <div className="card-footer">{props.footer}</div> : null}
    </section>
  );
}

export function Button(props: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'secondary' | 'danger' }>) {
  const tone = props.tone ?? 'primary';
  return (
    <button {...props} className={`button ${tone} ${props.className ?? ''}`.trim()}>
      {props.children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ''}`.trim()} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input textarea ${props.className ?? ''}`.trim()} />;
}

export function StatusPill(props: { tone?: 'neutral' | 'success' | 'warning' | 'danger'; children: React.ReactNode }) {
  return <span className={`status-pill ${props.tone ?? 'neutral'}`}>{props.children}</span>;
}

export function KeyValueRow(props: { label: string; value: React.ReactNode }) {
  return (
    <div className="key-value-row">
      <span className="muted">{props.label}</span>
      <span>{props.value}</span>
    </div>
  );
}

export function MnemonicGrid(props: { words: string[] }) {
  return (
    <ol className="mnemonic-grid">
      {props.words.map((word, index) => (
        <li key={`${word}-${index}`}>
          <span className="muted">{index + 1}</span>
          <strong>{word}</strong>
        </li>
      ))}
    </ol>
  );
}

