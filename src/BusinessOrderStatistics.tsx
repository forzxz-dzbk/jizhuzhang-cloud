import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

type OrderRow = {
  id: string; order_date: string; title: string; business_type: string;
  gross_revenue: number | string; refunds: number | string; actual_revenue: number | string;
  allocated_cost: number | string; operating_surplus: number | string;
};
const PAGE_SIZE = 50;
const centsTotal = (rows: OrderRow[], key: 'gross_revenue'|'refunds'|'actual_revenue'|'allocated_cost'|'operating_surplus') =>
  rows.reduce((total, row) => total + Math.round(Number(row[key]) * 100), 0);
const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

export function BusinessOrderStatistics({ ledgerId }: { ledgerId: string }) {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++sequence.current;
    const client = supabase;
    if (!client) { setError('云端服务未配置，订单统计不可用。'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const all: OrderRow[] = [];
      for (let start = 0; ; start += 500) {
        const { data, error: queryError } = await client.from('business_order_totals')
          .select('id,order_date,title,business_type,gross_revenue,refunds,actual_revenue,allocated_cost,operating_surplus')
          .eq('ledger_id', ledgerId).order('order_date', { ascending: false }).order('id', { ascending: false })
          .range(start, start + 499);
        if (queryError) throw new Error(queryError.message);
        const batch = (data ?? []) as OrderRow[];
        all.push(...batch);
        if (batch.length < 500) break;
      }
      if (requestId === sequence.current) setRows(all);
    } catch (cause) {
      if (requestId === sequence.current) setError(`业务订单统计读取失败：${cause instanceof Error ? cause.message : '网络错误'}`);
    } finally { if (requestId === sequence.current) setLoading(false); }
  }, [ledgerId]);

  useEffect(() => {
    void refresh();
    const client = supabase;
    if (!client) return;
    const channel = client.channel(`business-order-stats-${ledgerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `ledger_id=eq.${ledgerId}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_orders', filter: `ledger_id=eq.${ledgerId}` }, () => void refresh())
      .subscribe();
    return () => { sequence.current += 1; void client.removeChannel(channel); };
  }, [ledgerId, refresh]);

  const types = [...new Set(rows.map(row => row.business_type))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const filtered = filter ? rows.filter(row => row.business_type === filter) : rows;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return <section className="panel business-orders" aria-label="业务订单统计">
    <h2>业务订单 · 营收与经营结余</h2>
    <p>订单实收 = 营收 − 退款；订单经营结余 = 订单实收 − 已关联成本。未关联到订单的经营支出仍计入业务账本月度支出，不虚分摊到订单。</p>
    {!loading && !error && rows.length > 0 && <>
      <div className="order-summary">
        <span>全部订单实收 <strong>{money(centsTotal(filtered,'actual_revenue'))}</strong></span>
        <span>已关联成本 <strong>{money(centsTotal(filtered,'allocated_cost'))}</strong></span>
        <span>经营结余 <strong>{money(centsTotal(filtered,'operating_surplus'))}</strong></span>
      </div>
      <label>按业务类型筛选<select value={filter} onChange={event=>{setFilter(event.target.value);setPage(0)}}><option value="">全部类型</option>{types.map(type=><option key={type} value={type}>{type}</option>)}</select></label>
      <div className="order-table-wrap"><table><thead><tr><th>日期 / 订单</th><th>类型</th><th>营收</th><th>退款</th><th>实收</th><th>关联成本</th><th>经营结余</th></tr></thead>
        <tbody>{visible.map(row=><tr key={row.id}><td>{row.order_date} · {row.title}</td><td>{row.business_type}</td><td>{money(Math.round(Number(row.gross_revenue)*100))}</td><td>−{money(Math.round(Number(row.refunds)*100))}</td><td>{money(Math.round(Number(row.actual_revenue)*100))}</td><td>{money(Math.round(Number(row.allocated_cost)*100))}</td><td>{money(Math.round(Number(row.operating_surplus)*100))}</td></tr>)}</tbody></table></div>
      <div className="order-pages"><button className="secondary" disabled={currentPage===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>上一页</button><span>第 {currentPage+1}/{pageCount} 页，共 {filtered.length} 笔</span><button className="secondary" disabled={currentPage+1>=pageCount} onClick={()=>setPage(p=>p+1)}>下一页</button></div>
    </>}
    {loading && <p role="status">正在读取云端订单统计…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && rows.length===0 && <p className="empty">还没有真实业务订单；录入业务收入后会在此显示，暂不填充示例数据。</p>}
  </section>;
}
