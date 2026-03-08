import { createRoot } from 'react-dom/client';

import '../shared/style.css';

export function mountPage(element: React.ReactNode) {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root element was not found.');
  }
  createRoot(container).render(element);
}

