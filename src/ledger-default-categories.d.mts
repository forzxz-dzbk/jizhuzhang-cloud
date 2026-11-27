export type LedgerFlow = 'income' | 'expense';
export type DefaultCategory = Readonly<{ name: string; icon: string }>;
export const DEFAULT_CATEGORIES: Readonly<Record<LedgerFlow, readonly DefaultCategory[]>>;
export function missingDefaultCategories(
  existing: readonly { name: string; flow: LedgerFlow }[],
  flow: LedgerFlow,
): DefaultCategory[];
