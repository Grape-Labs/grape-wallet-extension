import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const callbacks = vi.hoisted(() => ({ tabBar: null as null | (() => unknown) }));
vi.mock('@react-navigation/native', () => ({
  DarkTheme: { colors: {} },
  NavigationContainer: ({ children }: { children: unknown }) => children,
  usePreventRemove: () => {}
}));
vi.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: Array<{ props: { component: unknown } }> }) =>
      createElement(children[0].props.component as never, { route: { name: 'tabs' } } as never),
    Screen: () => null
  })
}));
vi.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ tabBar }: { tabBar: () => unknown }) => { callbacks.tabBar = tabBar; return null; },
    Screen: () => null
  })
}));
import { NativeWalletNavigation } from './NativeWalletNavigation';

describe('wallet unlock navigation mounting', () => {
  it('returns a tab-bar element without invoking a context hook in the navigator callback', () => {
    renderToStaticMarkup(createElement(NativeWalletNavigation, {
      navigationRef: {} as never, onRouteChange: () => {}, onSceneClosed: () => {},
      background: '#000', reduceMotion: true, blocked: false,
      render: () => null, footer: () => null
    }));
    expect(callbacks.tabBar).toBeTypeOf('function');
    // React Navigation may invoke this callback outside a component hook dispatcher.
    // The callback must return <TabBar />, rather than call TabBar's useContext itself.
    expect(() => callbacks.tabBar!()).not.toThrow();
    expect(isValidElement(callbacks.tabBar!())).toBe(true);
  });
});
