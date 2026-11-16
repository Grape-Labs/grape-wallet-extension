import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ExternalLink, RotateCw } from 'lucide-react';
import { getEmbeddedDappUrl } from '../../shared/dapp-launch';
import { applyDocumentTheme, loadPersistedThemeSettings } from '../../shared/theme';
import '../../shared/style.css';
import './style.css';

function DappPage() {
  const url = getEmbeddedDappUrl(new URLSearchParams(location.search).get('url') ?? '');
  const [reload, setReload] = useState(0);
  if (!url) return <main className="dapp-invalid"><h1>App unavailable</h1><p>This address is not supported in Grape’s app viewer.</p><a href="wallet.html">Return to wallet</a></main>;
  return <main className="dapp-viewer">
    <header className="dapp-toolbar"><a className="dapp-wallet-link" href="wallet.html"><ArrowLeft size={18} />Wallet</a><div className="dapp-location"><strong>{url.hostname}</strong><small>Grape app viewer · Wallet approvals still required</small></div><button type="button" onClick={() => setReload(value => value + 1)} aria-label="Reload app"><RotateCw size={18} /></button><a href={url.href} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} /><span>Open in browser</span></a></header>
    <p className="dapp-help">If the app stays blank or a sign-in needs a browser tab, choose Open in browser.</p>
    <iframe key={reload} src={url.href} title={`${url.hostname} app`} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads" referrerPolicy="no-referrer" />
  </main>;
}
void loadPersistedThemeSettings().then(settings => { applyDocumentTheme(settings.theme, settings.customTheme, settings.backgroundStyle, settings.motionIntensity); }).finally(() => createRoot(document.getElementById('root')!).render(<DappPage />));
