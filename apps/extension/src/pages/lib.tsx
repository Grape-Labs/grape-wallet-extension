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

export function mountPage(element: React.ReactNode) {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root element was not found.');
  }

  document.body.dataset.surface = resolveSurface();
  void loadPersistedTheme().then((theme) => {
    applyDocumentTheme(theme);
  });
  createRoot(container).render(element);
}
