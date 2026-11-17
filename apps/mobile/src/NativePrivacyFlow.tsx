import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { MobileThemePalette } from './theme';

/** A responsive illustration. The pulse never represents transaction progress. */
export function NativePrivacyFlow({ palette: p, action, reduceMotion }: { palette: MobileThemePalette; action: 'register' | 'deposit' | 'withdraw' | 'transfer'; reduceMotion: boolean }) {
  const pulse = useRef(new Animated.Value(.35)).current;
  useEffect(() => {
    pulse.setValue(.35);
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: .35, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
    ]));
    loop.start(); return () => loop.stop();
  }, [pulse, reduceMotion]);
  const setup = action === 'register';
  const source = action === 'deposit' ? 'Public balance' : 'Your private balance';
  const target = action === 'transfer' ? 'Recipient’s private balance' : action === 'withdraw' ? 'Public balance' : 'Private balance';
  const title = setup ? 'Private balance setup' : action === 'deposit' ? 'Deposit preview' : action === 'withdraw' ? 'Withdrawal preview' : 'Private send preview';
  const node = (isPrivate: boolean) => <View style={[styles.node, { borderColor: p.panelBorder, backgroundColor: p.panel }]}><Feather name="credit-card" size={21} color={p.muted} />{isPrivate ? <View style={[styles.badge, { backgroundColor: p.panel, borderColor: p.panelBorder }]}><Feather name="lock" size={9} color={p.grape} /></View> : null}</View>;
  return <View accessible accessibilityLabel={`${title}. ${setup ? 'Register an encrypted balance without moving funds.' : `${source} to ${target}.`} Illustration, not transaction progress.`} style={[styles.card, { borderColor: p.panelBorder, backgroundColor: p.softPanel }]}>
    <Text style={[styles.title, { color: p.muted }]}>{title}</Text>
    <View style={styles.route}>
      {!setup ? <>{node(action !== 'deposit')}<View style={[styles.connection, { backgroundColor: p.panelBorder }]} /></> : null}
      <View style={[styles.lock, { backgroundColor: p.panel, borderColor: p.grape }]}><Animated.View style={[styles.halo, { borderColor: p.grape, opacity: pulse }]} /><Feather name="lock" size={27} color={p.grape} /></View>
      {!setup ? <><View style={[styles.connection, { backgroundColor: p.panelBorder }]} />{node(action !== 'withdraw')}</> : null}
    </View>
    {!setup ? <View style={styles.labels}><Text style={[styles.label, { color: p.muted }]}>{source}</Text><Feather name="arrow-right" size={14} color={p.grape} /><Text style={[styles.label, styles.target, { color: p.muted }]}>{target}</Text></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  card: { minWidth: 0, width: '100%', borderWidth: 1, borderRadius: 16, padding: 16 },
  title: { textAlign: 'center', fontSize: 12 },
  route: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', width: '100%', maxWidth: 360, gap: 10, marginVertical: 22, minHeight: 64 },
  node: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badge: { position: 'absolute', right: -3, bottom: -3, width: 17, height: 17, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  connection: { height: 1, flex: 1, minWidth: 8 },
  lock: { width: 60, height: 60, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  halo: { position: 'absolute', top: -7, left: -7, right: -7, bottom: -7, borderWidth: 1, borderRadius: 24 },
  labels: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', width: '100%', maxWidth: 360, gap: 8 },
  label: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 17 }, target: { textAlign: 'right' }
});
