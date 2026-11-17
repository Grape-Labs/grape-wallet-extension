// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GrapePrivacyFlow } from './GrapePrivacyFlow';
describe('private balance route illustration', () => {
  let root: Root, container: HTMLDivElement;
  beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); root = createRoot(container); });
  afterEach(() => act(() => root.unmount()));
  it.each([
    ['deposit', 'Public balance', 'Private balance'],
    ['withdraw', 'Your private balance', 'Public balance'],
    ['transfer', 'Your private balance', 'Recipient’s private balance']
  ] as const)('describes the %s route in source-to-destination order', (action, source, target) => {
    act(() => root.render(createElement(GrapePrivacyFlow, { action })));
    const labels = container.querySelectorAll('figcaption > span');
    expect(labels[0].textContent).toBe(source); expect(labels[1].textContent).toBe(target);
    expect(container.querySelector('figure')?.getAttribute('aria-label')).toContain('Illustration, not transaction progress.');
  });
});
