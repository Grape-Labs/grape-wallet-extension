import { describe, expect, it, vi } from 'vitest';
import { createSelectionSheetLifecycle } from './selectionSheetLifecycle';
describe('selection sheet presentation lifecycle', () => {
  it('does not dismiss on initial hidden mount, then presents on the first dropdown tap', () => {
    const present = vi.fn(); const dismiss = vi.fn();
    const sheet = createSelectionSheetLifecycle(present, dismiss);
    sheet.setVisible(false); sheet.setVisible(false);
    expect(dismiss).not.toHaveBeenCalled();
    sheet.setVisible(true);
    expect(present).toHaveBeenCalledOnce();
  });
  it('dismisses only after presentation, including a close requested while opening', () => {
    const present = vi.fn(); const dismiss = vi.fn();
    const sheet = createSelectionSheetLifecycle(present, dismiss);
    sheet.setVisible(true); sheet.setVisible(false);
    expect(dismiss).not.toHaveBeenCalled();
    sheet.didChange(0);
    expect(dismiss).toHaveBeenCalledOnce();
    expect(sheet.didDismiss()).toBe(true);
    sheet.setVisible(true);
    expect(present).toHaveBeenCalledTimes(2);
  });
  it('handles drag/backdrop dismissal and subsequent reopening', () => {
    const present = vi.fn(); const dismiss = vi.fn();
    const sheet = createSelectionSheetLifecycle(present, dismiss);
    sheet.setVisible(true); sheet.didChange(0);
    expect(sheet.didDismiss()).toBe(true);
    sheet.setVisible(false); sheet.setVisible(true);
    expect(present).toHaveBeenCalledTimes(2);
    expect(dismiss).not.toHaveBeenCalled();
  });
  it('retains a newer open request while an older close animation completes', () => {
    const present = vi.fn(); const dismiss = vi.fn();
    const sheet = createSelectionSheetLifecycle(present, dismiss);
    sheet.setVisible(true); sheet.didChange(0); sheet.setVisible(false); sheet.setVisible(true);
    expect(sheet.didDismiss()).toBe(false);
    expect(present).toHaveBeenCalledTimes(2);
    sheet.didChange(0);
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
