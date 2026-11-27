import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { RevenueCalendar } from './RevenueCalendar';
import { RecurringExpenses } from './RecurringExpenses';
import { LedgerOverview } from './LedgerOverview';
import { CloudBackup } from './CloudBackup';
import { escapeLikePattern } from './transaction-search.mjs';
import { AccountBalances } from './AccountBalances';
import { BusinessOrderStatistics } from './BusinessOrderStatistics';
import { SavingsGoals } from './SavingsGoals';

type Ledger = { id: string; kind: 'personal' | 'business'; name: string };
type Transaction = {
  id: string; type: string; amount: number; occurred_on: string; note: string;
  account_id: string; transfer_account_id: string | null; category_id: string | null;
  business_order_id: string | null; refund_order_id: string | null; cost_order_id: string | null;
};
type Account = { id: string; name: string; opening_balance: number | string };
type Category = { id: string; name: string; flow: 'income' | 'expense' };
type BusinessOrder = { id: string; title: string; order_date: string };
const TRANSACTION_PAGE_SIZE = 100;

export function LedgerHome({ session, onSignOut }: { session: Session; onSignOut: () => Promise<void> }) {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [selected, setSelected] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [transactionPage, setTransactionPage] = useState(0);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const transactionRequest = useRef(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<BusinessOrder[]>([]);
  const [accountName, setAccountName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryFlow, setCategoryFlow] = useState<Category['flow']>('expense');
  const [entryType, setEntryType] = useState<'income' | 'expense' | 'transfer' | 'refund'>('expense');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncState,setSyncState]=useState('连接实时同步…');

  const loadLedgers = useCallback(async () => {
    if (!supabase) return;
    setLoading(true); setError('');
    const { data, error: queryError } = await supabase.from('ledgers').select('id,kind,name').order('kind');
    if (queryError) setError(`云端账本读取失败：${queryError.message}`);
    else {
      const found = (data ?? []) as Ledger[];
      setLedgers(found);
      setSelected(current => found.some(row => row.id === current) ? current : found[0]?.id ?? '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadLedgers(); }, [loadLedgers]);
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearchQuery(transactionSearch.trim()); setTransactionPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [transactionSearch]);
  const loadTransactions=useCallback(async(page=transactionPage,filter=searchQuery)=>{
    const requestVersion=++transactionRequest.current;
    const client=supabase;
    if(!client||!selected){setTransactions([]);setHasMoreTransactions(false);setTransactionsLoading(false);return;}
    setTransactionsLoading(true);
    try {
      let request=client.from('transactions').select('id,type,amount,occurred_on,note,account_id,transfer_account_id,category_id,business_order_id,refund_order_id,cost_order_id')
        .eq('ledger_id',selected).order('occurred_on',{ascending:false});
      if(filter) request=request.ilike('note',`%${escapeLikePattern(filter)}%`);
      const start=page*TRANSACTION_PAGE_SIZE;
      const {data,error:queryError}=await request.range(start,start+TRANSACTION_PAGE_SIZE);
      if(requestVersion!==transactionRequest.current)return;
      if(queryError)setError(`明细读取失败：${queryError.message}`);else {
        const rows=(data??[]) as Transaction[];
        setTransactions(rows.slice(0,TRANSACTION_PAGE_SIZE));
        setHasMoreTransactions(rows.length>TRANSACTION_PAGE_SIZE);
      }
    } catch(cause) {
      if(requestVersion===transactionRequest.current)setError(`明细读取失败：${cause instanceof Error?cause.message:'网络错误'}`);
    } finally {
      if(requestVersion===transactionRequest.current)setTransactionsLoading(false);
    }
  },[selected,transactionPage,searchQuery]);
  useEffect(()=>{void loadTransactions();},[loadTransactions]);
  const loadOptions = useCallback(async () => {
    if (!supabase || !selected) { setAccounts([]); setCategories([]); return; }
    const [a, c, o] = await Promise.all([
      supabase.from('accounts').select('id,name,opening_balance').eq('ledger_id', selected).eq('is_archived', false).order('name'),
      supabase.from('categories').select('id,name,flow').eq('ledger_id', selected).eq('is_archived', false).order('name'),
      supabase.from('business_orders').select('id,title,order_date').eq('ledger_id', selected).order('order_date',{ascending:false}),
    ]);
    if (a.error || c.error || o.error) setError(`账户/分类/订单读取失败：${a.error?.message ?? c.error?.message ?? o.error?.message}`);
    else { setAccounts((a.data ?? []) as Account[]); setCategories((c.data ?? []) as Category[]); setOrders((o.data??[]) as BusinessOrder[]); }
  }, [selected]);
  useEffect(() => { void loadOptions(); }, [loadOptions]);
  useEffect(()=>{
    const client=supabase;
    if(!client||!selected){setSyncState('选择账本以连接同步');return;}
    const channel=client.channel(`ledger-sync-${selected}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'transactions',filter:`ledger_id=eq.${selected}`},()=>{void loadTransactions();void loadOptions();})
      .on('postgres_changes',{event:'*',schema:'public',table:'accounts',filter:`ledger_id=eq.${selected}`},()=>void loadOptions())
      .on('postgres_changes',{event:'*',schema:'public',table:'categories',filter:`ledger_id=eq.${selected}`},()=>void loadOptions())
      .on('postgres_changes',{event:'*',schema:'public',table:'recurring_expense_instances',filter:`ledger_id=eq.${selected}`},()=>void loadTransactions())
      .subscribe(status=>setSyncState(status==='SUBSCRIBED'?'多设备实时同步已连接':'实时同步未连接；可手动刷新'));
    return()=>{setSyncState('实时同步已断开');void client.removeChannel(channel);};
  },[selected,loadTransactions,loadOptions]);

  async function createLedger(kind: Ledger['kind']) {
    if (!supabase) return;
    setBusy(true); setError(''); setNotice('');
    const name = kind === 'personal' ? '个人生活' : 'Mac 业务';
    const { data, error: insertError } = await supabase.from('ledgers')
      .insert({ owner_id: session.user.id, kind, name }).select('id,kind,name').single();
    if (insertError) setError(insertError.code === '23505' ? '该账本已存在，请刷新列表。' : `创建失败：${insertError.message}`);
    else {
      const ledger = data as Ledger;
      setLedgers(current => [...current, ledger]); setSelected(ledger.id);
      setNotice(`${name}账本已保存到云端。`);
    }
    setBusy(false);
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !selected) return;
    const formElement = event.currentTarget;
    const openingBalanceText = String(new FormData(formElement).get('opening_balance') ?? '').trim();
    const openingBalance = Number(openingBalanceText);
    if (!openingBalanceText || !Number.isFinite(openingBalance) || Math.abs(openingBalance) >= 1_000_000_000_000 || Math.abs(openingBalance * 100 - Math.round(openingBalance * 100)) > 1e-8) {
      setError('期初余额必须是有效金额，最多两位小数。'); return;
    }
    setBusy(true); setError('');
    const { error: e } = await supabase.from('accounts').insert({ ledger_id: selected, name: accountName.trim(), opening_balance: openingBalance });
    if (e) setError(`账户保存失败：${e.message}`);
    else { setAccountName(''); formElement.reset(); await loadOptions(); setNotice('账户已保存到云端。'); }
    setBusy(false);
  }
  async function createCategory(event: FormEvent<HTMLFormElement>, flow: Category['flow']) {
    event.preventDefault(); if (!supabase || !selected) return;
    setBusy(true); setError('');
    const { error: e } = await supabase.from('categories').insert({ ledger_id: selected, name: categoryName.trim(), flow });
    if (e) setError(`分类保存失败：${e.message}`);
    else { setCategoryName(''); await loadOptions(); setNotice('分类已保存到云端。'); }
    setBusy(false);
  }
  async function createTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !selected || !active) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amount = Number(form.get('amount'));
    const date = String(form.get('date'));
    const accountId = String(form.get('account'));
    const categoryId = entryType === 'transfer' || entryType === 'refund' ? null : String(form.get('category'));
    const transferAccountId = entryType === 'transfer' ? String(form.get('transferAccount')) : null;
    if (!Number.isFinite(amount) || amount <= 0) { setError('金额必须大于 0。'); return; }
    if (entryType === 'transfer' && accountId === transferAccountId) { setError('转出与转入账户不能相同。'); return; }
    setBusy(true); setError(''); setNotice('');
    const note = String(form.get('note') ?? '');
    let rpcName = 'create_transaction';
    let args: Record<string, unknown>;
    if (active.kind === 'business' && entryType === 'income') {
      rpcName = 'create_business_income';
      args = {
        p_request_id: requestId, p_ledger_id: selected, p_account_id: accountId,
        p_amount: amount, p_occurred_on: date, p_note: note, p_category_id: categoryId,
        p_business_order_date: String(form.get('orderDate')),
        p_business_order_title: String(form.get('orderTitle')),
        p_business_type: String(form.get('businessType') ?? '').trim(),
      };
    } else if (active.kind === 'business' && entryType === 'expense') {
      rpcName = 'create_business_cost';
      args = {
        p_request_id: requestId, p_ledger_id: selected, p_account_id: accountId,
        p_amount: amount, p_occurred_on: date, p_note: note, p_category_id: categoryId,
        p_cost_order_id: String(form.get('costOrder') ?? '') || null,
      };
    } else args = {
      p_request_id: requestId, p_ledger_id: selected, p_type: entryType,
      p_account_id: accountId, p_amount: amount, p_occurred_on: date,
      p_note: note, p_category_id: categoryId, p_transfer_account_id: transferAccountId,
      p_business_order_date: null, p_business_order_title: null,
      p_refund_order_id: active.kind === 'business' && entryType === 'refund' ? String(form.get('refundOrder')) : null,
    };
    const { error: saveError } = await supabase.rpc(rpcName, args);
    if (saveError) setError(`保存失败，流水未确认写入：${saveError.message}`);
    else {
      setNotice('流水已保存到云端。');
      setRequestId(crypto.randomUUID());
      setTransactionSearch(''); setSearchQuery(''); setTransactionPage(0);
      await Promise.all([loadOptions(), loadTransactions(0,'')]);
      formElement.reset();
    }
    setBusy(false);
  }

  const active = ledgers.find(row => row.id === selected);
  const transactionDetails = (row: Transaction) => {
    const account = (id: string) => accounts.find(item => item.id === id)?.name ?? '已归档账户';
    const category = row.category_id ? categories.find(item => item.id === row.category_id)?.name ?? '已归档分类' : '';
    const orderId = row.business_order_id ?? row.refund_order_id ?? row.cost_order_id;
    const order = orderId ? orders.find(item => item.id === orderId) : null;
    const label = row.type === 'income' ? '收入' : row.type === 'expense' ? '支出' : row.type === 'transfer' ? '内部转账' : '业务退款';
    const details = row.type === 'transfer'
      ? [`转出：${account(row.account_id)}`, `转入：${row.transfer_account_id ? account(row.transfer_account_id) : '未知账户'}`]
      : [account(row.account_id), category].filter(Boolean);
    if (order) details.push(`订单：${order.title}`);
    return { label, details: details.join(' · ') };
  };
  return <main className="dashboard">
    <header className="dash-header"><div><div className="brand">记祝账</div><p>{session.user.email}</p></div><button className="secondary" onClick={onSignOut}>退出登录</button></header>
    <h1>你的账本</h1><p>个人生活与 Mac 业务分开保存、分开统计。</p>
    <CloudBackup session={session} />
    <section className="ledger-actions" aria-label="创建账本">
      {!ledgers.some(row => row.kind === 'personal') && <button disabled={busy} onClick={() => void createLedger('personal')}>创建个人生活账本</button>}
      {!ledgers.some(row => row.kind === 'business') && <button disabled={busy} onClick={() => void createLedger('business')}>创建 Mac 业务账本</button>}
    </section>
    {loading && <p role="status">正在读取云端账本…</p>}
    {!loading && ledgers.length === 0 && <section className="empty"><h2>还没有账本</h2><p>创建账本后即可从真实云端读取记录。此处不会用示例账目填充。</p></section>}
    {ledgers.length > 0 && <>
      <nav className="ledger-tabs" aria-label="选择账本">{ledgers.map(row => <button key={row.id} className={selected === row.id ? 'selected' : 'secondary'} onClick={() => setSelected(row.id)}>{row.name}</button>)}</nav>
      {active?.kind === 'business' && <RevenueCalendar ledgerId={active.id} />}
      {active&&<LedgerOverview ledgerId={active.id}/>}
      {active?.kind === 'business' && <BusinessOrderStatistics ledgerId={active.id} />}
      {active?.kind === 'personal' && <SavingsGoals ledgerId={active.id} accounts={accounts} />}
      {active && <RecurringExpenses ledgerId={active.id} accounts={accounts} categories={categories} onConfirmed={async()=>{
        setTransactionSearch(''); setSearchQuery(''); setTransactionPage(0);
        await loadTransactions(0,'');
      }} />}
      {active && <section className="panel"><h2>{active.name} · 近期明细</h2>
        <section className="setup-grid">
          <form onSubmit={createAccount}><h3>新增账户</h3><input aria-label="账户名称" required maxLength={80} value={accountName} onChange={e=>setAccountName(e.target.value)} placeholder="例如：银行卡"/><label>期初余额（CNY）<input name="opening_balance" type="number" step="0.01" required defaultValue="0"/></label><small>这是首次使用时的起点余额；负数可用于记录信用卡等负债。</small><button disabled={busy}>保存账户</button></form>
          <form onSubmit={e=>void createCategory(e, categoryFlow)}><h3>新增分类</h3><select aria-label="分类类型" value={categoryFlow} onChange={e=>setCategoryFlow(e.target.value as Category['flow'])}><option value="expense">支出</option><option value="income">收入</option></select><input aria-label="分类名称" required maxLength={80} value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="例如：餐饮或工资"/><button disabled={busy}>保存分类</button></form>
        </section>
        <AccountBalances ledgerId={active.id} accounts={accounts}/>
        <form className="entry-form" onSubmit={createTransaction}>
          <h3>新增流水</h3>
          <label>类型<select value={entryType} onChange={e=>setEntryType(e.target.value as typeof entryType)}><option value="expense">支出</option><option value="income">收入</option><option value="transfer">内部转账</option>{active.kind==='business'&&<option value="refund">业务退款</option>}</select></label>
          <label>金额（CNY）<input name="amount" type="number" min="0.01" step="0.01" required/></label>
          <label>日期<input name="date" type="date" required defaultValue={new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date())}/></label>
          <label>账户<select name="account" required>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          {(entryType === 'income'||entryType==='expense') && <label>分类<select name="category" required>{categories.filter(c=>c.flow===entryType).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
          {entryType==='refund'&&<label>关联原订单<select name="refundOrder" required>{orders.map(o=><option key={o.id} value={o.id}>{o.order_date} · {o.title}</option>)}</select></label>}
          {active.kind==='business'&&entryType==='expense'&&<label>关联业务订单（可选）<select name="costOrder"><option value="">不关联订单</option>{orders.map(o=><option key={o.id} value={o.id}>{o.order_date} · {o.title}</option>)}</select></label>}
          {entryType === 'transfer' && <label>转入账户<select name="transferAccount" required>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
          {active.kind === 'business' && entryType === 'income' && <><label>订单名称<input name="orderTitle" required maxLength={160}/></label><label>业务类型<input name="businessType" required maxLength={80} placeholder="例如：自媒体、技术服务"/></label><label>订单日期<input name="orderDate" type="date" required/></label></>}
          <label>备注<input name="note" maxLength={500}/></label>
          <button disabled={busy || accounts.length===0 || ((entryType==='income'||entryType==='expense') && !categories.some(c=>c.flow===entryType)) || (entryType==='refund'&&orders.length===0)}>{busy?'正在保存…':'保存流水'}</button>
          {accounts.length===0 && <p className="error">请先创建账户。</p>}
          {(entryType==='income'||entryType==='expense') && !categories.some(c=>c.flow===entryType) && <p className="error">请先创建对应类型的分类。</p>}
          {entryType==='refund'&&orders.length===0&&<p className="error">请先录入原始业务收入订单。</p>}
        </form>
        <div className="transaction-tools">
          <label>按备注搜索<input type="search" aria-label="搜索备注" maxLength={120} value={transactionSearch} onChange={event=>setTransactionSearch(event.target.value)} placeholder="输入关键词查找云端全部流水"/></label>
          <div className="transaction-pagination"><button className="secondary" disabled={busy||loading||transactionPage===0} onClick={()=>setTransactionPage(page=>Math.max(0,page-1))}>上一页</button><span>第 {transactionPage+1} 页</span><button className="secondary" disabled={busy||loading||!hasMoreTransactions} onClick={()=>setTransactionPage(page=>page+1)}>下一页</button></div>
        </div>
        {transactionsLoading && <p role="status">正在加载云端流水…</p>}
        {transactions.length === 0 && !transactionsLoading && !error && <p className="empty">{searchQuery ? '没有找到匹配备注的流水。' : transactionPage > 0 ? '本页没有更多流水。' : '该账本暂无真实流水。'}</p>}
        {transactions.length > 0 && <ul className="transaction-list">{transactions.map(row => {const detail=transactionDetails(row);return <li key={row.id}><span><span>{row.occurred_on} · {row.note || detail.label}</span><small>{detail.label} · {detail.details}</small></span><strong>{row.type === 'transfer' ? '↔ ' : row.type === 'expense' || row.type === 'refund' ? '−' : '+'}¥{Number(row.amount).toFixed(2)}</strong></li>})}</ul>}
      </section>}
    </>}
    {notice && <p className="notice" role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}
    <div className="sync-footer"><small role="status">{syncState}</small><button className="refresh secondary" disabled={busy || loading} onClick={() => void loadLedgers()}>刷新云端数据</button></div>
  </main>;
}
