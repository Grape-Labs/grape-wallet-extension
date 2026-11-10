import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const particles = [
  { x: -76, y: -48, color: '#b078ff' }, { x: 5, y: -78, color: '#44e5ce' },
  { x: 78, y: -28, color: '#c99aff' }, { x: 66, y: 60, color: '#8c5dff' },
  { x: -14, y: 82, color: '#69f4dc' }, { x: -82, y: 40, color: '#ac70ff' }
];
/** A one-shot brand reveal. No timers or completion gate delay wallet startup. */
export function GrapeStartupMark({ children, reduceMotion, size = 128 }: { children: ReactNode; reduceMotion: boolean; size?: number }) {
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, duration: 1050, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion]);
  const turn = progress.interpolate({ inputRange: [0, 0.65, 0.85, 1], outputRange: ['-18deg', '5deg', '-2deg', '0deg'] });
  return <View style={{ width: size + 38, height: size + 38, alignItems: 'center', justifyContent: 'center' }} accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
    <Animated.View style={[styles.ring, { width: size + 30, height: size + 30, opacity: progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.7, 0] }), transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.45] }) }] }]} />
    {particles.map((particle, index) => <Animated.View key={index} style={[styles.particle, { backgroundColor: particle.color,
      opacity: progress.interpolate({ inputRange: [0, 0.15, 0.65, 1], outputRange: [0, 1, 0, 0] }),
      transform: [
        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [particle.x * size / 128, 0] }) },
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [particle.y * size / 128, 0] }) },
        { scale: progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1, 0.2] }) }
      ] }]} />)}
    <Animated.View style={[styles.orb, { width: size, height: size, borderRadius: size / 2,
      opacity: progress.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 1] }),
      transform: [{ scale: progress.interpolate({ inputRange: [0, 0.65, 0.85, 1], outputRange: [0.55, 1.06, 0.98, 1] }) }, { rotate: turn }]
    }]}>{children}</Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1.5, borderColor: '#b68bff' },
  orb: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#211032', borderWidth: 1.5, borderColor: '#a877ef', shadowColor: '#a560ff', shadowOpacity: 0.32, shadowRadius: 26, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  particle: { position: 'absolute', width: 12, height: 12, borderRadius: 6 }
});
