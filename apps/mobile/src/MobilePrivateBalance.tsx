import { NativePrivacyFlow } from './NativePrivacyFlow';
import { NativePrivateBalanceGuide } from './NativePrivateBalanceGuide';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PrivacySnapshot } from '@grape/solana/privacy';
import type { MobileThemePalette } from './theme';
import type { TransactionReview } from './transactionReview';
import { PrivacyRuntime, type PrivacyRuntimeHandle } from './PrivacyRuntime';
import { createMobilePrivacyService, privateSol, privacyError, type MobilePrivacyAction } from './solanaPrivacy';
import { withMobilePrivacySeed, type MobileWallet, type MobileWalletState } from './wallet';


type Props = { wallet: MobileWallet; state: MobileWalletState; palette: MobileThemePalette; reduceMotion: boolean; authorize: () => number; endpoint: string; publicValue: string; solPrice: number; onValue: (walletId: string, usd: number | null) => void; onHide: () => void; onBusy: (busy: boolean) => void; onReview: (title: string, items: TransactionReview['items'], execute: () => Promise<void>) => void; onSubmitted: (signature: string, action: MobilePrivacyAction, uncertain: boolean) => Promise<void> };
export function MobilePrivateBalance(props: Props) {
  const { palette: p } = props;
  const styles = useMemo(() => StyleSheet.create({ box: { marginTop: 20, gap: 16 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, text: { color: p.text, fontSize: 15 }, muted: { color: p.muted, lineHeight: 21, fontSize: 13 }, button: { minHeight: 48, borderRadius: 14, backgroundColor: p.frost, padding: 14, alignItems: 'center', justifyContent: 'center' }, input: { minHeight: 54, borderWidth: 1, borderColor: p.panelBorder, borderRadius: 14, padding: 14, color: p.text, backgroundColor: p.softPanel, fontSize: 18 }, card: { flex: 1, padding: 16, gap: 9, backgroundColor: p.frost, borderRadius: 16, minHeight: 82 }, error: { color: p.danger, fontSize: 13, lineHeight: 20 } }), [p]);
  const runtime = useRef<PrivacyRuntimeHandle>(null);
  const [ready, setReady] = useState(false);
  const [engineKey, setEngineKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PrivacySnapshot | null>(null);
  const [action, setAction] = useState<MobilePrivacyAction['action']>('deposit');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [submission, setSubmission] = useState<{ signature: string; status: string } | null>(null);
  useEffect(() => () => props.onBusy(false), []);
  const request = useRef(0);
  const latest = useRef(props); latest.current = props;
  const { width, fontScale } = useWindowDimensions();
  const service = useMemo(() => {
    try { return createMobilePrivacyService({ wallet: props.wallet, endpoint: props.endpoint, storage: AsyncStorage, authorize: props.authorize, runtime: async <T,>(data: Record<string, unknown>) => withMobilePrivacySeed(latest.current.state, props.wallet, props.authorize, seed => {
      if (!runtime.current) throw new Error('Private balance engine is unavailable.');
      return runtime.current.call<T>({ ...data, seed });
    }) }); } catch { return null; }
  }, [props.wallet.id, props.wallet.address, props.endpoint]);
  async function refresh() {
    if (!ready || !service || busy) return;
    const id = ++request.current; setBusy(true); setError(null);
    try { const result = await service.sync(); if (id === request.current) { setSnapshot(result.snapshot); setSubmission(result.submission); } }
    catch (error) { if (id === request.current) { setSnapshot(null); setError(privacyError(error)); } }
    finally { if (id === request.current) setBusy(false); }
  }
  useEffect(() => { if (ready) void refresh(); return () => { request.current += 1; }; }, [ready, service]);
  const disabled = busy || !ready || !service;
  const balance = snapshot ? privateSol(snapshot) : '—';
  const otherTokens = snapshot?.balances.filter(item => item.mint !== '11111111111111111111111111111111' && item.amount !== '0') ?? [];
  const privateUsd = snapshot?.registered && !otherTokens.length && Number.isFinite(props.solPrice) && props.solPrice > 0 ? Number(balance) * props.solPrice : null;
  useEffect(() => { props.onValue(props.wallet.id, privateUsd); return () => props.onValue(props.wallet.id, null); }, [props.onValue, props.wallet.id, privateUsd]);
  const masked = props.state.privacyMode;
  const button = (label: string, onPress: () => void, primary = false, off = disabled) => <Pressable accessibilityRole="button" disabled={off} onPress={onPress} style={[styles.button, primary && { backgroundColor: p.primaryButton }, off && { opacity: .45 }]}><Text style={[styles.text, { fontWeight: '700', color: primary ? p.primaryButtonText : p.text }]}>{label}</Text></Pressable>;
  async function review() {
    if (disabled || !service || !snapshot) return;
    const chosen: MobilePrivacyAction = snapshot.registered ? { action, amount: amount.trim(), ...(action === 'deposit' ? {} : { recipient: action === 'withdraw' && !recipient.trim() ? props.wallet.address : recipient.trim() }) } : { action: 'register' };
    setBusy(true); props.onBusy(true); setError(null);
    try {
      const review = await service.prepare(chosen);
      props.authorize();
      props.onReview(chosen.action === 'register' ? 'Create private balance' : 'Review private balance transaction', [
        { label: 'Action', value: chosen.action === 'register' ? 'Register private balance. No funds are deposited.' : `${chosen.action === 'deposit' ? 'Add' : chosen.action === 'transfer' ? 'Private send' : 'Withdraw'} ${chosen.amount} SOL` },
        ...(chosen.recipient ? [{ label: 'Recipient', value: chosen.recipient }] : []),
        { label: 'Network fee', value: `${review.feeLamports / 1e9} SOL` },
        { label: 'Estimated public wallet debit', value: `${review.debitLamports / 1e9} SOL` },
        { label: 'Visibility', value: chosen.action === 'transfer' ? 'Sender and recipient remain visible; amount and asset are hidden.' : 'Setup, deposits and withdrawals are publicly visible.' },
        ...(chosen.action === 'register' ? [{ label: 'Setup cost', value: 'Included in the wallet debit. The protocol currently offers no registration closure or rent refund.' }] : [])
      ], async () => {
        setBusy(true); props.onBusy(true); setError(null);
        try {
          props.authorize();
          const result = await service.submit(review);
          setSubmission(result); setSnapshot(null);
          await props.onSubmitted(result.signature, chosen, result.status === 'unknown');
          // Explicit refresh checks chain status; submission alone is not confirmation.
        } catch (error) { setError(privacyError(error)); }
        finally { setBusy(false); props.onBusy(false); }
      });
    } catch (error) { setError(privacyError(error)); }
    finally { setBusy(false); props.onBusy(false); }
  }
  return <View style={styles.box}>
    {service ? <PrivacyRuntime key={engineKey} ref={runtime} onReady={() => setReady(true)} onError={message => { setReady(false); setError(message); }} /> : null}
    <View style={styles.row}><View style={styles.card}><Text style={styles.muted}>Public</Text><Text style={[styles.text, { fontWeight: '700' }]}>{masked ? '••••' : props.publicValue}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Open private balance" onPress={() => setExpanded(!expanded)} style={[styles.card, { borderWidth: 1, borderColor: p.grape }]}><View style={styles.row}><Text style={styles.muted}>Private</Text><Feather name="lock" size={15} color={p.grape} /></View><Text style={[styles.text, { fontWeight: '700' }]}>{masked ? '••••' : snapshot && !snapshot.registered ? 'Set up' : `${balance} SOL${otherTokens.length ? ' + tokens' : ''}`}</Text></Pressable></View>
    {expanded ? <>
      <View style={styles.row}><Text style={[styles.text, { fontWeight: '700' }]}>Private balance</Text><View style={styles.row}>{button('Refresh', () => void refresh(), false, disabled)}</View></View>
      <Text style={styles.muted}>Mainnet · {props.wallet.address.slice(0,4)}…{props.wallet.address.slice(-4)}</Text>
      {!service ? <Text style={styles.error}>Private balances need a configured Helius mainnet RPC.</Text> : null}
      {!ready && service && !error ? <ActivityIndicator color={p.grape} /> : null}
      {snapshot?.registered ? <View style={{ flexDirection: 'row', gap: 6 }}>{(['deposit','transfer','withdraw'] as const).map(item => <View key={item} style={{ flex: 1 }}>{button(item === 'deposit' ? 'Add' : item === 'transfer' ? 'Send' : 'Withdraw', () => setAction(item), action === item)}</View>)}</View> : null}
      {snapshot ? <View style={{ flexDirection: width / fontScale >= 900 ? 'row' : 'column', gap: 18 }}><View style={{ flex: width / fontScale >= 900 ? 1 : undefined, minWidth: 0 }}><NativePrivacyFlow palette={p} action={snapshot.registered ? action : 'register'} reduceMotion={props.reduceMotion} /></View><View style={{ flex: 1, gap: 12 }}>
        {snapshot.registered ? <><Text style={styles.muted}>Amount · SOL</Text><TextInput accessibilityLabel="Private balance amount in SOL" editable={!disabled} value={amount} onChangeText={value => setAmount(value.replace(',', '.'))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={p.muted} style={styles.input} />{action !== 'deposit' ? <><Text style={styles.muted}>{action === 'withdraw' ? 'Recipient (leave blank for this wallet)' : 'Recipient wallet'}</Text><TextInput accessibilityLabel="Private balance recipient" editable={!disabled} value={recipient} onChangeText={setRecipient} autoCapitalize="none" autoCorrect={false} placeholder="Solana address" placeholderTextColor={p.muted} style={[styles.input, { fontSize: 14 }]} /></> : null}</> : <><Text style={[styles.text, { fontWeight: '700', fontSize: 20 }]}>Create your private balance</Text><Text style={styles.muted}>Your wallet address stays the same. Setup registers private keys without moving funds. Setup costs cannot currently be reclaimed.</Text></>}
        <Text style={styles.muted}>{action === 'transfer' && snapshot.registered ? 'Private sends hide the amount and asset. Sender and recipient remain visible. The recipient must have a private balance.' : 'The amount and asset are public when adding or withdrawing SOL.'}</Text>
        {button(busy ? 'Working…' : snapshot.registered ? 'Review transaction' : 'Review setup', () => void review(), true)}
      </View></View> : null}
      {otherTokens.length ? <Text style={styles.muted}>Other private tokens are held in this balance. This version supports SOL transactions; token values are excluded from the portfolio total.</Text> : null}
      <NativePrivateBalanceGuide palette={p} />
      {button('Remove from home', props.onHide, false, busy)}
      <Text style={styles.muted}>This only hides the section. Your funds and setup remain. Show it again in Settings → Add-ons.</Text>
    </> : null}
    {error ? <View style={{ gap: 10 }}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>{!ready && service ? button('Restart private balances', () => { setError(null); setEngineKey(value => value + 1); }, false, busy) : null}</View> : null}
    {submission ? <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(`https://explorer.solana.com/tx/${submission.signature}`); }}><Text style={[styles.muted, { color: p.grape }]}>{submission.status === 'confirmed' ? 'Transaction confirmed' : submission.status === 'failed' ? 'Transaction failed' : 'Transaction submitted — check status before retrying'} · View transaction</Text></Pressable> : null}
  </View>;
}
