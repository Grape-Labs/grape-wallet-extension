export const SUPPORTED_SOLANA_DOMAIN_SUFFIXES = ['.sol', '.skr'] as const;

export type SupportedSolanaDomainSuffix = (typeof SUPPORTED_SOLANA_DOMAIN_SUFFIXES)[number];

export function normalizeRecipientInput(value: string): string {
  return value.trim();
}

export function parseSupportedSolanaRecipientDomain(
  value: string
): { domain: string; suffix: SupportedSolanaDomainSuffix } | null {
  const normalized = normalizeRecipientInput(value).toLowerCase();
  if (!normalized || /\s/.test(normalized) || normalized.includes('..')) {
    return null;
  }

  const suffix = SUPPORTED_SOLANA_DOMAIN_SUFFIXES.find((entry) => normalized.endsWith(entry));
  if (!suffix) {
    return null;
  }

  const label = normalized.slice(0, -suffix.length);
  if (!label || label.startsWith('.') || label.endsWith('.')) {
    return null;
  }

  return { domain: normalized, suffix };
}

export function isSupportedSolanaRecipientDomain(value: string): boolean {
  return parseSupportedSolanaRecipientDomain(value) !== null;
}

export function formatSavedRecipient(value: string): string {
  const normalized = normalizeRecipientInput(value);
  if (!normalized) {
    return '';
  }

  return parseSupportedSolanaRecipientDomain(normalized) ? normalized.toLowerCase() : normalized;
}

export function suggestRecipientLabel(value: string): string {
  const domain = parseSupportedSolanaRecipientDomain(value);
  if (!domain) {
    return '';
  }

  return domain.domain.slice(0, -domain.suffix.length);
}
