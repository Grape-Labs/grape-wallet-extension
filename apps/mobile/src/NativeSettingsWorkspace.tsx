import { Children, Fragment, isValidElement, createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { SelectionSheet } from './SelectionSheet';
import type { MobileThemePalette } from './theme';
import { getSettingsLayout, settingsQrSize, MOBILE_SETTINGS_CATEGORIES, type MobileSettingsCategory } from './settingsLayout';
const Canvas = createContext({ contentWidth: 360, columns: 1, roomy: false });
function panelChildren(children: ReactNode): ReactNode[] { return Children.toArray(children).flatMap(child => isValidElement<{ children: ReactNode }>(child) && child.type === Fragment ? panelChildren(child.props.children) : [child]); }
export function SettingsPanelGrid({ children }: { children: ReactNode }) {
  const { contentWidth, columns } = useContext(Canvas);
  const items = panelChildren(children);
  const twoColumns = columns === 2 && items.length > 1;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 18 }}>
    {items.map((child, index) => <View key={isValidElement(child) ? child.key ?? index : index} style={{ width: twoColumns ? Math.max(0, (contentWidth - 18) / 2) : '100%', minWidth: 0 }}>{child}</View>)}
  </View>;
}
export function MobileSettingsPanel({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  const { roomy } = useContext(Canvas);
  const palette = useContext(Palette);
  return <View style={{ minWidth: 0, padding: roomy ? 22 : 18, gap: 20, borderWidth: 1, borderColor: palette.panelBorder, borderRadius: 18, backgroundColor: palette.panel }}>
    <View style={{ gap: 7 }}><Text accessibilityRole="header" style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>{summary ? <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 20 }}>{summary}</Text> : null}</View>
    <View style={{ gap: 18, minWidth: 0 }}>{children}</View>
  </View>;
}
export function SettingsQrFrame({ children }: { children: (size: number) => ReactNode }) {
  const [width, setWidth] = useState(202);
  const palette = useContext(Palette);
  const size = settingsQrSize(width);
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ width: '100%', minWidth: 0, alignItems: 'center', padding: 16, borderRadius: 20, backgroundColor: palette.frost, borderWidth: 1, borderColor: palette.panelBorder }}><View style={{ width: size + 36, height: size + 36, padding: 18, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>{children(size)}</View></View>;
}
const Palette = createContext({} as MobileThemePalette);
export function NativeSettingsWorkspace(props: { active: MobileSettingsCategory; onSelect: (category: MobileSettingsCategory) => void; palette: MobileThemePalette; version: string; reduceMotion: boolean; activeScreen: boolean; disabled: boolean; children: ReactNode }) {
  const { width, height, fontScale } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const [picker, setPicker] = useState(false);
  const layout = getSettingsLayout(measured || Math.min(width - 24, 560), fontScale);
  const palette = props.palette;
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const current = MOBILE_SETTINGS_CATEGORIES.find(item => item.id === props.active)!;
  const tabScroll = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  const reveal = () => tabScroll.current?.scrollTo({ x: Math.max(0, (positions.current[props.active] ?? 0) - 14), animated: false });
  useEffect(reveal, [props.active, layout.navigation, measured]);
  useEffect(() => { if (!props.activeScreen) setPicker(false); }, [props.activeScreen]);
  useEffect(() => { if (!picker) return; const listener = BackHandler.addEventListener('hardwareBackPress', () => { setPicker(false); return true; }); return () => listener.remove(); }, [picker]);
  function select(category: MobileSettingsCategory) { if (props.disabled) return; setPicker(false); props.onSelect(category); }
  const destination = (item: typeof MOBILE_SETTINGS_CATEGORIES[number], sheet = false) => <Pressable key={item.id} accessibilityRole={sheet ? 'button' : 'tab'} accessibilityLabel={item.label} disabled={props.disabled} accessibilityState={{ selected: props.active === item.id, disabled: props.disabled }}
    onLayout={event => { if (!sheet) { positions.current[item.id] = event.nativeEvent.layout.x; if (item.id === props.active) reveal(); } }}
    onPress={() => select(item.id)} style={[styles.destination, props.active === item.id && styles.selected, props.disabled && { opacity: .45 }, sheet && { justifyContent: 'flex-start' }]}>
    <Feather name={item.icon} size={18} color={props.active === item.id ? palette.grape : palette.muted} /><Text style={[styles.destinationText, { color: props.active === item.id ? palette.text : palette.muted }]}>{item.label}</Text>{sheet && props.active === item.id ? <Feather name="check" size={18} color={palette.grape} /> : null}
  </Pressable>;
  const categoryNavigation = layout.navigation === 'sidebar' ? <View style={styles.rail}>
    <ScrollView style={{ maxHeight: Math.max(280, height - 180) }} contentContainerStyle={{ gap: 20 }} showsVerticalScrollIndicator={false}>
      {['Wallet','Community','Support'].map(group => <View key={group} style={{ gap: 5 }}><Text style={styles.group}>{group.toUpperCase()}</Text>{MOBILE_SETTINGS_CATEGORIES.filter(item => item.group === group).map(item => destination(item))}</View>)}
      <Text style={styles.version}>Grape Wallet · v{props.version}</Text>
    </ScrollView>
  </View> : layout.navigation === 'tabs' ? <ScrollView ref={tabScroll} horizontal showsHorizontalScrollIndicator accessibilityRole="tablist" contentContainerStyle={{ gap: 8, paddingBottom: 8 }} style={{ flexGrow: 0 }}>
    {MOBILE_SETTINGS_CATEGORIES.map(item => destination(item))}
  </ScrollView> : <Pressable accessibilityRole="button" accessibilityLabel={`Settings category: ${current.label}. Choose category`} disabled={props.disabled} onPress={() => setPicker(true)} style={[styles.destination, styles.selected, props.disabled && { opacity: .45 }, { justifyContent: 'space-between' }]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Feather name={current.icon} size={20} color={palette.grape} /><Text style={[styles.destinationText, { color: palette.text }]}>{current.label}</Text></View><Feather name="chevron-down" size={20} color={palette.muted} />
  </Pressable>;
  return <Palette.Provider value={palette}><View onLayout={event => setMeasured(event.nativeEvent.layout.width)} style={styles.root}>
    <View style={styles.pageHeading}><Text accessibilityRole="header" style={styles.title}>Settings</Text><Text style={styles.description}>Manage your wallet and connections.</Text></View>
    {layout.navigation !== 'sidebar' ? categoryNavigation : null}
    <View style={{ flexDirection: layout.navigation === 'sidebar' ? 'row' : 'column', gap: 28, alignItems: 'flex-start' }}>
      {layout.navigation === 'sidebar' ? categoryNavigation : null}
      <View style={{ flex: layout.navigation === 'sidebar' ? 1 : undefined, width: layout.navigation === 'sidebar' ? undefined : '100%', minWidth: 0, gap: 20 }}>
        <View style={styles.categoryHeading}><View style={styles.categoryIcon}><Feather name={current.icon} size={22} color={palette.grape} /></View><View style={{ flex: 1, gap: 5 }}><Text accessibilityRole="header" style={styles.categoryTitle}>{current.label}</Text><Text style={styles.description}>{current.description}</Text></View></View>
        <Canvas.Provider value={{ contentWidth: layout.contentWidth, columns: layout.columns, roomy: layout.navigation !== 'picker' }}>{props.children}</Canvas.Provider>
      </View>
    </View>
    <SelectionSheet visible={picker} onDismiss={() => setPicker(false)} onClosed={() => {}} background={palette.panel} color={palette.text} muted={palette.muted} reduceMotion={props.reduceMotion}>
      <Text accessibilityRole="header" style={styles.categoryTitle}>Settings categories</Text><BottomSheetScrollView contentContainerStyle={{ gap: 8, paddingBottom: 20 }}>{MOBILE_SETTINGS_CATEGORIES.map(item => destination(item, true))}</BottomSheetScrollView>
    </SelectionSheet>
  </View></Palette.Provider>;
}
function makeStyles(p: MobileThemePalette) { return StyleSheet.create({
  root: { width: '100%', minWidth: 0, gap: 24 }, pageHeading: { gap: 8, paddingBottom: 2 }, title: { fontSize: 30, fontWeight: '800', color: p.text }, description: { color: p.muted, fontSize: 13, lineHeight: 20 },
  categoryHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, categoryTitle: { fontSize: 21, fontWeight: '700', color: p.text }, categoryIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: p.frost },
  rail: { width: 176, flexShrink: 0 }, group: { fontSize: 10, letterSpacing: 1, color: p.muted, marginBottom: 6, paddingHorizontal: 12 },
  destination: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', backgroundColor: p.frost },
  selected: { backgroundColor: p.frost, borderColor: p.grape }, destinationText: { fontSize: 14, fontWeight: '600', flexShrink: 1 }, version: { fontSize: 11, lineHeight: 18, color: p.muted, paddingHorizontal: 12, marginTop: 4 },
}); }
