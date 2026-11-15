import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { MobileThemePalette } from './theme';
import type { WalletTabs } from './NativeWalletNavigation';

const destinations = [
  { name: 'home', label: 'Overview', icon: 'view-dashboard-outline' },
  { name: 'nfts', label: 'NFTs', icon: 'image-multiple-outline' },
  { name: 'staking', label: 'Staking', icon: 'sprout-outline' },
  { name: 'activity', label: 'Activity', icon: 'history' },
  { name: 'discover', label: 'Discover', icon: 'compass-outline' },
  { name: 'settings', label: 'Settings', icon: 'cog-outline' }
] as const;

export function TabletWalletSidebar(props: {
  palette: MobileThemePalette; width: number; top: number; bottom: number;
  selected: keyof WalletTabs | 'nfts' | 'staking'; onSelect: (tab: keyof WalletTabs | 'nfts' | 'staking') => void; logo: ReactNode; disabled: boolean; stakingAvailable: boolean; nftsAvailable: boolean;
}) {
  const { palette } = props;
  return <View style={[styles.sidebar, { width: props.width, paddingTop: props.top + 24, paddingBottom: props.bottom + 16, backgroundColor: palette.panel, borderRightColor: palette.panelBorder }]}>
    <ScrollView contentContainerStyle={styles.sidebarContent} showsVerticalScrollIndicator={false}>
      <View style={styles.brand}>{props.logo}<Text style={[styles.brandName, { color: palette.text }]}>Grape</Text></View>
      <Text style={[styles.caption, { color: palette.muted }]}>WORKSPACE</Text>
      {destinations.filter(item => (item.name !== 'staking' || props.stakingAvailable) && (item.name !== 'nfts' || props.nftsAvailable)).map(({ name, label, icon }) => {
        const selected = props.selected === name;
        return <Pressable key={name} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected, disabled: props.disabled }} disabled={props.disabled} onPress={() => props.onSelect(name)}
          style={({ pressed }) => [styles.destination, { backgroundColor: selected || pressed ? palette.frost : 'transparent', opacity: props.disabled ? 0.5 : 1 }]}>
          <MaterialCommunityIcons name={icon} size={21} color={selected ? palette.grape : palette.muted} />
          <Text style={[styles.destinationText, { color: selected ? palette.text : palette.muted }]}>{label}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <Text style={[styles.caption, { color: palette.muted }]}>YOUR WALLET. YOUR WORLD.</Text>
  </View>;
}

/** Keeps the phone composition while giving balance and actions separate tablet columns. */
export function PortfolioHeaderLayout(props: { horizontal: boolean; balance: ReactNode; actions: ReactNode }) {
  return <View style={[styles.portfolio, props.horizontal && styles.portfolioHorizontal]}>
    <View style={[styles.balance, props.horizontal && styles.balanceFlexible]}>{props.balance}</View>
    <View style={props.horizontal ? styles.actions : undefined}>{props.actions}</View>
  </View>;
}

export const tabletLayoutStyles = StyleSheet.create({
  dashboard: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  assets: { flex: 1, minWidth: 0 },
  secondary: { width: 300, gap: 16 }
});
const styles = StyleSheet.create({
  sidebar: { borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  sidebarContent: { gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, marginBottom: 30 },
  brandName: { fontSize: 23, fontWeight: '700', letterSpacing: -0.6 },
  caption: { fontSize: 10, fontWeight: '600', letterSpacing: 1, paddingHorizontal: 10, marginBottom: 12 },
  destination: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  destinationText: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  portfolio: { gap: 18 },
  portfolioHorizontal: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  balance: { minWidth: 0 },
  balanceFlexible: { flex: 1 },
  actions: { width: 352 }
});
