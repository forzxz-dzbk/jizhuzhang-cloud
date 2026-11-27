import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { shanghaiCurrentMonth, shanghaiToday } from './shanghai-time.mjs';

type Day = { occurred_on: string; income: number | string; expense: number | string };
const shiftMonth = (month: string, step: number) => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + step, 1)).toISOString().slice(0, 7);
};

export function TransactionCalendar({ ledgerId }: { ledgerId: string }) {
  const [month, setMonth] = useState(shanghaiCurrentMonth);
  const [days, setDays] = useState<Day[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [year, number] = month.split('-').map(Number);
    const to = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
    setLoading(true); setError('');
    const { data, error: queryError } = await supabase.from('transaction_totals')
      .select('occurred_on,income,expense').eq('ledger_id', ledgerId)
      .gte('occurred_on', `${month}-01`).lte('occurred_on', to).order('occurred_on');
    if (queryError) setError(`收支日历读取失败：${queryError.message}`);
    else setDays((data ?? []) as Day[]);
    setLoading(false);
  }, [ledgerId, month]);
  useEffect(() => {
    void refresh();
    const onLocalChange = () => void refresh();
    window.addEventListener('jizhuzhang:transactions-changed', onLocalChange);
    const client = supabase;
    const channel = client?.channel(`calendar-${ledgerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `ledger_id=eq.${ledgerId}` }, onLocalChange)
      .subscribe();
    return () => {
      window.removeEventListener('jizhuzhang:transactions-changed', onLocalChange);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [ledgerId, refresh]);
  const map = new Map(days.map(day => [day.occurred_on, day]));
  const [year, number] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
  const cells: Array<number | null> = [...Array.from({ length: offset }, () => null), ...Array.from({ length: count }, (_, index) => index + 1)];
  const today = shanghaiToday();
  const label = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long' }).format(new Date(`${month}-01T00:00:00+08:00`));
  return <section className="panel transaction-calendar">
    <div className="revenue-head"><h2>收支日历</h2><div className="month-nav"><button className="secondary" aria-label="上个月" onClick={() => setMonth(value => shiftMonth(value, -1))}>‹</button><strong>{label}</strong><button className="secondary" aria-label="下个月" onClick={() => setMonth(value => shiftMonth(value, 1))}>›</button></div></div>
    {loading && <p role="status">读取收支日历…</p>}{error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && <div className="calendar-grid transaction-calendar-grid" role="grid" aria-label={`${label}收支日历`}>
      {['一','二','三','四','五','六','日'].map((day, index) => <strong className="weekday" key={index}>{day}</strong>)}
      {cells.map((day, index) => {
        if (!day) return <span className="calendar-cell blank" key={`blank-${index}`} />;
        const date = `${month}-${String(day).padStart(2, '0')}`;
        const entry = map.get(date);
        return <div className={`calendar-cell ${date === today ? 'today' : ''} ${entry ? 'has-cashflow' : ''}`} key={date}>
          <strong>{day}</strong>{entry ? <><small className="calendar-income">+{Number(entry.income).toFixed(0)}</small><small className="calendar-expense">−{Number(entry.expense).toFixed(0)}</small></> : <small>—</small>}
        </div>;
      })}
    </div>}
    {!loading && !error && days.length === 0 && <p className="empty">本月暂无真实流水。</p>}
  </section>;
}
