import { describe, expect, it } from 'vitest';
import { parsePickerRecents, prioritizeRecent, rememberPickerSelection } from './pickerRecents';
describe('picker recent selections', () => {
  it('keeps a selected option first, deduplicates and bounds history', () => {
    const previous = { wallets: Array.from({ length: 8 }, (_, i) => `${i}`) };
    const next = rememberPickerSelection(previous, 'wallets', '4');
    expect(next.wallets).toEqual(['4', '0', '1', '2', '3', '5', '6', '7']);
    expect(rememberPickerSelection(next, 'wallets', 'new').wallets).toHaveLength(8);
    expect(previous.wallets[0]).toBe('0');
  });
  it('separates asset history by account and network scope', () => {
    const next = rememberPickerSelection({ 'assets:solana:a': ['SOL'] }, 'assets:ethereum:b', 'ETH');
    expect(next['assets:solana:a']).toEqual(['SOL']);
    expect(next['assets:ethereum:b']).toEqual(['ETH']);
  });
  it('ignores missing options and preserves the order of non-recent options', () => {
    const options = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(prioritizeRecent(options, ['missing', 'c'], (item) => item.id).map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(options.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
  it('recovers from malformed storage and filters invalid history entries', () => {
    expect(parsePickerRecents('{')).toEqual({});
    expect(parsePickerRecents('[]')).toEqual({});
    expect(parsePickerRecents(JSON.stringify({ wallets: ['a', null, 7, 'a', 'b'], bad: 'not a list' }))).toEqual({ wallets: ['a', 'b'] });
  });
});
