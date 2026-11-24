import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { formatCents, summarizeYear } from './daily-finance.mjs';

type Row = { occurred_on: string; income: number | string; expense: number | string };
const currentShanghaiYear = () => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(new Date()));

export function AnnualReport({ ledgerId }: { ledgerId: string }) {
  const [year, setYear] = useState(currentShanghaiYear);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const refresh = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase.from('transaction_totals')
      .select('occurred_on,income,expense').eq('ledger_id', ledgerId)
      .gte('occurred_on', from).lte('occurred_on', to);
    if (queryError) setError(`年度回顾读取失败：${queryError.message}`);
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [ledgerId, from, to]);
  useEffect(() => {
    void refresh();
    const client = supabase;
    if (!client) return;
    const channel = client.channel(`annual-report-${ledgerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `ledger_id=eq.${ledgerId}` }, () => void refresh())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [ledgerId, refresh]);
  const summary = useMemo(() => summarizeYear(rows, year), [rows, year]);
  const maxMonthly = Math.max(1, ...summary.months.flatMap(month => [month.income, month.expense]));
  const currentYear = currentShanghaiYear();

  return <section className="annual-report" aria-label="年度回顾">
    <header className="annual-report-heading">
      <div><h2>年度回顾</h2><p>仅统计当前账本的已记账流水；不含内部转账和待确认固定支出。</p></div>
      <label>年份<select aria-label="年度回顾年份" value={year} onChange={event => setYear(Number(event.target.value))}>
        {Array.from({ length: 5 }, (_, index) => currentYear - index).map(option => <option key={option} value={option}>{option} 年</option>)}
      </select></label>
    </header>
    <div className="annual-report-totals">
      <article><span>{year} 年收入</span><strong>{formatCents(summary.income)}</strong></article>
      <article><span>{year} 年支出 / 退款</span><strong>{formatCents(summary.expense)}</strong></article>
      <article><span>{year} 年结余</span><strong>{formatCents(summary.surplus)}</strong></article>
    </div>
    {loading && <p role="status">正在读取所选账本年度流水…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && rows.length === 0 && <p>该年度暂无真实流水。</p>}
    {!loading && !error && rows.length > 0 && <ol className="annual-month-list">
      {summary.months.map(month => <li key={month.month}>
        <strong>{Number(month.month.slice(5))} 月</strong>
        <div className="annual-month-bars" aria-label={`${month.month}收入与支出`}>
          <span className="annual-income-bar" style={{ width: `${month.income / maxMonthly * 100}%` }} />
          <span className="annual-expense-bar" style={{ width: `${month.expense / maxMonthly * 100}%` }} />
        </div>
        <small>收入 {formatCents(month.income)} · 支出 {formatCents(month.expense)} · 结余 {formatCents(month.surplus)}</small>
      </li>)}
    </ol>}
  </section>;
}
