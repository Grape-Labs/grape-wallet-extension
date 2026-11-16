import { useEffect, useRef, type ReactNode } from 'react';
import { Fingerprint, Globe2, HelpCircle, Landmark, Layers3, Palette, Settings, ShieldCheck, Unplug } from 'lucide-react';
import './settings-layout.css';
export type SettingsCategory = 'wallet' | 'appearance' | 'addons' | 'connections' | 'wallet-security' | 'reputation' | 'verification' | 'governance' | 'help';
export const SETTINGS_CATEGORIES: { id: SettingsCategory; label: string; group: string; description: string; icon: typeof Settings }[] = [
  { id: 'wallet', label: 'General', group: 'Wallet', description: 'Networks, endpoints, and balance visibility', icon: Settings },
  { id: 'appearance', label: 'Appearance', group: 'Wallet', description: 'Make Grape feel like yours', icon: Palette },
  { id: 'addons', label: 'Add-ons', group: 'Wallet', description: 'Optional tools for your wallet', icon: Layers3 },
  { id: 'connections', label: 'Connections', group: 'Wallet', description: 'Trusted apps and transaction approvals', icon: Unplug },
  { id: 'wallet-security', label: 'Security', group: 'Wallet', description: 'Unlock methods and wallet protection', icon: ShieldCheck },
  { id: 'reputation', label: 'Reputation', group: 'Community', description: 'Track points across your communities', icon: Globe2 },
  { id: 'verification', label: 'Verification', group: 'Community', description: 'Manage your linked verification spaces', icon: Fingerprint },
  { id: 'governance', label: 'Governance', group: 'Community', description: 'Choose the DAOs you follow', icon: Landmark },
  { id: 'help', label: 'Help & FAQ', group: 'Support', description: 'Answers and support for your wallet', icon: HelpCircle },
];
export function SettingsNavigation({ active, onSelect, version }: { active: SettingsCategory; onSelect: (category: SettingsCategory) => void; version: string }) {
  const selected = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const reveal = () => selected.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const query = window.matchMedia('(min-width: 1280px)');
    reveal(); query.addEventListener('change', reveal);
    return () => query.removeEventListener('change', reveal);
  }, [active]);
  return <aside className="settings-navigation"><nav aria-label="Settings categories">
    {['Wallet', 'Community', 'Support'].map(group => <div className="settings-nav-group" key={group}><span className="settings-nav-group-label">{group}</span>{SETTINGS_CATEGORIES.filter(item => item.group === group).map(item => <button key={item.id} ref={item.id === active ? selected : undefined} type="button" className={`settings-nav-item${item.id === active ? ' active' : ''}`} aria-current={item.id === active ? 'page' : undefined} onClick={() => onSelect(item.id)}><item.icon size={18} aria-hidden="true" /><span>{item.label}</span></button>)}</div>)}
  </nav><div className="settings-nav-footer"><span>Grape Wallet</span><span className="mono">v{version}</span></div></aside>;
}
export function SettingsPanel({ title, description, children, className = '' }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return <section className={`settings-panel ${className}`.trim()}><header className="settings-panel-heading"><h3>{title}</h3>{description ? <p className="muted">{description}</p> : null}</header><div className="stack settings-panel-controls">{children}</div></section>;
}
