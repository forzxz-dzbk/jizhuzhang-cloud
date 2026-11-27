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
import { createRequestId } from './uuid.mjs';
import { formatShanghaiTimestamp, shanghaiToday } from './shanghai-time.mjs';
import { DEFAULT_CATEGORIES, missingDefaultCategories } from './ledger-default-categories.mjs';
import { LedgerMonthCard } from './LedgerMonthCard';
import { TransactionCalendar } from './TransactionCalendar';

type Ledger = { id: string; kind: 'personal' | 'business'; name: string };
type Transaction = {
  id: string; type: string; amount: number; occurred_on: string; occurred_at: string; created_at: string; note: string;
  account_id: string; transfer_account_id: string | null; category_id: string | null;
  business_order_id: string | null; refund_order_id: string | null; cost_order_id: string | null; recurring_instance_id: string | null;
};
type Account = { id: string; name: string; opening_balance: number | string };
type Category = { id: string; name: string; flow: 'income' | 'expense' };
type BusinessOrder = { id: string; title: string | null; order_date: string };
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
  const [requestId, setRequestId] = useState(() => createRequestId());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncState,setSyncState]=useState('连接实时同步…');
  const [activeTab,setActiveTab]=useState<'ledger'|'assets'|'stats'>('ledger');
  const [entryOpen,setEntryOpen]=useState(false);
  const [selectedCategoryId,setSelectedCategoryId]=useState('');
  const [editingTransaction,setEditingTransaction]=useState<Transaction|null>(null);

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
    const openStats = () => setActiveTab('stats');
    window.addEventListener('jizhuzhang:open-stats', openStats);
    return () => window.removeEventListener('jizhuzhang:open-stats', openStats);
  }, []);
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
      let request=client.from('transactions').select('id,type,amount,occurred_on,occurred_at,created_at,note,account_id,transfer_account_id,category_id,business_order_id,refund_order_id,cost_order_id,recurring_instance_id')
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
    else {
      let categoryRows = (c.data ?? []) as Category[];
      const missing = (['expense','income'] as const).flatMap(flow => missingDefaultCategories(categoryRows, flow).map(item => ({ ledger_id: selected, name: item.name, flow })));
      if (missing.length) {
        const { error: seedError } = await supabase.from('categories').insert(missing);
        if (seedError) setError(`内置分类初始化失败：${seedError.message}`);
        else {
          const seeded = await supabase.from('categories').select('id,name,flow').eq('ledger_id', selected).eq('is_archived', false).order('name');
          if (seeded.error) setError(`默认分类读取失败：${seeded.error.message}`);
          else categoryRows = (seeded.data ?? []) as Category[];
        }
      }
      setAccounts((a.data ?? []) as Account[]); setCategories(categoryRows); setOrders((o.data??[]) as BusinessOrder[]);
      setSelectedCategoryId(current => categoryRows.some(item => item.id === current && item.flow === entryType) ? current : categoryRows.find(item => item.flow === entryType)?.id ?? '');
    }
  }, [selected, entryType]);
  useEffect(() => { void loadOptions(); }, [loadOptions]);
  useEffect(() => {
    const choices = categories.filter(item => item.flow === entryType);
    if (!choices.some(item => item.id === selectedCategoryId)) setSelectedCategoryId(choices[0]?.id ?? '');
  }, [categories, entryType, selectedCategoryId]);
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
    const name = kind === 'personal' ? '支出' : '收入';
    const { data, error: insertError } = await supabase.from('ledgers')
      .insert({ owner_id: session.user.id, kind, name }).select('id,kind,name').single();
    if (insertError) setError(insertError.code === '23505' ? '该账本已存在，请刷新列表。' : `创建失败：${insertError.message}`);
    else {
      const ledger = data as Ledger;
      setLedgers(current => [...current, ledger]); setSelected(ledger.id);
      const { error: accountError } = await supabase.from('accounts').insert({ ledger_id: ledger.id, name: '现金', opening_balance: 0 });
      if (accountError) setError(`“${name}”已创建，但默认现金账户创建失败：${accountError.message}`);
      setNotice(`${name}账本已保存到云端；默认分类正在准备。`);
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
    const date = shanghaiToday();
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
        p_business_order_date: date,
        p_business_order_title: String(form.get('orderTitle') ?? '').trim() || null,
        p_business_type: String(form.get('businessType') ?? '').trim() || null,
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
      window.dispatchEvent(new Event('jizhuzhang:transactions-changed'));
      setRequestId(createRequestId());
      setTransactionSearch(''); setSearchQuery(''); setTransactionPage(0);
      await Promise.all([loadOptions(), loadTransactions(0,'')]);
      formElement.reset(); setEntryOpen(false);
    }
    setBusy(false);
  }

  async function updateTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !editingTransaction) return;
    const form = new FormData(event.currentTarget);
    const amountText = String(form.get('amount') ?? '').trim();
    const amount = Number(amountText);
    const shanghaiLocal = String(form.get('occurred_at') ?? '');
    const occurredAt = new Date(`${shanghaiLocal}:00+08:00`);
    if (!amountText || !Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
      setError('金额必须大于 0，且最多两位小数。'); return;
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(shanghaiLocal) || !Number.isFinite(occurredAt.getTime())) {
      setError('请选择有效的北京时间日期和时间。'); return;
    }
    const transfer = editingTransaction.type === 'transfer';
    const category = editingTransaction.type === 'income' || editingTransaction.type === 'expense';
    const accountId = String(form.get('account') ?? '');
    const transferAccountId = transfer ? String(form.get('transferAccount') ?? '') : null;
    if (transfer && accountId === transferAccountId) { setError('转出与转入账户不能相同。'); return; }
    setBusy(true); setError(''); setNotice('');
    const { error: saveError } = await supabase.rpc('update_transaction', {
      p_transaction_id: editingTransaction.id,
      p_amount: amount,
      p_occurred_at: occurredAt.toISOString(),
      p_account_id: accountId,
      p_category_id: category ? String(form.get('category') ?? '') : null,
      p_transfer_account_id: transferAccountId,
      p_note: String(form.get('note') ?? ''),
    });
    if (saveError) setError(`修改失败，原流水保持不变：${saveError.message}`);
    else {
      setEditingTransaction(null);
      setNotice('流水已修改并保存到云端；日期、时间按北京时间更新。');
      window.dispatchEvent(new Event('jizhuzhang:transactions-changed'));
      await Promise.all([loadTransactions(), loadOptions()]);
    }
    setBusy(false);
  }

  async function deleteTransaction(row: Transaction) {
    if (!supabase) return;
    if (!window.confirm('确定删除这笔流水？删除后余额、月度统计和相关目标会同步重算。此操作不能直接撤销。')) return;
    setBusy(true); setError(''); setNotice('');
    const { error: deleteError } = await supabase.rpc('delete_transaction', { p_transaction_id: row.id });
    if (deleteError) setError(`删除失败，流水未删除：${deleteError.message}`);
    else {
      if (editingTransaction?.id === row.id) setEditingTransaction(null);
      setNotice(row.recurring_instance_id ? '流水已删除；对应固定支出已恢复为待确认。' : '流水已删除，余额与统计已更新。');
      window.dispatchEvent(new Event('jizhuzhang:transactions-changed'));
      await Promise.all([loadTransactions(), loadOptions()]);
    }
    setBusy(false);
  }

  const formatShanghaiInput = (timestamp: string) => {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return '';
    return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
  };

  const renderTransactionRows = (rows: Transaction[]) => <ul className="transaction-list">{rows.map(row => {
    const detail = transactionDetails(row);
    return <li key={row.id}>
      <span className="transaction-copy"><span>{formatShanghaiTimestamp(row.occurred_at)} · {row.note || detail.label}</span><small>{detail.label} · {detail.details}</small></span>
      <strong className={row.type==='expense'||row.type==='refund'?'amount-expense':'amount-income'}>{row.type==='transfer'?'↔ ':row.type==='expense'||row.type==='refund'?'−':'+'}¥{Number(row.amount).toFixed(2)}</strong>
      <span className="transaction-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>{setError('');setEditingTransaction(row);}}>修改</button><button type="button" className="secondary delete-transaction" disabled={busy} onClick={()=>void deleteTransaction(row)}>删除</button></span>
    </li>;
  })}</ul>;

  const active = ledgers.find(row => row.id === selected);
  const displayName = (row: Ledger) => row.kind === 'personal' ? '支出' : '收入';
  const transactionDetails = (row: Transaction) => {
    const account = (id: string) => accounts.find(item => item.id === id)?.name ?? '已归档账户';
    const category = row.category_id ? categories.find(item => item.id === row.category_id)?.name ?? '已归档分类' : '';
    const orderId = row.business_order_id ?? row.refund_order_id ?? row.cost_order_id;
    const order = orderId ? orders.find(item => item.id === orderId) : null;
    const label = row.type === 'income' ? '收入' : row.type === 'expense' ? '支出' : row.type === 'transfer' ? '内部转账' : '业务退款';
    const details = row.type === 'transfer'
      ? [`转出：${account(row.account_id)}`, `转入：${row.transfer_account_id ? account(row.transfer_account_id) : '未知账户'}`]
      : [account(row.account_id), category].filter(Boolean);
    if (order) details.push(`订单：${order.title || '未填写订单名称'}`);
    return { label, details: details.join(' · ') };
  };
  return <main className="dashboard app-shell">
    <header className="app-header"><div><div className="brand">记祝账</div><small>{active ? displayName(active) : '云端账本'}</small></div><button className="profile-button secondary" aria-label="退出登录" onClick={onSignOut}>退出</button></header>
    <section className="ledger-actions" aria-label="创建账本">
      {!ledgers.some(row => row.kind === 'personal') && <button disabled={busy} onClick={() => void createLedger('personal')}>创建支出账本</button>}
      {!ledgers.some(row => row.kind === 'business') && <button disabled={busy} onClick={() => void createLedger('business')}>创建收入账本</button>}
    </section>
    {loading && <p role="status">正在读取云端账本…</p>}
    {!loading && ledgers.length === 0 && <section className="empty"><h2>开始记账</h2><p>创建支出或收入账本后即可使用。两类账本会独立保存、独立统计。</p></section>}
    {ledgers.length > 0 && <>
      <nav className="ledger-tabs" aria-label="选择账本">{ledgers.map(row => <button key={row.id} className={selected === row.id ? 'selected' : 'secondary'} onClick={() => { setSelected(row.id); setActiveTab('ledger'); }}>{displayName(row)}</button>)}</nav>
      {active && activeTab === 'ledger' && <>
        <LedgerMonthCard ledgerId={active.id} kind={active.kind}/>
        <section className="recent-ledger panel" aria-label="近期流水"><div className="section-heading"><h2>近期流水</h2><button className="secondary compact-button" onClick={() => void loadTransactions(0, '')}>刷新</button></div>
          <label className="quick-search">搜索备注<input type="search" aria-label="搜索备注" maxLength={120} value={transactionSearch} onChange={event=>setTransactionSearch(event.target.value)} placeholder="搜索流水"/></label>
          {transactionsLoading && <p role="status">正在加载云端流水…</p>}
          {transactions.length === 0 && !transactionsLoading && !error && <p className="empty">{searchQuery ? '没有找到匹配备注的流水。' : '本月暂时没有流水，点击右下角 + 开始记账。'}</p>}
          {transactions.length > 0 && renderTransactionRows(transactions.slice(0, 8))}
          {transactions.length > 8 && <button className="secondary" onClick={() => setActiveTab('stats')}>查看全部流水</button>}
        </section>
      </>}
      {active && activeTab === 'assets' && <section className="panel"><h1>资产与设置</h1><p>支出与收入账本仍然分开存储和统计。</p>
        <form className="asset-create-form" onSubmit={createAccount}><h2>新增账户</h2><input aria-label="账户名称" required maxLength={80} value={accountName} onChange={e=>setAccountName(e.target.value)} placeholder="例如：银行卡"/><label>期初余额（CNY）<input name="opening_balance" type="number" step="0.01" required defaultValue="0"/></label><small>负数可用于记录信用卡等负债。</small><button disabled={busy}>保存账户</button></form>
        <form className="asset-create-form" onSubmit={e=>void createCategory(e, categoryFlow)}><h2>添加自定义分类</h2><select aria-label="分类类型" value={categoryFlow} onChange={e=>setCategoryFlow(e.target.value as Category['flow'])}><option value="expense">支出</option><option value="income">收入</option></select><input aria-label="分类名称" required maxLength={80} value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="内置分类已准备好，也可自定义"/><button disabled={busy}>保存分类</button></form>
        <AccountBalances ledgerId={active.id} accounts={accounts}/>
        <RecurringExpenses ledgerId={active.id} accounts={accounts} categories={categories} onConfirmed={async()=>{window.dispatchEvent(new Event('jizhuzhang:transactions-changed'));setTransactionSearch('');setSearchQuery('');setTransactionPage(0);await loadTransactions(0,'');}} />
        <CloudBackup session={session} />
      </section>}
      {active && activeTab === 'stats' && <>
        <TransactionCalendar ledgerId={active.id}/>
        <LedgerOverview ledgerId={active.id}/>
        {active.kind === 'business' && <><RevenueCalendar ledgerId={active.id}/><BusinessOrderStatistics ledgerId={active.id}/></>}
        {active.kind === 'personal' && <SavingsGoals ledgerId={active.id} accounts={accounts}/>}
        <section className="panel all-transactions"><h2>全部流水</h2>
          <div className="transaction-tools"><label>按备注搜索<input type="search" aria-label="全部流水搜索" maxLength={120} value={transactionSearch} onChange={event=>setTransactionSearch(event.target.value)} placeholder="输入关键词查找云端流水"/></label><div className="transaction-pagination"><button className="secondary" disabled={busy||loading||transactionPage===0} onClick={()=>setTransactionPage(page=>Math.max(0,page-1))}>上一页</button><span>第 {transactionPage+1} 页</span><button className="secondary" disabled={busy||loading||!hasMoreTransactions} onClick={()=>setTransactionPage(page=>page+1)}>下一页</button></div></div>
          {transactions.length>0&&renderTransactionRows(transactions)}
          {transactions.length===0&&!transactionsLoading&&<p className="empty">该账本暂无真实流水。</p>}
        </section>
      </>}
      {active && <>
        <button className="floating-add" aria-label="新增支出或收入" onClick={() => { setEntryType('expense'); setEntryOpen(true); }}>+</button>
        <nav className="bottom-tabs" aria-label="主导航"><button className={activeTab==='ledger'?'active':''} onClick={()=>setActiveTab('ledger')}><span>▤</span>账本</button><button className={activeTab==='assets'?'active':''} onClick={()=>setActiveTab('assets')}><span>▱</span>资产</button><button className={activeTab==='stats'?'active':''} onClick={()=>setActiveTab('stats')}><span>▥</span>统计</button></nav>
      </>}
      {active && entryOpen && <div className="quick-entry-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setEntryOpen(false);}}><section className="quick-entry-sheet" role="dialog" aria-modal="true" aria-labelledby="quick-entry-title">
        <form className="quick-entry-form" onSubmit={createTransaction}>
          <div className="quick-entry-top"><button type="button" className="close-entry" aria-label="关闭" onClick={()=>setEntryOpen(false)}>×</button><div className="entry-switch"><button type="button" aria-pressed={entryType==='expense'} className={entryType==='expense'?'expense-selected':''} onClick={()=>setEntryType('expense')}>支出</button><button type="button" aria-pressed={entryType==='income'} className={entryType==='income'?'income-selected':''} onClick={()=>setEntryType('income')}>收入</button></div><span className="quick-plus">＋</span></div>
          <h2 id="quick-entry-title">选择{entryType==='income'?'收入':'支出'}分类</h2>
          <div className="category-grid">{categories.filter(item=>item.flow===entryType).map(item=>{const icon=DEFAULT_CATEGORIES[entryType as Category['flow']].find(value=>value.name===item.name)?.icon??'◻️';return <button type="button" key={item.id} className={selectedCategoryId===item.id?'category-tile selected-category':''} onClick={()=>setSelectedCategoryId(item.id)}><span className="category-icon">{icon}</span><span>{item.name}</span></button>})}</div>
          {selectedCategoryId&&<input type="hidden" name="category" value={selectedCategoryId}/>}
          <div className="quick-amount-row"><label className="amount-label">金额（CNY）<input name="amount" type="number" min="0.01" step="0.01" required inputMode="decimal" placeholder="0.00" autoFocus/></label><label>账户<select name="account" required disabled={accounts.length===0}>{accounts.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
          <p className="entry-time">记账时间自动使用北京时间：{formatShanghaiTimestamp(new Date().toISOString())}</p>
          <label>备注（选填）<input name="note" maxLength={500} placeholder="添加备注"/></label>
          {active.kind==='business'&&entryType==='income'&&<details className="optional-details"><summary>订单名称和业务类型（选填）</summary><label>订单名称<input name="orderTitle" maxLength={160}/></label><label>业务类型<input name="businessType" maxLength={80}/></label></details>}
          {active.kind==='business'&&entryType==='expense'&&<label>关联订单（选填）<select name="costOrder"><option value="">不关联订单</option>{orders.map(order=><option key={order.id} value={order.id}>{order.order_date} · {order.title||'未填写订单名称'}</option>)}</select></label>}
          <details className="optional-details"><summary>更多记账方式（转账 / 退款）</summary><label>类型<select value={entryType} onChange={event=>setEntryType(event.target.value as typeof entryType)}><option value="expense">支出</option><option value="income">收入</option><option value="transfer">内部转账</option>{active.kind==='business'&&<option value="refund">业务退款</option>}</select></label>{entryType==='transfer'&&<label>转入账户<select name="transferAccount" required>{accounts.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{entryType==='refund'&&<label>关联原订单<select name="refundOrder" required>{orders.map(order=><option key={order.id} value={order.id}>{order.order_date} · {order.title||'未填写订单名称'}</option>)}</select></label>}</details>
          {accounts.length===0&&<p className="error">还没有账户，请先在“资产”中添加账户。</p>}
          {(entryType==='income'||entryType==='expense')&&categories.filter(item=>item.flow===entryType).length===0&&<p className="error">暂无此类分类，请刷新页面后重试。</p>}
          <button className="save-quick-entry" disabled={busy||accounts.length===0||((entryType==='income'||entryType==='expense')&&(!selectedCategoryId||!categories.some(item=>item.id===selectedCategoryId&&item.flow===entryType)))||(entryType==='refund'&&orders.length===0)}>{busy?'正在保存…':'保存'}</button>
        </form>
      </section></div>}
      {active && editingTransaction && <div className="quick-entry-backdrop edit-transaction-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setEditingTransaction(null);}}><section className="quick-entry-sheet edit-transaction-sheet" role="dialog" aria-modal="true" aria-labelledby="edit-transaction-title">
        <form className="quick-entry-form" key={editingTransaction.id} onSubmit={event=>void updateTransaction(event)}>
          <div className="quick-entry-top"><button type="button" className="close-entry" aria-label="关闭修改" disabled={busy} onClick={()=>setEditingTransaction(null)}>×</button><h2 id="edit-transaction-title">修改{editingTransaction.type==='income'?'收入':editingTransaction.type==='expense'?'支出':editingTransaction.type==='transfer'?'转账':'退款'}</h2><span /></div>
          <p>修改后将同步重算余额、日历与统计；时间按北京时间保存。</p>
          <label>金额（CNY）<input name="amount" type="number" min="0.01" step="0.01" required inputMode="decimal" defaultValue={Number(editingTransaction.amount).toFixed(2)} /></label>
          <label>记账日期和时间（北京时间）<input name="occurred_at" type="datetime-local" step="60" required defaultValue={formatShanghaiInput(editingTransaction.occurred_at)} /></label>
          <label>账户<select name="account" required defaultValue={editingTransaction.account_id}>{accounts.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {(editingTransaction.type==='income'||editingTransaction.type==='expense')&&<label>分类<select name="category" required defaultValue={editingTransaction.category_id??''}>{categories.filter(item=>item.flow===editingTransaction.type).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          {editingTransaction.type==='transfer'&&<label>转入账户<select name="transferAccount" required defaultValue={editingTransaction.transfer_account_id??''}>{accounts.filter(item=>item.id!==editingTransaction.account_id).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <label>备注（选填）<input name="note" maxLength={500} defaultValue={editingTransaction.note} /></label>
          <button className="save-quick-entry" disabled={busy}>{busy?'正在保存…':'保存修改'}</button>
        </form>
      </section></div>}
    </>}
    {notice && <p className="notice" role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}
    <div className="sync-footer"><small role="status">{syncState}</small><button className="refresh secondary" disabled={busy || loading} onClick={() => void loadLedgers()}>刷新云端数据</button></div>
  </main>;
}
