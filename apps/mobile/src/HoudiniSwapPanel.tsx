import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Linking, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HoudiniClient, privateSendCost, depositProblem, depositAmount, findOpenPrivateSend, matchingAsset, orderIsOpen, orderStatus, type HoudiniAsset, type HoudiniOrder } from '../../../packages/houdini/src/client';
export function HoudiniSwapPanel({ endpoint, owner, assets, color, muted, border, onFund, onBack, onUsePublic, privateSend, bridge }: { endpoint: string; owner: string; assets: HoudiniAsset[]; color: string; muted: string; border: string; onFund(asset: HoudiniAsset, entry: HoudiniOrder): void; onBack(): void; onUsePublic?: () => void; privateSend?: { asset: HoudiniAsset; amount: string; recipient: string }; bridge?: { asset: HoudiniAsset; recipient: string; toSymbol: string; toChain: string } }) {
  const client = useMemo(() => new HoudiniClient(endpoint, owner, AsyncStorage, privateSend ? 'private' : 'standard'), [endpoint, owner, !!privateSend]);
  const [state, setState] = useState(client.state);
  const [term, setTerm] = useState('');
  const [side, setSide] = useState<'from' | 'to'>('from');
  const loadPrivateQuote = async () => { if (!privateSend) return; await client.preparePrivateSend(privateSend.asset, privateSend.amount, privateSend.recipient); await client.quote(); };
  useEffect(() => { setState(client.state); const unsubscribe = client.subscribe(() => setState(client.state)); void client.start().then(async () => { if (privateSend && !findOpenPrivateSend(client.state.orders, privateSend.asset, privateSend.amount, privateSend.recipient)) await loadPrivateQuote(); else if (bridge) await client.prepareCrossChain(bridge.asset, { symbol: bridge.toSymbol, chain: bridge.toChain }, bridge.recipient); }); return () => { unsubscribe(); client.stop(); }; }, [client, bridge?.asset.id, bridge?.recipient, bridge?.toChain, bridge?.toSymbol]);
  const visibleOrders = state.orders.filter(entry => privateSend ? entry.mode === 'private' && orderIsOpen(entry) : bridge ? entry.mode !== 'private' && entry.to.symbol.toLowerCase() === bridge.toSymbol.toLowerCase() && entry.to.chainData.shortName.toLowerCase() === bridge.toChain.toLowerCase() : true);
  const existingPrivateSend = privateSend ? findOpenPrivateSend(state.orders, privateSend.asset, privateSend.amount, privateSend.recipient) : undefined;
  const label = (value: string, subtle = false) => <Text selectable style={{ color: subtle ? muted : color, fontSize: subtle ? 12 : 15 }}>{value}</Text>;
  const action = (title: string, fn: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled || state.busy} onPress={fn} style={[styles.button, { borderColor: border, opacity: disabled || state.busy ? .45 : 1 }]}>{label(title)}</Pressable>;
  const input = (title: string, value: string, onChangeText: (text: string) => void, decimal = false) => <View style={styles.stack}>{label(title)}<TextInput accessibilityLabel={title} editable={!state.busy} value={value} onChangeText={onChangeText} autoCapitalize="none" autoCorrect={false} keyboardType={decimal ? 'decimal-pad' : 'default'} style={[styles.input, { color, borderColor: border }]} /></View>;
  return <View style={styles.stack}>
    <View style={styles.header}>{action('←', onBack)}<Text style={{ color, fontSize: 21, fontWeight: '700' }}>{privateSend ? 'Private send' : bridge ? `Bridge to ${bridge.toSymbol}` : 'Houdini swap'}</Text></View>
    {label(privateSend ? 'Houdini routes the same token through exchange partners to reduce the on-chain link to your wallet. Privacy is not guaranteed.' : bridge ? `Convert ${bridge.asset.symbol} and deliver native ${bridge.toSymbol} through a one-time deposit order.` : 'Swap through an exchange partner using a one-time deposit. No contract approvals.', true)}
    {privateSend ? <View style={[styles.summary, { borderColor: border }]}><View style={styles.summaryItem}>{label('You send', true)}{label(privateSend.amount + ' ' + privateSend.asset.symbol)}</View><View style={styles.summaryItem}>{label('Recipient', true)}{label(privateSend.recipient, true)}</View></View> : null}
    {existingPrivateSend ? <View style={[styles.notice, { borderColor: border }]}>{label('An active order already exists for this send. Continue with it below.')}</View> : null}
    {!privateSend && !bridge ? <>
    {action('From: ' + (state.from ? state.from.symbol + ' · ' + state.from.chainData.name : 'Choose token'), () => setSide('from'))}
    {action('To: ' + (state.to ? state.to.symbol + ' · ' + state.to.chainData.name : 'Choose token'), () => setSide('to'))}
    {input('Find ' + (side === 'from' ? 'input' : 'output') + ' token', term, setTerm)}
    {action('Search', () => void client.search(term), !term.trim())}
    {state.results.filter(token => side === 'to' || matchingAsset(token, assets)).map(token => <View key={token.id}>{action(token.symbol + ' · ' + token.chainData.name + '\n' + (token.address || 'Native token'), () => { client.change({ [side]: token }); setTerm(''); })}</View>)}
    {label('Input tokens must be held by this wallet. Networks requiring memos are not available yet.', true)}
    {input('Amount', state.amount, amount => client.change({ amount }), true)}
    {input('Receiving address on ' + (state.to?.chainData.name ?? 'destination network'), state.recipient, recipient => client.change({ recipient }))}
    {state.to && assets.some(a => a.chain === state.to?.chainData.shortName) ? action('Use this wallet', () => client.change({ recipient: owner })) : null}
    </> : null}
    {bridge ? <View style={[styles.bridgeSummary, { borderColor: border }]}><View style={styles.bridgePair}><View>{label('You send', true)}{label(bridge.asset.symbol)}</View><Text style={{ color: muted, fontSize: 18 }}>↓</Text><View>{label('You receive', true)}{label(bridge.toSymbol)}</View></View>{input(`Amount in ${bridge.asset.symbol}`, state.amount, amount => client.change({ amount }), true)}<View>{label('Destination', true)}<Text numberOfLines={1} selectable style={{ color, fontSize: 14 }}>{bridge.recipient}</Text></View>{label('You will review and fund a one-time deposit address before funds move.', true)}</View> : null}
    {!privateSend || state.error ? action(state.busy ? 'Finding route…' : state.error && privateSend ? 'Try again' : bridge ? `Review ${bridge.toSymbol} route` : 'Get quotes', () => void (privateSend ? loadPrivateQuote() : client.quote()), !state.ready || (!privateSend && (!state.from || !state.to || !state.amount || !state.recipient))) : state.busy ? label('Finding the best private route…', true) : null}
    {state.error ? <View style={styles.stack}><Text accessibilityRole="alert" style={{ color: '#ff9988' }}>{state.error}</Text>{privateSend && onUsePublic ? action('Use Public send', onUsePublic) : null}</View> : null}
    {state.quotes.map(quote => <View key={quote.quoteId} style={[styles.card, { borderColor: border }]}>
      {label('Recipient gets approximately ' + quote.amountOut + ' ' + state.to?.symbol)}{privateSend && privateSendCost(state.amount, quote.amountOut) !== null ? label('Estimated route cost: ' + privateSendCost(state.amount, quote.amountOut) + ' ' + state.from?.symbol, true) : null}{label(quote.provider + (quote.duration ? ' · about ' + quote.duration + ' min' : ''), true)}
      {label('Provider fees are reflected in the quote. Deposit network fees are additional. Floating output may change.', true)}
      {label('To: ' + state.recipient, true)}{action(privateSend ? 'Create private send order' : bridge ? 'Create deposit order' : 'Create swap order', () => void client.create(quote))}
    </View>)}
    {visibleOrders.length ? label(privateSend ? 'Active Houdini order' : bridge ? `Active ${bridge.toSymbol} route` : 'Your Houdini orders') : null}
    {!privateSend && !visibleOrders.length ? label('Orders remain available here when you reopen Swap.', true) : null}
    {visibleOrders.map(entry => <View key={entry.order.houdiniId} style={[styles.card, { borderColor: border }]}>
      {label((entry.mode === 'private' ? 'Private send · ' : 'Standard swap · ') + entry.from.symbol + ' → ' + entry.to.symbol + ' · ' + orderStatus(entry.order.status))}
      {label('Send exactly ' + depositAmount(entry) + ' ' + entry.from.symbol + ' on ' + entry.from.chainData.name)}
      {label('Deposit: ' + (entry.order.depositAddress || 'Preparing…'), true)}
      {entry.order.depositTag ? label('Required memo: ' + entry.order.depositTag) : null}
      {label('Recipient: ' + entry.recipient, true)}{label('Output: ' + entry.order.outAmount + ' ' + entry.to.symbol)}
      {label('Deposit expiry: ' + new Date(entry.order.expires).toLocaleString(), true)}{label('Order: ' + entry.order.houdiniId, true)}
      {entry.order.outTransactionOutHash ? label('Delivery transaction: ' + entry.order.outTransactionOutHash, true) : null}
      {entry.order.status === 0 ? <><View style={[styles.notice, { borderColor: border }]}>{label('No funds have moved yet. Deposit exactly ' + depositAmount(entry) + ' ' + entry.from.symbol + ' before expiry to start this private transfer.')}</View>{action('Deposit ' + depositAmount(entry) + ' ' + entry.from.symbol, () => void client.run(async () => {
        const fresh = await client.refresh(entry); const problem = depositProblem(fresh); if (problem) throw new Error(problem);
        const asset = matchingAsset(fresh.from, assets); if (!asset) throw new Error('Switch to the wallet holding the input token.'); onFund(asset, fresh);
      }), !!depositProblem(entry) || !matchingAsset(entry.from, assets))}{depositProblem(entry) ? label(depositProblem(entry)!, true) : null}</> : null}
      {action('Refresh status', () => void client.run(async () => { await client.refresh(entry); }))}
      {action('Houdini support', () => void Linking.openURL('https://houdiniswap.com'))}
    </View>)}
  </View>;
}
const styles = StyleSheet.create({ stack: { gap: 12 }, header: { flexDirection: 'row', alignItems: 'center', gap: 10 }, summary: { flexDirection: 'row', gap: 14, padding: 14, borderWidth: 1, borderRadius: 16 }, summaryItem: { flex: 1, gap: 5, minWidth: 0 }, bridgeSummary: { gap: 14, padding: 16, borderWidth: 1, borderRadius: 20 }, bridgePair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, notice: { padding: 14, borderWidth: 1, borderRadius: 14 }, card: { gap: 12, padding: 16, borderWidth: 1, borderRadius: 16 }, button: { minHeight: 44, padding: 12, borderWidth: 1, borderRadius: 10 }, input: { minHeight: 46, borderWidth: 1, padding: 12, borderRadius: 10 } });
