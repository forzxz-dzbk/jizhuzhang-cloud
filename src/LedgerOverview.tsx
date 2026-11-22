import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

type Row = { income: number; expense: number };
const shanghaiToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());

export function LedgerOverview({ledgerId}:{ledgerId:string}){
  const [rows,setRows]=useState<Row[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  const today=shanghaiToday();const month=today.slice(0,7);const [year,n]=month.split('-').map(Number);
  const from=`${month}-01`;const to=new Date(Date.UTC(year,n,0)).toISOString().slice(0,10);
  const refresh=useCallback(async()=>{if(!supabase)return;setLoading(true);setError('');
    const {data,error:e}=await supabase.from('transaction_totals').select('income,expense').eq('ledger_id',ledgerId).gte('occurred_on',from).lte('occurred_on',to);
    if(e)setError(`本月概览读取失败：${e.message}`);else setRows((data??[]) as Row[]);setLoading(false);
  },[ledgerId,from,to]);
  useEffect(()=>{void refresh();const client=supabase;if(!client)return;
    const channel=client.channel(`overview-${ledgerId}`).on('postgres_changes',{event:'*',schema:'public',table:'transactions',filter:`ledger_id=eq.${ledgerId}`},()=>void refresh()).subscribe();
    return()=>{void client.removeChannel(channel);};
  },[ledgerId,refresh]);
  const income=rows.reduce((s,r)=>s+Number(r.income),0);const expense=rows.reduce((s,r)=>s+Number(r.expense),0);
  return <section className="overview-grid" aria-label="本月财务概览">
    <article><span>本月收入</span><strong>¥{income.toFixed(2)}</strong></article>
    <article><span>本月支出</span><strong>¥{expense.toFixed(2)}</strong></article>
    <article><span>本月结余</span><strong>¥{(income-expense).toFixed(2)}</strong></article>
    {loading&&<small>读取中…</small>}{error&&<small className="error">{error}</small>}
  </section>;
}
