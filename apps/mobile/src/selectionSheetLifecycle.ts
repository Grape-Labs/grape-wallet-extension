/** A never-presented modal must not receive dismiss(): it can poison its portal state. */
export function createSelectionSheetLifecycle(present: () => void, dismiss: () => void) {
  let phase: 'closed' | 'opening' | 'open' | 'closing' = 'closed';
  let desiredOpen = false;
  return {
    setVisible(visible: boolean) {
      desiredOpen = visible;
      if (visible && phase === 'closed') { phase = 'opening'; present(); }
      else if (!visible && phase === 'open') { phase = 'closing'; dismiss(); }
    },
    didChange(index: number) {
      if (index < 0 || phase === 'closed' || phase === 'closing') return;
      phase = 'open';
      if (!desiredOpen) { phase = 'closing'; dismiss(); }
    },
    didDismiss() {
      const reopen = phase === 'closing' && desiredOpen;
      phase = 'closed';
      if (reopen) { phase = 'opening'; present(); return false; }
      desiredOpen = false;
      return true;
    }
  };
}
