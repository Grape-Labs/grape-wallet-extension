import { describe, expect, it, vi } from 'vitest';
import { CommonActions, StackActions, StackRouter, TabRouter } from '@react-navigation/routers';
import { createDeferredWalletNavigation, WALLET_STACK_ROUTES, WALLET_TAB_ROUTES } from './walletNavigationPolicy';

describe('wallet native navigation routes', () => {
  it('returns from Send to its originating asset and then to the existing tab root', () => {
    const router = StackRouter({ initialRouteName: 'tabs' });
    const options = { routeNames: [...WALLET_STACK_ROUTES], routeParamList: {}, routeGetIdList: {} };
    const root = router.getInitialState(options);
    const asset = router.getRehydratedState(router.getStateForAction(root, StackActions.push('asset', { selectionId: 1 }), options)!, options);
    const send = router.getRehydratedState(router.getStateForAction(asset, StackActions.push('send'), options)!, options);
    const back = router.getRehydratedState(router.getStateForAction(send, CommonActions.goBack(), options)!, options);
    expect(back.routes.map((route) => route.name)).toEqual(['tabs', 'asset']);
    const finished = router.getRehydratedState(router.getStateForAction(back, StackActions.popToTop(), options)!, options);
    expect(finished.routes).toEqual(root.routes);
  });
  it('preserves tab route identities when switching to Discover and back', () => {
    const router = TabRouter({ initialRouteName: 'home', backBehavior: 'initialRoute' });
    const options = { routeNames: [...WALLET_TAB_ROUTES], routeParamList: {}, routeGetIdList: {} };
    const root = router.getInitialState(options);
    const discover = router.getRehydratedState(router.getStateForAction(root, CommonActions.navigate('discover'), options)!, options);
    expect(discover.routes[discover.index].name).toBe('discover');
    const back = router.getRehydratedState(router.getStateForAction(discover, CommonActions.goBack(), options)!, options);
    expect(back.routes[back.index].name).toBe('home');
    expect(back.routes.map((route) => route.key)).toEqual(root.routes.map((route) => route.key));
  });
});

describe('signing navigation boundary', () => {
  it('waits for signing to finish and navigates only to the final destination', () => {
    const queue = createDeferredWalletNavigation();
    const close = vi.fn(); const activity = vi.fn();
    queue.request(close, true); queue.request(activity, true);
    queue.flush(true);
    expect(close).not.toHaveBeenCalled(); expect(activity).not.toHaveBeenCalled();
    queue.flush(false); queue.flush(false);
    expect(close).not.toHaveBeenCalled(); expect(activity).toHaveBeenCalledOnce();
  });
  it('clears pending navigation when the account/session resets', () => {
    const queue = createDeferredWalletNavigation(); const action = vi.fn();
    queue.request(action, true); queue.clear(); queue.flush(false);
    expect(action).not.toHaveBeenCalled();
  });
});

it('does not replay an older deferred route after a newer navigation action', () => {
  const queue = createDeferredWalletNavigation(); const old = vi.fn(); const next = vi.fn();
  queue.request(old, true); queue.request(next, false); queue.flush(false);
  expect(old).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledOnce();
});
