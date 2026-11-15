import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MobileThemePalette } from './theme';
export type PortfolioSection = 'home' | 'nfts' | 'staking';
const sections = [
  { id: 'home', label: 'Assets' },
  { id: 'nfts', label: 'NFTs' },
  { id: 'staking', label: 'Staking' }
] as const;

export function PortfolioSectionTabs(props: { selected: PortfolioSection; onSelect: (section: PortfolioSection) => void; palette: MobileThemePalette; disabled: boolean; stakingAvailable: boolean; nftsAvailable?: boolean }) {
  return <View style={[styles.tabs, { borderBottomColor: props.palette.panelBorder }]} accessibilityRole="tablist">
    {sections.filter(section => (section.id !== 'staking' || props.stakingAvailable) && (section.id !== 'nfts' || props.nftsAvailable !== false)).map(section => {
      const selected = props.selected === section.id;
      const color = selected ? props.palette.text : props.palette.muted;
      return <Pressable key={section.id} accessibilityRole="tab" accessibilityLabel={section.label} accessibilityState={{ selected, disabled: props.disabled }} disabled={props.disabled} onPress={() => props.onSelect(section.id)} style={[styles.tab, { borderBottomColor: selected ? props.palette.grape : 'transparent' }]}>
        <Text style={[styles.label, { color }]}>{section.label}</Text>
      </Pressable>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 24, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 12 },
  tab: { alignItems: 'center', justifyContent: 'center', minHeight: 44, borderBottomWidth: 2, paddingHorizontal: 2, paddingVertical: 10 },
  label: { fontSize: 16, fontWeight: '600', flexShrink: 1 }
});
