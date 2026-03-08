import type { CollectionHolding, TokenHolding } from './models';

function tokenNumericAmount(token: TokenHolding): number {
  const amount = Number(token.amount);
  return Number.isFinite(amount) ? amount : 0;
}

function tokenUsdValue(token: TokenHolding): number | null {
  return typeof token.valueUsd === 'number' && Number.isFinite(token.valueUsd) ? token.valueUsd : null;
}

function tokenHasPrice(token: TokenHolding): boolean {
  return typeof token.priceUsd === 'number' && Number.isFinite(token.priceUsd);
}

export function getCollectibleMints(collections?: CollectionHolding[]): Set<string> {
  return new Set(
    (collections ?? [])
      .flatMap((collection) => collection.items)
      .map((item) => item.mint)
      .filter(Boolean)
  );
}

export function filterCollectibleTokens(tokens: TokenHolding[], collections?: CollectionHolding[]): TokenHolding[] {
  const collectibleMints = getCollectibleMints(collections);
  if (collectibleMints.size === 0) {
    return tokens;
  }

  return tokens.filter((token) => !collectibleMints.has(token.mint));
}

export function sortWalletTokens(tokens: TokenHolding[]): TokenHolding[] {
  return [...tokens].sort((left, right) => {
    const leftHasPrice = tokenHasPrice(left);
    const rightHasPrice = tokenHasPrice(right);

    if (leftHasPrice !== rightHasPrice) {
      return leftHasPrice ? -1 : 1;
    }

    const leftValue = tokenUsdValue(left);
    const rightValue = tokenUsdValue(right);
    if (leftValue !== null || rightValue !== null) {
      return (rightValue ?? -Infinity) - (leftValue ?? -Infinity);
    }

    const amountDelta = tokenNumericAmount(right) - tokenNumericAmount(left);
    if (amountDelta !== 0) {
      return amountDelta;
    }

    return (left.symbol ?? left.name ?? left.mint).localeCompare(right.symbol ?? right.name ?? right.mint);
  });
}
