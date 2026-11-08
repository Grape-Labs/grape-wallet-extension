// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityWorkspace } from './CommunityWorkspace';
import type { GovernanceDaoSummary } from '../../shared/models';

const dao: GovernanceDaoSummary = {
  daoId: 'GrapeDao', realmName: 'Grape', communityMint: 'mint', councilMint: null,
  communityTokenDecimals: 6, role: 'member', communityVotingPower: '100', councilVotingPower: '0',
  delegateCommunityVotingPower: '0', delegateCouncilVotingPower: '0', delegateCount: 0
};

describe('embedded DAO workspace', () => {
  let root: Root;
  let container: HTMLDivElement;
  const onGovernanceView = vi.fn();
  const render = (view: 'overview' | 'full', currentDao: GovernanceDaoSummary | undefined = dao) => act(() => {
    root.render(createElement(CommunityWorkspace, {
      id: currentDao?.daoId ?? 'rep-space', dao: currentDao, governanceView: view, onGovernanceView,
      identities: [], tokens: [], privacy: false, loading: false, incomplete: false,
      onBack: vi.fn(), onManage: vi.fn(), onToken: vi.fn(), formatPower: () => '100'
    }));
  });
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(() => act(() => root.unmount()));

  it('keeps the overview local until full governance is selected', () => {
    render('overview');
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('Voting power');
    act(() => (Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Full governance')!).click());
    expect(onGovernanceView).toHaveBeenCalledWith('full');
    render('full');
    expect(container.textContent).not.toContain('Voting power');
    expect(container.querySelector('iframe')?.src).toBe('https://www.governance.so/dao/GrapeDao');
  });

  it('follows the selected DAO, keeps its origin fixed and offers an external fallback', () => {
    render('full', { ...dao, daoId: 'other/dao?x=1', realmName: 'Other DAO' });
    const frame = container.querySelector('iframe')!;
    expect(frame.title).toBe('Other DAO on governance.so');
    expect(frame.src).toBe('https://www.governance.so/dao/other%2Fdao%3Fx%3D1');
    expect(container.querySelector<HTMLAnchorElement>('.governance-embed-actions a')?.href).toBe(frame.src);
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
  });

  it('reloads the embedded page and returns to overview without leaving a remote frame', () => {
    render('full');
    const frame = container.querySelector('iframe')!;
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Reload governance"]')!.click());
    expect(container.querySelector('iframe')).not.toBe(frame);
    render('overview');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('does not embed reputation-only communities', () => {
    act(() => root.render(createElement(CommunityWorkspace, {
      id: 'rep-only', governanceView: 'full', onGovernanceView, identities: [], tokens: [],
      privacy: false, loading: false, incomplete: false, onBack: vi.fn(), onManage: vi.fn(),
      onToken: vi.fn(), formatPower: () => '0'
    })));
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('[aria-label="Governance view"]')).toBeNull();
  });
});
