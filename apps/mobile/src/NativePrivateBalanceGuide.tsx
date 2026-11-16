import { useState } from 'react';
import { Keyboard, Linking, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRIVACY_GUIDE } from '@grape/core';
import type { MobileThemePalette } from './theme';
export function NativePrivateBalanceGuide({ palette: p }: { palette: MobileThemePalette }) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<Set<string>>(new Set());
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dialogWidth = Math.min(820, width - insets.left - insets.right - 24);
  const twoColumns = dialogWidth / Math.max(1, fontScale) >= 650;
  const paragraph = { color: p.muted, fontSize: 13, lineHeight: 21 };
  const heading = { color: p.text, fontSize: 16, fontWeight: '700' as const };
  function close() { setOpen(false); }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={PRIVACY_GUIDE.title} onPress={() => { Keyboard.dismiss(); setOpen(true); }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 }}><Feather name="book-open" size={17} color={p.grape} /><Text style={{ color: p.grape, fontSize: 13, flexShrink: 1 }}>{PRIVACY_GUIDE.title}</Text><Feather name="arrow-up-right" size={16} color={p.grape} /></Pressable>
    <Modal visible={open} transparent animationType="none" onRequestClose={close}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, backgroundColor: '#03050bd9' }}>
        <View accessibilityViewIsModal onAccessibilityEscape={close} style={{ width: dialogWidth, height: Math.max(220, Math.min(900, height - insets.top - insets.bottom - 24)), borderRadius: 20, borderWidth: 1, borderColor: p.panelBorder, backgroundColor: p.panel, overflow: 'hidden' }}>
          <View style={{ padding: 18, borderBottomWidth: 1, borderBottomColor: p.panelBorder, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Feather name="lock" size={22} color={p.grape} /><View style={{ flex: 1, gap: 5 }}><Text style={{ color: p.muted, fontSize: 10 }}>GRAPE · PRIVATE BALANCES</Text><Text accessibilityRole="header" style={{ ...heading, fontSize: 19 }}>{PRIVACY_GUIDE.title}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close private balance guide" onPress={close} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Feather name="x" size={22} color={p.muted} /></Pressable></View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 22 }} showsVerticalScrollIndicator>
            <Text style={{ ...paragraph, color: p.text, fontSize: 14 }}>{PRIVACY_GUIDE.intro}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{PRIVACY_GUIDE.steps.map((step, index) => <View key={step.id} style={{ width: twoColumns ? (dialogWidth - 56) / 2 : '100%', minWidth: 0, gap: 10, padding: 16, borderWidth: 1, borderColor: p.panelBorder, borderRadius: 14, backgroundColor: p.frost }}><Text style={{ color: p.grape, fontSize: 12 }}>{index + 1} · {step.label}</Text><Text accessibilityRole="header" style={heading}>{step.title}</Text><Text style={paragraph}>{step.body}</Text></View>)}</View>
            <View style={{ gap: 14 }}><Text accessibilityRole="header" style={heading}>What can other people see?</Text>{PRIVACY_GUIDE.visibility.map(row => <View key={row.action} style={{ gap: 7, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: p.panelBorder }}><Text style={heading}>{row.action}</Text><Text style={paragraph}>Public on-chain: {row.public}</Text><Text style={paragraph}>Hidden from the public: {row.hidden}</Text></View>)}<Text style={paragraph}>{PRIVACY_GUIDE.limit}</Text></View>
            <View>{PRIVACY_GUIDE.questions.map(question => { const expanded = questions.has(question.id); return <View key={question.id} style={{ borderBottomWidth: 1, borderBottomColor: p.panelBorder }}><Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setQuestions(previous => { const next = new Set(previous); if (expanded) next.delete(question.id); else next.add(question.id); return next; })} style={{ minHeight: 48, paddingVertical: 15, gap: 12, flexDirection: 'row', alignItems: 'center' }}><Text style={{ ...heading, fontSize: 14, flex: 1 }}>{question.title}</Text><Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={p.muted} /></Pressable>{expanded ? <Text style={{ ...paragraph, paddingBottom: 16 }}>{question.body}</Text> : null}</View>; })}</View>
            <View style={{ gap: 4 }}><Text style={paragraph}>Learn more from Helius</Text>{PRIVACY_GUIDE.sources.map(source => <Pressable key={source.url} accessibilityRole="link" onPress={() => { void Linking.openURL(source.url).catch(() => {}); }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ color: p.grape, fontSize: 13, flexShrink: 1 }}>{source.title}</Text><Feather name="external-link" size={13} color={p.grape} /></Pressable>)}</View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
