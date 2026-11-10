// @vitest-environment jsdom
import { act, createElement, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
const modal = vi.hoisted(() => ({ present: vi.fn(), dismiss: vi.fn(), onChange: null as null | ((index: number) => void), onDismiss: null as null | (() => void) }));
vi.mock('react-native', () => ({
  Keyboard: { dismiss: vi.fn() }, StyleSheet: { create: (styles: unknown) => styles },
  Pressable: ({ children }: { children: ReactNode }) => children,
  Text: ({ children }: { children: ReactNode }) => children,
  View: ({ children }: { children: ReactNode }) => children
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock('react-native-reanimated', () => ({ ReduceMotion: { Always: 'always', System: 'system' } }));
vi.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetModal: forwardRef((props: { children: ReactNode; onChange: (index: number) => void; onDismiss: () => void }, ref) => {
    useImperativeHandle(ref, () => ({ present: modal.present, dismiss: modal.dismiss }));
    modal.onChange = props.onChange; modal.onDismiss = props.onDismiss;
    return props.children;
  }),
  BottomSheetView: ({ children }: { children: ReactNode }) => children,
  BottomSheetBackdrop: () => null, BottomSheetTextInput: () => null
}));
import { SelectionSheet } from './SelectionSheet';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.clearAllMocks());
describe('controlled selection sheet', () => {
  it('opens on the first picker tap without poisoning the initially hidden native modal', async () => {
    const element = document.createElement('div'); const root = createRoot(element);
    const onDismiss = vi.fn(); const onClosed = vi.fn();
    const render = (visible: boolean) => createElement(SelectionSheet, { visible, onDismiss, onClosed, background: '#000', color: '#fff', muted: '#888', reduceMotion: true, children: 'Options' });
    try {
      await act(() => root.render(render(false)));
      expect(modal.dismiss).not.toHaveBeenCalled();
      await act(() => root.render(render(true)));
      expect(modal.present).toHaveBeenCalledOnce();
      await act(() => modal.onChange!(0));
      await act(() => root.render(render(false)));
      expect(modal.dismiss).toHaveBeenCalledOnce();
      await act(() => modal.onDismiss!());
      expect(onDismiss).toHaveBeenCalledOnce(); expect(onClosed).toHaveBeenCalledOnce();
      await act(() => root.render(render(true)));
      expect(modal.present).toHaveBeenCalledTimes(2);
    } finally { await act(() => root.unmount()); }
  });
});
