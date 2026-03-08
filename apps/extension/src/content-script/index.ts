const INJECTED_SCRIPT_ID = 'grape-wallet-inpage';
const FROM_INPAGE = 'grape:inpage';
const FROM_CONTENT = 'grape:content';

function injectInpageScript() {
  if (document.getElementById(INJECTED_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement('script');
  script.id = INJECTED_SCRIPT_ID;
  script.src = chrome.runtime.getURL('assets/inpage.js');
  script.type = 'module';
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

function getFaviconUrl(): string | undefined {
  const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"]');
  if (!icon?.href) {
    return undefined;
  }
  return icon.href;
}

injectInpageScript();

const port = chrome.runtime.connect({ name: 'grape-provider' });

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== FROM_INPAGE) {
    return;
  }

  port.postMessage({
    ...event.data.payload,
    origin: {
      origin: window.location.origin,
      href: window.location.href,
      title: document.title,
      faviconUrl: getFaviconUrl()
    }
  });
});

port.onMessage.addListener((message) => {
  window.postMessage(
    {
      source: FROM_CONTENT,
      payload: message
    },
    '*'
  );
});

