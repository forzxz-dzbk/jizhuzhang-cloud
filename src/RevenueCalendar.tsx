import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from './supabase';
import { shanghaiToday } from './shanghai-time.mjs';

type RevenueDay = { revenue_date: string; revenue: number; goal_enabled: boolean; goal_amount: number | null; goal_reached: boolean; has_revenue_record: boolean };
const shiftMonth = (month: string, delta: number) => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
};

export function RevenueCalendar({ ledgerId }: { ledgerId: string }) {
  const [month, setMonth] = useState(() => shanghaiToday().slice(0, 7));
  const [days, setDays] = useState<RevenueDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const today = shanghaiToday();
  const [goalEnabled, setGoalEnabled] = useState(false);
  const [targetAmount, setTargetAmount] = useState('500');
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalNotice, setGoalNotice] = useState('');

  const loadGoalSetting = useCallback(async () => {
    if (!supabase) return;
    const { data, error: queryError } = await supabase.from('business_daily_goal_settings')
      .select('effective_on,enabled,target_amount').eq('ledger_id', ledgerId)
      .lte('effective_on', today).order('effective_on', { ascending: false }).limit(1).maybeSingle();
    if (queryError) setError(`每日目标设置读取失败：${queryError.message}`);
    else if (data) { setGoalEnabled(data.enabled); setTargetAmount(String(data.target_amount)); }
    else { setGoalEnabled(false); setTargetAmount('500'); }
  }, [ledgerId, today]);

  useEffect(() => { void loadGoalSetting(); }, [loadGoalSetting]);

  async function saveGoalSetting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const amount = Number(targetAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount >= 1_000_000_000_000 || Math.round(amount * 100) !== amount * 100) {
      setError('每日目标金额必须大于 0，最多两位小数。'); return;
    }
    setSavingGoal(true); setError(''); setGoalNotice('');
    const { error: saveError } = await supabase.from('business_daily_goal_settings').upsert({
      ledger_id: ledgerId, effective_on: today, enabled: goalEnabled, target_amount: amount,
    }, { onConflict: 'ledger_id,effective_on' });
    if (saveError) setError(`每日目标保存失败：${saveError.message}`);
    else { setError(''); setGoalNotice('目标已保存，从今天起生效；过往日期保持原记录。'); await refresh(); }
    setSavingGoal(false);
  }

  const refresh=useCallback(async()=>{
    if (!supabase) return;
    const from = `${month}-01`;
    const [year, monthNumber] = month.split('-').map(Number);
    const to = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    setLoading(true); setError('');
    const {data,error:queryError}=await supabase.from('business_daily_revenue').select('revenue_date,revenue,goal_enabled,goal_amount,goal_reached,has_revenue_record')
      .eq('ledger_id', ledgerId).gte('revenue_date', from).lte('revenue_date', to).order('revenue_date')
    if(queryError)setError(`营收日历读取失败：${queryError.message}`);else setDays((data??[]) as RevenueDay[]);setLoading(false);
  },[ledgerId,month]);
  useEffect(()=>{void refresh();const client=supabase;if(!client)return;
    const channel=client.channel(`revenue-${ledgerId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'transactions',filter:`ledger_id=eq.${ledgerId}`},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'business_daily_goal_settings',filter:`ledger_id=eq.${ledgerId}`},()=>{void loadGoalSetting();void refresh();})
      .subscribe();
    return()=>{void client.removeChannel(channel);};
  },[ledgerId,loadGoalSetting,refresh]);

  const map = new Map(days.map(day => [day.revenue_date, day]));
  const valid = days.filter(day => day.has_revenue_record && day.goal_enabled);
  const reached = valid.filter(day => day.goal_reached).length;
  const total = days.reduce((sum, day) => sum + Number(day.revenue), 0);
  const todayEntry = map.get(today);
  const [year, monthNumber] = month.split('-').map(Number);
  const monthLength = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const mondayOffset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const cells: Array<number | null> = [...Array.from({ length: mondayOffset }, () => null), ...Array.from({ length: monthLength }, (_, i) => i + 1)];
  const label = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long' }).format(new Date(`${month}-01T00:00:00+08:00`));

  return <section className="panel revenue-panel">
    <div className="revenue-head"><div><h2>每日收入目标（可选）</h2><p>只统计本收入账本实际到账，退款按发生日冲减；新目标从今天起生效，过往日期保持原记录。</p></div></div>
    <form className="revenue-goal-settings" onSubmit={event => void saveGoalSetting(event)}>
      <label className="goal-toggle"><input type="checkbox" checked={goalEnabled} onChange={event => setGoalEnabled(event.target.checked)} /> 开启每日目标</label>
      <label>每日目标（CNY）<input type="number" min="0.01" step="0.01" value={targetAmount} onChange={event => setTargetAmount(event.target.value)} disabled={!goalEnabled} required={goalEnabled} /></label>
      <button disabled={savingGoal}>{savingGoal ? '保存中…' : '保存目标设置'}</button>
    </form>
    {goalNotice && <p className="notice" role="status">{goalNotice}</p>}
    {!goalEnabled && <p className="empty">每日目标已关闭；开启并保存后，将显示达标日历和月度统计。</p>}
    {goalEnabled && <>
    <div className="revenue-head"><div><h3>收入营收目标日历</h3><p>目标 ¥{Number(targetAmount).toFixed(2)}/日</p></div><div className="month-nav"><button className="secondary" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上个月">‹</button><strong>{label}</strong><button className="secondary" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下个月">›</button></div></div>
    {todayEntry?.has_revenue_record ? <p className={todayEntry.goal_reached ? 'goal-hit' : 'goal-miss'}>今日实际到账 ¥{Number(todayEntry.revenue).toFixed(2)} · {todayEntry.goal_reached ? '已达标' : '未达标'}</p> : <p>今日：未开张</p>}
    <div className="month-summary"><span>本月营收 <strong>¥{total.toFixed(2)}</strong></span><span>达标天数 <strong>{reached}</strong></span><span>有效营收日 <strong>{valid.length}</strong></span></div>
    {loading && <p role="status">读取营收日历…</p>}
    {!loading && !error && <div className="calendar-grid" role="grid" aria-label={`${label}营收日历`}>
      {['一','二','三','四','五','六','日'].map((day,i)=><strong className="weekday" key={i}>{day}</strong>)}
      {cells.map((number,index) => {
        if (!number) return <span className="calendar-cell blank" key={`blank-${index}`} />;
        const date = `${month}-${String(number).padStart(2,'0')}`;
        const entry = map.get(date);
        return <div className={`calendar-cell ${date===today?'today':''} ${entry?.goal_reached?'hit':''}`} key={date}>
          <strong>{number}</strong>{entry ? <><span>¥{Number(entry.revenue).toFixed(0)}</span><small>{entry.has_revenue_record ? entry.goal_enabled ? `${entry.goal_reached ? '达标' : '未达标'} · 目标 ¥${Number(entry.goal_amount).toFixed(0)}` : '目标未开启' : '未开张'}</small></> : <small>未开张</small>}
        </div>;
      })}
    </div>}
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
