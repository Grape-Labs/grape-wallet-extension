import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { redactRpcDetails } from '@grape/core';
import { loadWalletCollectibles, type MobileWallet, type MobileAsset } from './wallet';
import { getMobileSolanaRpcUrl } from './config';
import type { MobileCollectible } from './collectibles';
import type { MobileThemePalette } from './theme';

export function NftsScreen(props: { wallet: MobileWallet; palette: MobileThemePalette; active: boolean; reduceMotion: boolean; onBack: () => void; loadPage?: typeof loadWalletCollectibles; knownAssets?: MobileAsset[] }) {
  const { width, fontScale } = useWindowDimensions();
  const styles = useMemo(() => createStyles(props.palette), [props.palette]);
  const knownItems = useMemo(() => (props.knownAssets ?? []).filter(asset => asset.chain === props.wallet.chain && asset.tokenType === 'nft').map(asset => ({
    id: asset.chain === 'sui' ? asset.address || asset.id : asset.chain === 'ethereum' || asset.chain === 'monad' ? `${asset.address}:${asset.accountAddress}` : asset.address || asset.id,
    chain: asset.chain, name: asset.name, image: asset.logoUri, description: asset.description,
    collection: asset.chain === 'ethereum' || asset.chain === 'monad' ? asset.description : undefined,
    contract: asset.chain === 'ethereum' || asset.chain === 'monad' ? asset.address : undefined,
    tokenId: asset.chain === 'ethereum' || asset.chain === 'monad' ? asset.accountAddress : undefined
  })), [props.knownAssets, props.wallet.chain]);
  const [items, setItems] = useState<MobileCollectible[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [failedCursor, setFailedCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MobileCollectible | null>(null);
  const [contentWidth, setContentWidth] = useState(width - 24);
  const loadPage = props.loadPage ?? loadWalletCollectibles;
  const requestId = useRef(0);
  const busy = useRef(false);
  const rpcUrl = getMobileSolanaRpcUrl('mainnet-beta');
  const walletId = props.wallet.id, owner = props.wallet.address, chain = props.wallet.chain;
  const refresh = useCallback(async (next?: string) => {
    if (busy.current) return;
    busy.current = true; const id = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const result = await loadPage({ address: owner, chain }, next);
      if (id !== requestId.current) return;
      setItems(previous => [...new Map([...(next ? previous : []), ...result.items].map(item => [item.id, item])).values()]);
      setCursor(result.nextCursor);
    } catch (error) { if (id === requestId.current) { setFailedCursor(next); setError(redactRpcDetails(error instanceof Error ? error.message : 'Could not load NFTs. Refresh to try again.')); } }
    finally { if (id === requestId.current) { setLoading(false); busy.current = false; } }
  // Wallet identity and network changes must invalidate in-flight discovery.
  }, [owner, chain, loadPage]);
  useEffect(() => {
    busy.current = false;
    if (props.active) void refresh(); else setSelected(null);
    return () => { requestId.current += 1; busy.current = false; };
  }, [props.active, walletId, rpcUrl, refresh]);
  const displayedItems = useMemo(() => [...new Map([...knownItems, ...items].map(item => [item.id, item])).values()], [knownItems, items]);
  const visible = useMemo(() => displayedItems.filter(item => `${item.name} ${item.collection ?? ''} ${item.id}`.toLowerCase().includes(search.trim().toLowerCase())), [displayedItems, search]);
  const columns = contentWidth < 600 ? fontScale >= 1.4 ? 1 : 2 : Math.max(2, Math.min(5, Math.floor((contentWidth + 12) / (180 * fontScale + 12))));
  const cardWidth = Math.floor((contentWidth - (columns - 1) * 12) / columns);
  const explorer = (item: MobileCollectible) => item.chain === 'solana' ? `https://explorer.solana.com/address/${encodeURIComponent(item.id)}` : item.chain === 'sui' ? `https://suiscan.xyz/mainnet/object/${encodeURIComponent(item.id)}` : `${item.chain === 'ethereum' ? 'https://eth.blockscout.com' : 'https://monadscan.com'}/token/${encodeURIComponent(item.contract ?? item.id)}`;
  return <View style={styles.root} onLayout={event => setContentWidth(event.nativeEvent.layout.width)}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back to assets" style={styles.icon} onPress={props.onBack}><Feather name="arrow-left" size={23} color={props.palette.text} /></Pressable><View style={styles.flex}><Text accessibilityRole="header" style={styles.title}>NFTs</Text><Text style={styles.hint}>{displayedItems.length} collectible{displayedItems.length === 1 ? '' : 's'}{cursor ? ' loaded' : ''}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh NFTs" style={styles.icon} disabled={loading} onPress={() => void refresh()}>{loading ? <ActivityIndicator color={props.palette.grape} /> : <Feather name="refresh-cw" size={20} color={props.palette.muted} />}</Pressable></View>
    <View style={styles.search}><Feather name="search" size={18} color={props.palette.muted} /><TextInput accessibilityLabel="Search NFTs" placeholder="Search name or collection" placeholderTextColor={props.palette.muted} value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} style={styles.searchInput} /></View>
    {error ? <View style={styles.status} accessibilityLiveRegion="polite"><Text accessibilityRole="alert" style={styles.error}>{displayedItems.length ? `Showing NFTs already loaded with Assets. Refresh failed: ${error}` : error}</Text><Pressable accessibilityRole="button" style={styles.secondary} onPress={() => void refresh(failedCursor)}><Text style={styles.body}>Try again</Text></Pressable></View> : null}
    {loading && !displayedItems.length ? <View style={styles.empty}><ActivityIndicator color={props.palette.grape} /><Text style={styles.hint}>Loading your NFTs…</Text></View> : null}
    {!loading && !error && !visible.length ? <View style={styles.empty}><Feather name="image" size={36} color={props.palette.grape} /><Text style={styles.sectionTitle}>{search ? 'No matching NFTs' : cursor ? 'More assets to check' : 'No NFTs found'}</Text><Text style={[styles.hint, { textAlign: 'center' }]}>{search ? 'Try another name or collection.' : cursor ? 'Load more to continue checking this wallet’s NFTs.' : `NFTs returned for this ${chain === 'solana' ? 'Solana' : chain === 'sui' ? 'Sui' : chain === 'monad' ? 'Monad' : chain === 'ethereum' ? 'Ethereum' : 'network'} wallet appear here.`}</Text></View> : null}
    <View style={styles.grid}>{visible.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}${item.collection ? `, ${item.collection}` : ''}. NFT details`} onPress={() => setSelected(item)} style={[styles.card, { width: cardWidth }]}><NftArtwork item={item} palette={props.palette} /><View style={styles.cardCopy}><Text numberOfLines={1} style={styles.body}>{item.name}</Text><Text numberOfLines={1} style={styles.hint}>{item.collection || 'NFT'}</Text></View></Pressable>)}</View>
    {cursor ? <Pressable accessibilityRole="button" accessibilityLabel="Load more NFTs" disabled={loading} style={styles.secondary} onPress={() => void refresh(cursor)}>{loading ? <ActivityIndicator color={props.palette.grape} /> : <Text style={styles.body}>Load more NFTs</Text>}</Pressable> : null}
    <Modal visible={!!selected} transparent animationType={props.reduceMotion ? 'none' : 'fade'} onRequestClose={() => setSelected(null)}><View style={styles.overlay}><View style={styles.modal} accessibilityViewIsModal><View style={styles.header}><Text accessibilityRole="header" style={[styles.sectionTitle, styles.flex]}>NFT details</Text><Pressable accessibilityRole="button" accessibilityLabel="Close NFT details" style={styles.icon} onPress={() => setSelected(null)}><Feather name="x" size={22} color={props.palette.text} /></Pressable></View>{selected ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 12 }}><View style={{ width: '100%', maxWidth: 320, alignSelf: 'center', overflow: 'hidden', borderRadius: 16 }}><NftArtwork item={selected} palette={props.palette} resizeMode="contain" /></View><Text style={styles.title}>{selected.name}</Text>{selected.collection ? <Text style={styles.hint}>{selected.collection}</Text> : null}{selected.description ? <Text style={styles.description}>{selected.description}</Text> : null}<Text style={styles.hint}>{selected.chain === 'sui' ? 'Object ID' : selected.chain === 'solana' ? 'Asset address' : 'Contract and token ID'}</Text><Text selectable style={styles.address}>{selected.contract ? `${selected.contract}\nToken ID: ${selected.tokenId}` : selected.id}</Text><Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { void Linking.openURL(explorer(selected)).catch(() => Alert.alert('Could not open the explorer', 'Check your connection and try again.')); }}><Text style={styles.body}>View on explorer</Text></Pressable></ScrollView> : null}</View></View></Modal>
  </View>;
}
function NftArtwork({ item, palette, resizeMode = 'cover' }: { item: MobileCollectible; palette: MobileThemePalette; resizeMode?: 'cover' | 'contain' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item]);
  return <View style={{ aspectRatio: 1, width: '100%', backgroundColor: palette.frost, alignItems: 'center', justifyContent: 'center' }}>{item.image && !failed ? <Image accessibilityLabel={item.name} source={{ uri: item.image }} resizeMode={resizeMode} onError={() => setFailed(true)} style={StyleSheet.absoluteFillObject} /> : <Feather name="image" size={32} color={palette.muted} />}</View>;
}
const createStyles = (palette: MobileThemePalette) => StyleSheet.create({
  root: { gap: 20 }, flex: { flex: 1, minWidth: 0 }, header: { flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { color: palette.text, fontSize: 23, fontWeight: '700' }, icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, hint: { color: palette.muted, fontSize: 12, lineHeight: 18 }, sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '700' }, body: { color: palette.text, fontSize: 14, fontWeight: '600' },
  search: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 14, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: palette.panelBorder, backgroundColor: palette.frost }, searchInput: { flex: 1, minWidth: 0, color: palette.text, fontSize: 14, paddingVertical: 12 }, empty: { paddingHorizontal: 24, paddingVertical: 48, alignItems: 'center', gap: 16 }, status: { gap: 12 }, error: { color: palette.danger, fontSize: 13, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, card: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: palette.panelBorder, backgroundColor: palette.panel }, cardCopy: { padding: 12, gap: 5 }, secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 24, backgroundColor: palette.frost }, overlay: { flex: 1, backgroundColor: '#0009', padding: 24, alignItems: 'center', justifyContent: 'center' }, modal: { width: '100%', maxWidth: 560, maxHeight: '85%', backgroundColor: palette.bg, borderRadius: 24, padding: 20, gap: 16, borderWidth: 1, borderColor: palette.panelBorder }, description: { color: palette.text, fontSize: 14, lineHeight: 22 }, address: { color: palette.muted, fontSize: 12, lineHeight: 19 }
});
