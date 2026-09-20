import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MobileThemePalette } from './theme';

export function SendPrivacyPicker({ value, onChange, theme }: { value: boolean; onChange: (value: boolean) => void; theme: MobileThemePalette }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const insets = useSafeAreaInsets();
  return <View style={{ gap: 8 }}>
    <Text style={{ color: theme.muted, fontSize: 13 }}>Send privacy</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Send privacy: ${value ? 'Private' : 'Public'}. Change privacy`} onPress={() => { setDraft(value); setOpen(true); }} style={[styles.row, { borderColor: theme.panelBorder }]}>
      <Feather name={value ? 'lock' : 'shield'} size={20} color={theme.text} /><Text style={[styles.title, { color: theme.text, flex: 1 }]}>{value ? 'Private · Houdini' : 'Public'}</Text><Feather name="chevron-down" size={18} color={theme.muted} />
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close privacy options" onPress={() => setOpen(false)} />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.bg, paddingBottom: Math.max(insets.bottom, 20) }]}>
          <ScrollView contentContainerStyle={{ gap: 18 }}>
            <View style={styles.heading}><Text accessibilityRole="header" style={[styles.title, { color: theme.text, fontSize: 20 }]}>Send privacy</Text><Pressable accessibilityRole="button" accessibilityLabel="Close privacy options" onPress={() => setOpen(false)} style={styles.close}><Feather name="x" size={22} color={theme.muted} /></Pressable></View>
            <Text style={{ color: theme.muted }}>Choose how to send your tokens.</Text>
            {[{ value: false, title: 'Public send', detail: 'Fast, low-cost transfer. The recipient can see your wallet address.' }, { value: true, title: 'Private send', detail: 'Routes through Houdini exchange partners. Higher fees and longer delivery. Review a quote before sending.' }].map(option => <Pressable key={option.title} accessibilityRole="radio" accessibilityState={{ checked: draft === option.value }} onPress={() => setDraft(option.value)} style={[styles.option, { backgroundColor: theme.softPanel, borderColor: draft === option.value ? theme.grape : theme.panelBorder }]}>
              <View style={[styles.radio, { borderColor: draft === option.value ? theme.grape : theme.muted, borderWidth: draft === option.value ? 6 : 2 }]} /><View style={{ flex: 1, gap: 7 }}><Text style={[styles.title, { color: theme.text }]}>{option.title}</Text><Text style={{ color: theme.muted, lineHeight: 21 }}>{option.detail}</Text></View>
            </Pressable>)}
            <Pressable accessibilityRole="button" onPress={() => { onChange(draft); setOpen(false); }} style={[styles.save, { backgroundColor: theme.primaryButton }]}><Text style={[styles.title, { color: theme.primaryButtonText }]}>Save</Text></Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  row: { minHeight: 48, padding: 14, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 16, fontWeight: '600' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.65)' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { padding: 10 },
  option: { flexDirection: 'row', gap: 12, padding: 16, borderWidth: 1, borderRadius: 16 },
  radio: { width: 20, height: 20, borderRadius: 10, marginTop: 1 },
  save: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }
});
