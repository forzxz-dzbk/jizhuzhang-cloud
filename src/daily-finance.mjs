const cents = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('财务汇总金额无效。');
  return Math.round(amount * 100);
};

export function summarizeDay(rows, day) {
  const result = rows.reduce((sum, row) => {
    if (row.occurred_on !== day) return sum;
    sum.income += cents(row.income);
    sum.expense += cents(row.expense);
    return sum;
  }, { income: 0, expense: 0, surplus: 0 });
  result.surplus = result.income - result.expense;
  return result;
}

export function sumMonthlyRows(rows) {
  const result = rows.reduce((sum, row) => {
    sum.income += cents(row.income);
    sum.expense += cents(row.expense);
    return sum;
  }, { income: 0, expense: 0, surplus: 0 });
  result.surplus = result.income - result.expense;
  return result;
}

export function formatCents(centsAmount) {
  return `¥${(centsAmount / 100).toFixed(2)}`;
}
