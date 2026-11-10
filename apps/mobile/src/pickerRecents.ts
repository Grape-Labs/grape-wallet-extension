export type PickerRecents = Record<string, string[]>;
export function rememberPickerSelection(recents: PickerRecents, scope: string, id: string): PickerRecents {
  return { ...recents, [scope]: [id, ...(recents[scope] ?? []).filter((item) => item !== id)].slice(0, 8) };
}
export function prioritizeRecent<T>(items: readonly T[], ids: readonly string[], getId: (item: T) => string): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (rank.get(getId(a)) ?? ids.length) - (rank.get(getId(b)) ?? ids.length));
}
export function parsePickerRecents(raw: string | null): PickerRecents {
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).slice(0, 100).filter(([key, value]) => key.length < 256 && Array.isArray(value))
      .map(([key, value]) => [key, [...new Set((value as unknown[]).filter((id): id is string => typeof id === 'string' && id.length < 256))].slice(0, 8)]));
  } catch { return {}; }
}
