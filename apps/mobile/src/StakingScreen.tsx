import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import { parseStakeAmount, redactRpcDetails, stakeAccountStatus, stakeSol, type NativeStakeAccount, type NativeStakeValidator } from '@grape/core';
import type { MobileThemePalette } from './theme';
import { SelectionSheet, SheetSearchInput } from './SelectionSheet';
import { createMobileStakingService, type MobileStakeRequest } from './solanaStaking';

type Stage = 'overview' | 'account' | 'stake' | 'withdraw';
export type MobileStakeNotice = { signature: string; title: string };
type Props = {
  owner: string; rpcUrl: string; palette: MobileThemePalette; active: boolean; busy: boolean; reviewOpen: boolean;
  balanceLamports: number | null; solPrice: number | null; privacy: boolean; reduceMotion: boolean;
  reloadToken: number; notice: MobileStakeNotice | null; error: string | null;
  onBack: () => void; onReview: (request: MobileStakeRequest) => Promise<void>;
};
const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
const nameFor = (validators: NativeStakeValidator[], address: string | null) => validators.find(item => item.voteAccount === address)?.name || (address ? `Validator ${short(address)}` : 'Undelegated SOL');

export function StakingScreen(props: Props) {
  const { width, fontScale } = useWindowDimensions();
  const styles = useMemo(() => createStyles(props.palette), [props.palette]);
  const service = useMemo(() => createMobileStakingService(props.rpcUrl), [props.rpcUrl]);
  const [stage, setStage] = useState<Stage>('overview');
  const [accounts, setAccounts] = useState<NativeStakeAccount[]>([]);
  const [validators, setValidators] = useState<NativeStakeValidator[]>([]);
  const [loading, setLoading] = useState(true);
  const [validatorsLoading, setValidatorsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [expandedWarning, setExpandedWarning] = useState(false);
  const [accountAddress, setAccountAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [vote, setVote] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);
  const requestId = useRef(0);
  const account = accounts.find(item => item.address === accountAddress);
  const validator = validators.find(item => item.voteAccount === vote);
  const accountValidator = validators.find(item => item.voteAccount === account?.voter);
  const status = account ? stakeAccountStatus(account) : null;
  const canUnstake = !!account && account.staker === props.owner && account.delegatedLamports > 0 && !status?.coolingDown && status?.tone !== 'neutral';
  const canWithdraw = !!account && account.withdrawer === props.owner;
  const wide = contentWidth / Math.max(1, fontScale) >= 880;
  const maskSol = (lamports: number) => props.privacy ? '•••• SOL' : `${stakeSol(lamports)} SOL`;
  const fiat = (lamports: number) => props.privacy ? '••••' : props.solPrice != null && props.solPrice > 0 ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(lamports / 1e9 * props.solPrice) : null;
  const amountLamports = parseStakeAmount(amount);
  const amountValid = amountLamports != null && (stage === 'withdraw' ? !!account && amountLamports <= BigInt(account.lamports) : props.balanceLamports != null && amountLamports < BigInt(props.balanceLamports));
  const visibleValidators = useMemo(() => validators.filter(item => `${item.name ?? ''} ${item.voteAccount}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 80), [validators, search]);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true); setValidatorsLoading(true); setLoadError(null);
    void service.accounts(props.owner).then(result => { if (id === requestId.current) { setAccounts(result.accounts); setWarnings(result.warnings); } }).catch(error => { if (id === requestId.current) { setAccounts([]); setLoadError(redactRpcDetails(error instanceof Error ? error.message : 'Could not load stake accounts.')); } }).finally(() => { if (id === requestId.current) setLoading(false); });
    void service.validators().then(result => { if (id === requestId.current) setValidators(result); }).catch(() => { if (id === requestId.current) setValidators([]); }).finally(() => { if (id === requestId.current) setValidatorsLoading(false); });
  }, [service, props.owner]);
  useEffect(() => { if (props.active) refresh(); return () => { requestId.current += 1; }; }, [props.active, props.reloadToken, refresh]);
  useEffect(() => { if (props.notice) { setStage('overview'); setAmount(''); } }, [props.notice]);
  useEffect(() => {
    if (!props.active) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (props.busy) return true;
      if (props.reviewOpen) return false;
      if (pickerOpen) { setPickerOpen(false); return true; }
      if (stage === 'overview') return false;
      setStage(stage === 'withdraw' ? 'account' : 'overview'); return true;
    });
    return () => listener.remove();
  }, [props.active, props.busy, props.reviewOpen, pickerOpen, stage]);

  function back() { if (props.busy || props.reviewOpen) return; if (stage === 'overview') props.onBack(); else setStage(stage === 'withdraw' ? 'account' : 'overview'); }
  function startStake() { setAmount(''); setStage('stake'); }
  function review(request: MobileStakeRequest) { if (!props.busy) void props.onReview(request); }
  const button = (label: string, onPress: () => void, disabled = false, secondary = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || props.busy} onPress={onPress} style={[styles.action, secondary ? styles.secondary : styles.primary, (disabled || props.busy) && styles.disabled]}><Text style={[styles.actionText, { color: secondary ? props.palette.text : props.palette.primaryButtonText }]}>{label}</Text></Pressable>;
  const avatar = (name: string) => <View style={styles.avatar}>{name.startsWith('Validator ') || name === 'Undelegated SOL' ? <MaterialCommunityIcons name="sprout-outline" size={23} color={props.palette.grape} /> : <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>}</View>;
  const badge = (item: NativeStakeAccount) => { const state = stakeAccountStatus(item); return <View style={[styles.badge, { backgroundColor: state.coolingDown ? '#769aff18' : props.palette.frost }]}><Text style={[styles.badgeText, { color: state.tone === 'active' ? props.palette.mint : state.tone === 'cooling' ? '#91acff' : props.palette.muted }]}>{state.label}</Text></View>; };
  const balance = (lamports: number, label: string) => <View style={styles.balance}><Text style={styles.eyebrow}>{label}</Text><Text adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1} style={styles.balanceValue}>{fiat(lamports) ?? maskSol(lamports)}</Text>{fiat(lamports) ? <Text style={styles.balanceSol}>{maskSol(lamports)}</Text> : null}</View>;
  const fact = (label: string, value: string) => <View style={styles.fact} key={label}><Text style={styles.helper}>{label}</Text><Text selectable style={styles.factValue}>{value}</Text></View>;

  return <View onLayout={event => setContentWidth(event.nativeEvent.layout.width)} style={styles.root}>
    <View style={styles.topbar}><Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={props.busy || props.reviewOpen} onPress={back} style={styles.iconButton}><Feather name="arrow-left" size={23} color={props.palette.text} /></Pressable><Text accessibilityRole="header" style={styles.title}>{stage === 'overview' ? 'Staking' : stage === 'account' ? 'Account details' : stage === 'stake' ? 'Stake SOL' : 'Withdraw SOL'}</Text>
      {stage === 'overview' ? <Pressable accessibilityRole="button" accessibilityLabel="Refresh staking" disabled={props.busy || loading} onPress={refresh} style={styles.iconButton}>{loading ? <ActivityIndicator color={props.palette.grape} /> : <Feather name="refresh-cw" size={20} color={props.palette.muted} />}</Pressable> : stage === 'account' && account ? <Pressable accessibilityRole="button" accessibilityLabel="Stake account options" style={styles.iconButton} onPress={() => Alert.alert('Stake account', short(account.address), [{ text: 'View on explorer', onPress: () => { void Linking.openURL(`https://explorer.solana.com/address/${account.address}`).catch(() => Alert.alert('Could not open explorer')); } }, { text: 'Copy address', onPress: () => { void Clipboard.setStringAsync(account.address).catch(() => Alert.alert('Could not copy address')); } }, { text: 'Cancel', style: 'cancel' }])}><Feather name="more-horizontal" size={23} color={props.palette.text} /></Pressable> : null}
    </View>
    {props.error ? <Text accessibilityRole="alert" style={styles.error}>{redactRpcDetails(props.error)}</Text> : null}
    {loadError ? <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text> : null}
    {props.busy ? <View style={styles.progress} accessibilityLiveRegion="polite"><ActivityIndicator color={props.palette.grape} /><Text style={styles.helper}>Checking or submitting your staking transaction…</Text></View> : null}

    {stage === 'overview' ? <>
      {props.notice ? <Pressable accessibilityRole="button" accessibilityLabel="View submitted staking transaction" style={styles.submitted} onPress={() => { void Linking.openURL(`https://explorer.solana.com/tx/${props.notice!.signature}`).catch(() => Alert.alert('Could not open explorer')); }}><Feather name="check-circle" size={19} color={props.palette.mint} /><View style={styles.flex}><Text style={styles.body}>{props.notice.title}</Text><Text style={styles.helper}>Submitted · check Activity for confirmation</Text></View><Feather name="external-link" size={16} color={props.palette.muted} /></Pressable> : null}
      <View style={styles.hero}>{loading && !accounts.length ? <ActivityIndicator style={{ paddingVertical: 36 }} color={props.palette.grape} accessibilityLabel="Loading stake accounts" /> : loadError ? <View style={styles.balance}><Text style={styles.eyebrow}>TOTAL STAKED</Text><Text style={styles.balanceSol}>Unavailable · refresh to try again</Text></View> : balance(accounts.reduce((sum, item) => sum + item.delegatedLamports, 0), warnings.length ? 'STAKED · PARTIAL BALANCE' : 'TOTAL STAKED')}{button('Stake SOL', startStake, loading)}</View>
      {warnings.length ? <View style={styles.warning}><Pressable accessibilityRole="button" accessibilityState={{ expanded: expandedWarning }} onPress={() => setExpandedWarning(!expandedWarning)} style={styles.inline}><Feather name="info" size={16} color={props.palette.muted} /><Text style={[styles.helper, styles.flex]}>Some stake accounts may be missing</Text><Feather name={expandedWarning ? 'chevron-up' : 'chevron-down'} size={17} color={props.palette.muted} /></Pressable>{expandedWarning ? warnings.map(item => <Text key={item} style={styles.helper}>{redactRpcDetails(item)}</Text>) : null}</View> : null}
      <View style={wide ? styles.columns : styles.stack}><View style={wide ? styles.flex : undefined}><View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.sectionTitle}>Your stake accounts</Text><Text style={styles.helper}>{accounts.length} account{accounts.length === 1 ? '' : 's'}</Text></View>
      {accounts.map(item => { const name = nameFor(validators, item.voter); return <Pressable key={item.address} accessibilityRole="button" accessibilityLabel={`${name}, ${maskSol(item.lamports)}, ${stakeAccountStatus(item).label}. Account details`} onPress={() => { setAccountAddress(item.address); setStage('account'); }} style={styles.accountRow}>{avatar(name)}<View style={styles.accountCopy}><Text numberOfLines={1} style={styles.accountName}>{name}</Text><View style={styles.accountMeta}>{badge(item)}<Text style={styles.accountAddress}>{short(item.address)}</Text></View></View><View style={styles.accountValue}><Text adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1} style={styles.body}>{fiat(item.lamports) ?? maskSol(item.lamports)}</Text>{fiat(item.lamports) ? <Text adjustsFontSizeToFit numberOfLines={1} style={styles.helper}>{maskSol(item.lamports)}</Text> : null}</View></Pressable>; })}
      {!loading && !loadError && !accounts.length ? <View style={styles.empty}><MaterialCommunityIcons name="sprout-outline" size={36} color={props.palette.grape} /><Text style={styles.sectionTitle}>Your SOL can do more</Text><Text style={[styles.helper, { textAlign: 'center' }]}>Stake with a validator and manage your stake accounts here.</Text></View> : null}</View>
      <View style={[styles.learn, wide && { width: 280 }]}><Text style={styles.eyebrow}>GOOD TO KNOW</Text><Text style={styles.sectionTitle}>Staking, made simple</Text>{[{ question: 'How does staking work?', answer: 'You delegate SOL to a validator while keeping control of your stake account. Rewards, when earned, are added to its balance.' }, { question: 'How do I get my SOL back?', answer: 'Open a stake account, choose Unstake, then withdraw after the network finishes deactivation. This flow does not offer instant unstaking.' }, { question: 'Where are my rewards?', answer: 'Rewards are included in your stake account balance. Historical rewards, live APY and unstaking countdowns are not currently available.' }].map(item => <LearnRow key={item.question} {...item} palette={props.palette} />)}</View></View>
    </> : null}

    {stage === 'account' && account ? <View style={wide ? styles.columns : styles.stack}><View style={wide ? styles.flex : undefined}><View style={styles.detailHero}>{balance(account.lamports, 'STAKE ACCOUNT BALANCE')}{badge(account)}</View><View style={styles.validatorCard}>{avatar(nameFor(validators, account.voter))}<View style={styles.flex}><Text style={styles.body}>{nameFor(validators, account.voter)}</Text><Text style={styles.helper}>{accountValidator ? `${accountValidator.commission}% commission` : account.voter ? short(account.voter) : 'No validator selected'}</Text></View></View><View style={styles.facts}>{fact('Delegated', maskSol(account.delegatedLamports))}{fact('Stake account', short(account.address))}{fact('Rewards', 'Included in balance')}</View></View><View style={[styles.stack, wide && { width: 280, paddingTop: 20 }]}>
      {status?.coolingDown ? <Text style={styles.helper}>Unstaking has been requested. The network determines when SOL becomes withdrawable.</Text> : null}
      {canUnstake ? button('Unstake SOL', () => review({ action: 'deactivate', stakeAccount: account.address })) : null}
      {canWithdraw ? button('Withdraw SOL', () => { setAmount(''); setStage('withdraw'); }, false, true) : null}
      <Text style={styles.helper}>Unstaking and withdrawing are separate steps. Only available SOL can be withdrawn.</Text>
      {!canUnstake && !canWithdraw ? <Text style={styles.helper}>Account permissions could not be verified for this wallet. Refresh staking to check again.</Text> : null}
    </View></View> : null}

    {stage === 'stake' || stage === 'withdraw' ? <View style={styles.compose}><View style={styles.sectionHeader}><Text style={styles.helper}>Amount</Text><Text style={styles.available}>{stage === 'stake' ? props.balanceLamports == null ? 'Balance unavailable' : `Available: ${maskSol(props.balanceLamports)}` : account ? `Account balance: ${maskSol(account.lamports)}` : ''}</Text></View><View style={styles.amountRow}><View style={styles.solAvatar}><MaterialCommunityIcons name="equal" size={23} color={props.palette.grape} /></View><Text style={styles.sectionTitle}>SOL</Text><TextInput accessibilityLabel="Amount in SOL" value={amount} onChangeText={value => setAmount(value.replace(',', '.'))} placeholder="0" placeholderTextColor={props.palette.muted} keyboardType="decimal-pad" autoCorrect={false} editable={!props.busy} style={styles.amountInput} /></View><Text style={styles.helper}>{amount && !amountValid ? 'Enter a valid amount within the available balance, up to 9 decimals.' : stage === 'stake' ? 'Leave SOL for network fees and the stake account deposit. You will review the exact amounts before confirming.' : 'The account balance may include SOL that is still staked. Withdrawal availability is checked before review.'}</Text>
      {stage === 'stake' ? <><Text style={[styles.helper, { marginTop: 20 }]}>Validator</Text><Pressable accessibilityRole="button" accessibilityLabel="Choose a validator" onPress={() => { setSearch(''); setPickerOpen(true); }} style={styles.validatorTrigger} disabled={props.busy}>{avatar(nameFor(validators, vote || null))}<View style={styles.flex}><Text style={styles.body}>{vote ? nameFor(validators, vote) : 'Choose a validator'}</Text><Text style={styles.helper}>{validator ? `${validator.commission}% commission` : 'Search name or vote account'}</Text></View><Feather name="chevron-down" size={19} color={props.palette.muted} /></Pressable>{validator ? <View style={styles.facts}>{fact('Validator commission', `${validator.commission}%`)}{fact('Total validator stake', maskSol(validator.activatedStakeLamports))}</View> : null}<Pressable accessibilityRole="button" accessibilityState={{ expanded: manual }} onPress={() => setManual(!manual)} style={styles.manualToggle}><Text style={styles.helper}>Use a validator vote address</Text><Feather name={manual ? 'chevron-up' : 'chevron-down'} size={15} color={props.palette.muted} /></Pressable>{manual ? <TextInput accessibilityLabel="Validator vote address" placeholder="Paste vote account address" placeholderTextColor={props.palette.muted} value={vote} onChangeText={setVote} autoCapitalize="none" autoCorrect={false} editable={!props.busy} style={styles.manualInput} /> : null}</> : null}
      <View style={styles.composeFooter}><Text style={styles.helper}>{stage === 'stake' ? 'You keep control of your stake account. Review your selection before authorizing.' : 'Available SOL will be sent back to this wallet.'}</Text>{button(stage === 'stake' ? 'Review stake' : 'Review withdrawal', () => { if (stage === 'stake') review({ action: 'stake', amount, voteAccount: vote }); else if (account) review({ action: 'withdraw', amount, stakeAccount: account.address }); }, !amountValid || (stage === 'stake' ? !vote.trim() : !canWithdraw))}</View>
    </View> : null}

    <SelectionSheet visible={pickerOpen} onDismiss={() => setPickerOpen(false)} onClosed={() => {}} background={props.palette.bg} color={props.palette.text} muted={props.palette.muted} reduceMotion={props.reduceMotion} horizontalMargin={width >= 760 ? Math.max(24, (width - 560) / 2) : undefined}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Choose a validator</Text><SheetSearchInput accessibilityLabel="Search validators" placeholder="Search name or vote address" placeholderTextColor={props.palette.muted} value={search} onChangeText={setSearch} color={props.palette.text} borderColor={props.palette.panelBorder} /><BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
      {validatorsLoading ? <ActivityIndicator color={props.palette.grape} /> : null}
      {visibleValidators.map(item => <Pressable accessibilityRole="button" accessibilityState={{ selected: item.voteAccount === vote }} key={item.voteAccount} style={styles.accountRow} onPress={() => { setVote(item.voteAccount); setPickerOpen(false); }}>{avatar(nameFor(validators, item.voteAccount))}<View style={styles.flex}><Text style={styles.body}>{nameFor(validators, item.voteAccount)}</Text><Text style={styles.helper}>{item.commission}% commission · {short(item.voteAccount)}</Text></View><Feather name={item.voteAccount === vote ? 'check' : 'chevron-right'} size={19} color={props.palette.muted} /></Pressable>)}
      {!validatorsLoading && !visibleValidators.length ? <Text style={styles.helper}>{search ? 'No matching validators. Try a vote address.' : 'Validators could not be loaded. Refresh staking, or enter a vote address manually.'}</Text> : null}
      </BottomSheetScrollView>
    </SelectionSheet>
  </View>;
}
function LearnRow({ question, answer, palette }: { question: string; answer: string; palette: MobileThemePalette }) {
  const [open, setOpen] = useState(false);
  return <View><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: palette.text, flex: 1, fontSize: 14 }}>{question}</Text><Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={palette.muted} /></Pressable>{open ? <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 20 }}>{answer}</Text> : null}</View>;
}
const createStyles = (palette: MobileThemePalette) => StyleSheet.create({
  root: { gap: 24, paddingBottom: 16 }, topbar: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { color: palette.text, fontSize: 22, fontWeight: '700', flex: 1 }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 }, stack: { gap: 20 }, columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 }, inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24, paddingVertical: 8 }, balance: { gap: 8, maxWidth: '100%' }, eyebrow: { color: palette.muted, fontSize: 11, letterSpacing: .8, fontWeight: '600' }, balanceValue: { color: palette.text, fontSize: 38, fontWeight: '700', letterSpacing: -1.2 }, balanceSol: { color: palette.muted, fontSize: 18 },
  action: { minHeight: 48, borderRadius: 30, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' }, primary: { backgroundColor: palette.primaryButton }, secondary: { backgroundColor: palette.frost, borderWidth: 1, borderColor: palette.panelBorder }, actionText: { fontSize: 15, fontWeight: '700' }, disabled: { opacity: .45 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }, sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '700' }, body: { color: palette.text, fontSize: 15, fontWeight: '600' }, helper: { color: palette.muted, fontSize: 12, lineHeight: 19 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.frost, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: palette.grape, fontSize: 21, fontWeight: '700' }, badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' }, badgeText: { fontSize: 11 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.panelBorder }, accountCopy: { flex: 1, minWidth: 0, gap: 8 }, accountName: { color: palette.text, fontSize: 14, fontWeight: '600' }, accountMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }, accountAddress: { color: palette.muted, fontSize: 10 }, accountValue: { width: '32%', alignItems: 'flex-end', gap: 6 },
  learn: { backgroundColor: palette.panel, borderRadius: 20, padding: 20, gap: 12 }, warning: { backgroundColor: palette.frost, padding: 14, borderRadius: 14, gap: 10 }, empty: { paddingVertical: 36, paddingHorizontal: 20, alignItems: 'center', gap: 14 },
  detailHero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginVertical: 12 }, validatorCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: palette.panel, borderRadius: 18, marginTop: 20 }, facts: { gap: 18, marginVertical: 24 }, fact: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }, factValue: { color: palette.text, fontSize: 13, textAlign: 'right', flexShrink: 1 },
  compose: { alignSelf: 'center', width: '100%', maxWidth: 560, gap: 14 }, amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: palette.panelBorder, borderRadius: 16, padding: 16, minHeight: 76 }, solAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: palette.frost, alignItems: 'center', justifyContent: 'center' }, amountInput: { flex: 1, minWidth: 0, textAlign: 'right', fontSize: 28, color: palette.text, padding: 0 }, available: { fontSize: 11, color: palette.muted, flexShrink: 1, textAlign: 'right' }, validatorTrigger: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: palette.panelBorder, borderRadius: 16, padding: 16 }, manualToggle: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44 }, manualInput: { minHeight: 52, padding: 14, borderWidth: 1, borderColor: palette.panelBorder, borderRadius: 12, color: palette.text, fontSize: 14 }, composeFooter: { marginTop: 32, gap: 14 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 12 }, error: { color: palette.danger, fontSize: 13, lineHeight: 20 }, submitted: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: palette.frost, padding: 16, borderRadius: 14 }
});
