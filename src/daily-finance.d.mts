export type FinanceRow = { occurred_on: string; income: number | string; expense: number | string };
export type FinanceTotals = { income: number; expense: number; surplus: number };
export type YearMonthTotals = FinanceTotals & { month: string };
export type YearTotals = FinanceTotals & { months: YearMonthTotals[] };
export function summarizeDay(rows: FinanceRow[], day: string): FinanceTotals;
export function sumMonthlyRows(rows: FinanceRow[]): FinanceTotals;
export function summarizeYear(rows: FinanceRow[], year: number): YearTotals;
export function formatCents(centsAmount: number): string;
