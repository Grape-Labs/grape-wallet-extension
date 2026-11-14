import { getExactSendRatio } from './sendAmount';

/** Percentages use holdings; only native Max needs an executable route's gas budget. */
export async function getSwapShortcutAmount(input: {
  ratio: number; decimals: number; native: boolean;
  readBalance: () => Promise<string>; readMaximum: () => Promise<string>;
}): Promise<string> {
  const percent = new Map<number, 25 | 50 | 75 | 100>([[0.25, 25], [0.5, 50], [0.75, 75], [1, 100]]).get(input.ratio);
  if (!percent) throw new Error('Choose a supported balance percentage.');
  const amount = input.native && percent === 100 ? await input.readMaximum() : await input.readBalance();
  return getExactSendRatio(amount, input.decimals, percent);
}
