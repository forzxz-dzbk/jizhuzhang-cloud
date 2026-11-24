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

export function summarizeYear(rows, year) {
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: `${year}-${String(index + 1).padStart(2, '0')}`,
    income: 0,
    expense: 0,
    surplus: 0,
  }));
  for (const row of rows) {
    if (!row.occurred_on.startsWith(`${year}-`)) continue;
    const month = months[Number(row.occurred_on.slice(5, 7)) - 1];
    if (!month) continue;
    month.income += cents(row.income);
    month.expense += cents(row.expense);
  }
  const totals = months.reduce((sum, month) => ({
    income: sum.income + month.income,
    expense: sum.expense + month.expense,
  }), { income: 0, expense: 0 });
  for (const month of months) month.surplus = month.income - month.expense;
  return { ...totals, surplus: totals.income - totals.expense, months };
}

export function formatCents(centsAmount) {
  return `¥${(centsAmount / 100).toFixed(2)}`;
}
