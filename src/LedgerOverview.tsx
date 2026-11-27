import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { formatCents, sumMonthlyRows, summarizeDay } from './daily-finance.mjs';
import { AnnualReport } from './AnnualReport';
import { shanghaiToday } from './shanghai-time.mjs';

type Row = { occurred_on: string; income: number | string; expense: number | string };
export function LedgerOverview({ledgerId}:{ledgerId:string}){
  const [rows,setRows]=useState<Row[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  const [today,setToday]=useState(shanghaiToday);const month=today.slice(0,7);const [year,n]=month.split('-').map(Number);
  const from=`${month}-01`;const to=new Date(Date.UTC(year,n,0)).toISOString().slice(0,10);
  const refresh=useCallback(async()=>{if(!supabase)return;setLoading(true);setError('');
    const {data,error:e}=await supabase.from('transaction_totals').select('occurred_on,income,expense').eq('ledger_id',ledgerId).gte('occurred_on',from).lte('occurred_on',to);
    if(e)setError(`本月概览读取失败：${e.message}`);else setRows((data??[]) as Row[]);setLoading(false);
  },[ledgerId,from,to]);
  useEffect(()=>{const timer=window.setInterval(()=>{const current=shanghaiToday();setToday(value=>value===current?value:current)},60000);return()=>window.clearInterval(timer)},[]);
  useEffect(()=>{void refresh();const onLocalChange=()=>void refresh();window.addEventListener('jizhuzhang:transactions-changed',onLocalChange);const client=supabase;if(!client)return()=>window.removeEventListener('jizhuzhang:transactions-changed',onLocalChange);
    const channel=client.channel(`overview-${ledgerId}`).on('postgres_changes',{event:'*',schema:'public',table:'transactions',filter:`ledger_id=eq.${ledgerId}`},onLocalChange).subscribe();
    return()=>{window.removeEventListener('jizhuzhang:transactions-changed',onLocalChange);void client.removeChannel(channel);};
  },[ledgerId,refresh]);
  const daily=summarizeDay(rows,today);const monthly=sumMonthlyRows(rows);
  return <div className="overview-stack">
    <section className="overview-grid" aria-label="今日财务小结">
      <h2>今日财务小结 · {today}</h2>
      <article className="daily-net"><span>今日财务小结：收入 − 支出/退款</span><strong>{formatCents(daily.surplus)}</strong></article>
      <article><span>今日实际收入</span><strong>{formatCents(daily.income)}</strong></article>
      <article><span>今日实际支出 / 退款</span><strong>{formatCents(daily.expense)}</strong></article>
      <p>按当前所选账本统计；不含内部转账和待确认固定支出。业务收入按实际记账日展示。</p>
      {loading&&<small role="status">正在读取当前账本实际流水…</small>}{error&&<small className="error" role="alert">{error}</small>}
    </section>
    <section className="overview-grid" aria-label="本月财务概览">
      <h2>{month} · 本月概览</h2>
      <article><span>本月收入</span><strong>{formatCents(monthly.income)}</strong></article>
      <article><span>本月支出 / 退款</span><strong>{formatCents(monthly.expense)}</strong></article>
      <article><span>本月结余</span><strong>{formatCents(monthly.surplus)}</strong></article>
    </section>
    <AnnualReport ledgerId={ledgerId} />
  </div>;
}
