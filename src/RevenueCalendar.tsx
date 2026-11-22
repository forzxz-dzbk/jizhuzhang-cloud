import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

type RevenueDay = { revenue_date: string; revenue: number; goal_reached: boolean; has_revenue_record: boolean };
const todayShanghai = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const shiftMonth = (month: string, delta: number) => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
};

export function RevenueCalendar({ ledgerId }: { ledgerId: string }) {
  const [month, setMonth] = useState(todayShanghai().slice(0, 7));
  const [days, setDays] = useState<RevenueDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const today = todayShanghai();

  const refresh=useCallback(async()=>{
    if (!supabase) return;
    const from = `${month}-01`;
    const [year, monthNumber] = month.split('-').map(Number);
    const to = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    setLoading(true); setError('');
    const {data,error:queryError}=await supabase.from('business_daily_revenue').select('revenue_date,revenue,goal_reached,has_revenue_record')
      .eq('ledger_id', ledgerId).gte('revenue_date', from).lte('revenue_date', to).order('revenue_date')
    if(queryError)setError(`营收日历读取失败：${queryError.message}`);else setDays((data??[]) as RevenueDay[]);setLoading(false);
  },[ledgerId,month]);
  useEffect(()=>{void refresh();const client=supabase;if(!client)return;
    const channel=client.channel(`revenue-${ledgerId}`).on('postgres_changes',{event:'*',schema:'public',table:'transactions',filter:`ledger_id=eq.${ledgerId}`},()=>void refresh()).subscribe();
    return()=>{void client.removeChannel(channel);};
  },[ledgerId,refresh]);

  const map = new Map(days.map(day => [day.revenue_date, day]));
  const valid = days.filter(day => day.has_revenue_record);
  const reached = valid.filter(day => day.goal_reached).length;
  const total = days.reduce((sum, day) => sum + Number(day.revenue), 0);
  const todayEntry = map.get(today);
  const [year, monthNumber] = month.split('-').map(Number);
  const monthLength = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const mondayOffset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const cells: Array<number | null> = [...Array.from({ length: mondayOffset }, () => null), ...Array.from({ length: monthLength }, (_, i) => i + 1)];
  const label = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long' }).format(new Date(`${month}-01T00:00:00+08:00`));

  return <section className="panel revenue-panel">
    <div className="revenue-head"><div><h2>Mac 业务营收目标</h2><p>目标 ¥500/日 · 按实际到账日期 · 退款按发生日冲减</p></div><div className="month-nav"><button className="secondary" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上个月">‹</button><strong>{label}</strong><button className="secondary" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下个月">›</button></div></div>
    {todayEntry?.has_revenue_record ? <p className={todayEntry.goal_reached ? 'goal-hit' : 'goal-miss'}>今日营收 ¥{Number(todayEntry.revenue).toFixed(2)} · {todayEntry.goal_reached ? '已达标' : '未达标'}</p> : <p>今日：未开张</p>}
    <div className="month-summary"><span>本月营收 <strong>¥{total.toFixed(2)}</strong></span><span>达标天数 <strong>{reached}</strong></span><span>有效营收日 <strong>{valid.length}</strong></span></div>
    {loading && <p role="status">读取营收日历…</p>}{error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && <div className="calendar-grid" role="grid" aria-label={`${label}营收日历`}>
      {['一','二','三','四','五','六','日'].map((day,i)=><strong className="weekday" key={i}>{day}</strong>)}
      {cells.map((number,index) => {
        if (!number) return <span className="calendar-cell blank" key={`blank-${index}`} />;
        const date = `${month}-${String(number).padStart(2,'0')}`;
        const entry = map.get(date);
        return <div className={`calendar-cell ${date===today?'today':''} ${entry?.goal_reached?'hit':''}`} key={date}>
          <strong>{number}</strong>{entry ? <><span>¥{Number(entry.revenue).toFixed(0)}</span><small>{entry.has_revenue_record ? entry.goal_reached ? '达标' : '未达标' : '未开张'}</small></> : <small>未开张</small>}
        </div>;
      })}
    </div>}
  </section>;
}
