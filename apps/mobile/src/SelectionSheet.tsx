import { createSelectionSheetLifecycle } from './selectionSheetLifecycle';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View, type TextInputProps } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetTextInput, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function SelectionSheet(props: {
  visible: boolean; onDismiss: () => void; onClosed: () => void;
  background: string; color: string; muted: string; reduceMotion: boolean; children: ReactNode;
}) {
  const modal = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const lifecycle = useRef(createSelectionSheetLifecycle(
    () => modal.current?.present(), () => modal.current?.dismiss()
  )).current;
  useEffect(() => { lifecycle.setVisible(props.visible); }, [lifecycle, props.visible]);
  const backdrop = useCallback((backdropProps: BottomSheetBackdropProps) =>
    <BottomSheetBackdrop {...backdropProps} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" opacity={0.55} />, []);
  return <BottomSheetModal ref={modal} index={0} snapPoints={['58%', '90%']} enableDynamicSizing={false}
    enablePanDownToClose enableBlurKeyboardOnGesture keyboardBehavior="interactive" keyboardBlurBehavior="restore"
    android_keyboardInputMode="adjustResize" topInset={insets.top + 8}
    overrideReduceMotion={props.reduceMotion ? ReduceMotion.Always : ReduceMotion.System}
    backgroundStyle={{ backgroundColor: props.background, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
    handleIndicatorStyle={{ backgroundColor: props.muted, width: 42 }} backdropComponent={backdrop}
    onChange={(index) => lifecycle.didChange(index)}
    onDismiss={() => {
      if (!lifecycle.didDismiss()) return;
      Keyboard.dismiss(); props.onDismiss(); props.onClosed();
    }}>
    <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal onAccessibilityEscape={() => modal.current?.dismiss()}>
      <View style={styles.controls}>
        <Text style={[styles.hint, { color: props.muted }]}>Swipe down to close</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close selection" hitSlop={8} style={styles.close} onPress={() => modal.current?.dismiss()}>
          <Text style={{ color: props.color, fontWeight: '600' }}>Close</Text>
        </Pressable>
      </View>
      {props.children}
    </BottomSheetView>
  </BottomSheetModal>;
}
export function SheetSearchInput({ color, borderColor, ...props }: TextInputProps & { color: string; borderColor: string }) {
  return <BottomSheetTextInput {...props} accessibilityLabel={props.accessibilityLabel ?? props.placeholder} autoCapitalize="none" autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing" style={[styles.search, { color, borderColor }, props.style]} />;
}
const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 18, gap: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { fontSize: 12, flexShrink: 1 },
  close: { minHeight: 44, minWidth: 52, justifyContent: 'center', alignItems: 'center' },
  search: { minHeight: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 }
});
