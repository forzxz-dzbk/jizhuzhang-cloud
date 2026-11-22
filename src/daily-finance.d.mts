export type FinanceRow = { occurred_on: string; income: number | string; expense: number | string };
export type FinanceTotals = { income: number; expense: number; surplus: number };
export function summarizeDay(rows: FinanceRow[], day: string): FinanceTotals;
export function sumMonthlyRows(rows: FinanceRow[]): FinanceTotals;
export function formatCents(centsAmount: number): string;
