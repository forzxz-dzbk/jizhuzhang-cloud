export type BalanceAccount = { id: string; opening_balance: number | string };
export type BalanceTransaction = {
  type: string;
  amount: number | string;
  account_id: string;
  transfer_account_id: string | null;
};
export function calculateAccountBalances(accounts: BalanceAccount[], transactions: BalanceTransaction[]): Map<string, number>;
