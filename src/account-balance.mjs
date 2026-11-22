function cents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('账户或流水金额不是有效数字。');
  return Math.round(amount * 100);
}

export function calculateAccountBalances(accounts, transactions) {
  const balances = new Map(accounts.map(account => [account.id, cents(account.opening_balance)]));
  for (const transaction of transactions) {
    const amount = cents(transaction.amount);
    const accountId = transaction.account_id;
    if (transaction.type === 'income') balances.set(accountId, (balances.get(accountId) ?? 0) + amount);
    else if (transaction.type === 'expense' || transaction.type === 'refund') balances.set(accountId, (balances.get(accountId) ?? 0) - amount);
    else if (transaction.type === 'transfer') {
      balances.set(accountId, (balances.get(accountId) ?? 0) - amount);
      if (transaction.transfer_account_id) {
        balances.set(transaction.transfer_account_id, (balances.get(transaction.transfer_account_id) ?? 0) + amount);
      }
    }
  }
  return balances;
}
