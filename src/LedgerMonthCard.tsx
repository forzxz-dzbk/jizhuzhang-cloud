import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { formatCents, sumMonthlyRows } from './daily-finance.mjs';

type Row = { occurred_on: string; income: number | string; expense: number | string };
const currentMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date());
const shiftMonth = (month: string, step: number) => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + step, 1)).toISOString().slice(0, 7);
};

export function LedgerMonthCard({ ledgerId, kind }: { ledgerId: string; kind: 'personal' | 'business' }) {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [year, number] = month.split('-').map(Number);
    const to = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
    setLoading(true); setError('');
    const { data, error: queryError } = await supabase.from('transaction_totals')
      .select('occurred_on,income,expense').eq('ledger_id', ledgerId)
      .gte('occurred_on', `${month}-01`).lte('occurred_on', to);
    if (queryError) setError(`月度概览读取失败：${queryError.message}`);
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [ledgerId, month]);
  useEffect(() => { void refresh(); }, [refresh]);
  const summary = sumMonthlyRows(rows);
  const label = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long' })
    .format(new Date(`${month}-01T00:00:00+08:00`));
  return <section className="ledger-month-card" aria-label={`${label}账本概览`}>
    <div className="ledger-month-heading">
      <h1>{kind === 'personal' ? '支出' : '收入'}</h1>
      <button className="calendar-link" onClick={() => window.dispatchEvent(new CustomEvent('jizhuzhang:open-stats'))}>收支日历</button>
    </div>
    <div className="month-nav"><button className="month-arrow" aria-label="上个月" onClick={() => setMonth(value => shiftMonth(value, -1))}>‹</button><strong>{label}</strong><button className="month-arrow" aria-label="下个月" onClick={() => setMonth(value => shiftMonth(value, 1))}>›</button></div>
    <article className={`month-hero ${kind === 'personal' ? 'expense-hero' : 'income-hero'}`}>
      <span>{kind === 'personal' ? '本月总支出' : '本月总收入'}</span>
      <strong>{loading ? '…' : formatCents(kind === 'personal' ? summary.expense : summary.income)}</strong>
      <div><span>总收入 {formatCents(summary.income)}</span><span>月结余 {formatCents(summary.surplus)}</span></div>
    </article>
    {!loading && !error && rows.length === 0 && <p className="month-empty">本月暂无数据</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
