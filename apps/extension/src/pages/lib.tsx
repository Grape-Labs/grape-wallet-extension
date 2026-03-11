import '../shared/page-polyfills';
import { createRoot } from 'react-dom/client';

import '../shared/style.css';
import { applyDocumentTheme, loadPersistedTheme } from '../shared/theme';

function resolveSurface() {
  const page = document.body.dataset.page;
  if (page === 'sidepanel') {
    return 'panel';
  }

  if (page === 'wallet') {
    return 'page';
  }

  if (page !== 'popup') {
    return 'page';
  }

  try {
    const views = chrome.extension.getViews({ type: 'popup' });
    return views.includes(window) ? 'popup' : 'page';
  } catch {
    return 'page';
  }
}

let surfacePort: chrome.runtime.Port | null = null;
let surfaceId: string | null = null;

export function mountPage(element: React.ReactNode) {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root element was not found.');
  }

  document.body.dataset.surface = resolveSurface();
  surfaceId ??= crypto.randomUUID();
  document.body.dataset.surfaceId = surfaceId;
  const page = document.body.dataset.page;
  if ((page === 'popup' || page === 'wallet' || page === 'sidepanel') && !surfacePort) {
    try {
      surfacePort = chrome.runtime.connect({ name: 'grape-surface' });
      surfacePort.postMessage({
        type: 'register-surface',
        surfaceId,
        page,
        visible: !document.hidden
      });
      const reportVisibility = () => {
        surfacePort?.postMessage({
          type: 'surface-visibility',
          surfaceId,
          visible: !document.hidden
        });
      };
      document.addEventListener('visibilitychange', reportVisibility);
      window.addEventListener('focus', reportVisibility);
      window.addEventListener('pageshow', reportVisibility);
      window.addEventListener('beforeunload', () => {
        document.removeEventListener('visibilitychange', reportVisibility);
        window.removeEventListener('focus', reportVisibility);
        window.removeEventListener('pageshow', reportVisibility);
        surfacePort?.disconnect();
        surfacePort = null;
      }, { once: true });
    } catch {
      surfacePort = null;
    }
  }
  void loadPersistedTheme().then((theme) => {
    applyDocumentTheme(theme);
  });
  createRoot(container).render(element);
}
