import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { calculateAccountBalances } from './account-balance.mjs';

type Account = { id: string; name: string; opening_balance: number | string };
type Goal = { id: string; ledger_id: string; account_id: string; name: string; target_amount: number | string; target_date: string | null; is_archived: boolean };
type Transaction = { id: string; type: string; amount: number | string; account_id: string; transfer_account_id: string | null };
const PAGE_SIZE = 500;

export function SavingsGoals({ ledgerId, accounts }: { ledgerId: string; accounts: Account[] }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!supabase) return;
    setLoading(true); setError('');
    try {
      const [goalResult, firstPage] = await Promise.all([
        supabase.from('savings_goals').select('id,ledger_id,account_id,name,target_amount,target_date,is_archived').eq('ledger_id', ledgerId).order('created_at', { ascending: false }),
        supabase.from('transactions').select('id,type,amount,account_id,transfer_account_id').eq('ledger_id', ledgerId).order('id').limit(PAGE_SIZE),
      ]);
      if (goalResult.error) throw new Error(`储蓄目标读取失败：${goalResult.error.message}`);
      if (firstPage.error) throw new Error(`储蓄账户流水读取失败：${firstPage.error.message}`);
      const transactions = [...(firstPage.data ?? [])] as Transaction[];
      let afterId = transactions.length === PAGE_SIZE ? transactions.at(-1)!.id : '';
      while (afterId) {
        const { data, error: pageError } = await supabase.from('transactions')
          .select('id,type,amount,account_id,transfer_account_id').eq('ledger_id', ledgerId).gt('id', afterId).order('id').limit(PAGE_SIZE);
        if (pageError) throw new Error(`储蓄账户流水读取失败：${pageError.message}`);
        const page = (data ?? []) as Transaction[];
        transactions.push(...page);
        afterId = page.length === PAGE_SIZE ? page.at(-1)!.id : '';
      }
      setGoals((goalResult.data ?? []) as Goal[]);
      setBalances(calculateAccountBalances(accounts, transactions));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '储蓄目标读取失败，请检查网络后重试。');
    } finally { setLoading(false); }
  }, [ledgerId, accounts]);

  useEffect(() => {
    void refresh();
    const client = supabase;
    if (!client) return;
    const channel = client.channel(`savings-goals-${ledgerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings_goals', filter: `ledger_id=eq.${ledgerId}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `ledger_id=eq.${ledgerId}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: `ledger_id=eq.${ledgerId}` }, () => void refresh())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [ledgerId, refresh]);

  const activeGoals = useMemo(() => goals.filter(goal => !goal.is_archived), [goals]);
  const linkedAccountIds = useMemo(() => new Set(activeGoals.map(goal => goal.account_id)), [activeGoals]);

  async function addGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amountText = String(form.get('target_amount') ?? '').trim();
    const amount = Number(amountText);
    if (!amountText || !Number.isFinite(amount) || amount <= 0 || amount >= 1_000_000_000_000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8) {
      setError('目标金额必须大于 0，最多两位小数。'); return;
    }
    setBusy(true); setError(''); setNotice('');
    const { error: saveError } = await supabase.from('savings_goals').insert({
      ledger_id: ledgerId,
      account_id: String(form.get('account_id') ?? ''),
      name: String(form.get('name') ?? '').trim(),
      target_amount: amount,
      target_date: String(form.get('target_date') ?? '') || null,
    });
    if (saveError) setError(`储蓄目标保存失败：${saveError.message}`);
    else { setNotice('储蓄目标已保存到云端，进度按专用账户实际余额计算。'); formElement.reset(); await refresh(); }
    setBusy(false);
  }

  async function archive(goal: Goal) {
    if (!supabase) return;
    setBusy(true); setError(''); setNotice('');
    const { error: updateError } = await supabase.from('savings_goals').update({ is_archived: true }).eq('id', goal.id).eq('ledger_id', ledgerId);
    if (updateError) setError(`目标归档失败：${updateError.message}`);
    else { setNotice(`“${goal.name}”已归档，实际账户余额和流水未改变。`); await refresh(); }
    setBusy(false);
  }

  return <section className="panel savings-panel" aria-labelledby="savings-title">
    <h2 id="savings-title">存钱目标</h2>
    <p>每个目标绑定一个专用账户，进度取该账户的实际余额（期初余额 + 实际流水与内部转账）。目标只是计划，不会创建流水或计入收支统计。</p>
    <form className="savings-form" onSubmit={event => void addGoal(event)}>
      <label>目标名称<input name="name" required maxLength={100} placeholder="例如：应急备用金"/></label>
      <label>目标金额（CNY）<input name="target_amount" type="number" min="0.01" step="0.01" required/></label>
      <label>目标日期（可选）<input name="target_date" type="date"/></label>
      <label>专用储蓄账户<select name="account_id" required disabled={accounts.length === 0}>
        {accounts.filter(account => !linkedAccountIds.has(account.id)).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select></label>
      <button disabled={busy || accounts.length === 0 || accounts.every(account => linkedAccountIds.has(account.id))}>创建目标</button>
    </form>
    {accounts.length === 0 && <p className="empty">先创建一个专用储蓄账户，再设置目标。</p>}
    {accounts.length > 0 && accounts.every(account => linkedAccountIds.has(account.id)) && <p className="empty">每个现有账户都已绑定目标。如需新目标，请先新增一个专用储蓄账户。</p>}
    {loading && <p role="status">正在读取云端目标及账户流水…</p>}
    {!loading && activeGoals.length === 0 && <p className="empty">尚无存钱目标；创建后进度会根据真实账户余额更新。</p>}
    {activeGoals.map(goal => {
      const account = accounts.find(item => item.id === goal.account_id);
      const currentCents = balances.get(goal.account_id) ?? Math.round(Number(account?.opening_balance ?? 0) * 100);
      const targetCents = Math.round(Number(goal.target_amount) * 100);
      const progress = targetCents > 0 ? Math.min(100, Math.max(0, Math.floor(Math.max(0, currentCents) / targetCents * 100))) : 0;
      const accountName = account?.name ?? '账户不可用';
      return <article className="savings-goal" key={goal.id}>
        <div className="savings-goal-heading"><strong>{goal.name}</strong><span>{goal.target_date ? `目标日期 ${goal.target_date}` : '未设目标日期'}</span></div>
        <div className="savings-progress" role="progressbar" aria-label={`${goal.name}进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }}/></div>
        <div className="savings-goal-stats"><span>{accountName}余额：¥{(currentCents / 100).toFixed(2)}</span><strong>目标 ¥{Number(goal.target_amount).toFixed(2)} · {progress}%</strong></div>
        {progress >= 100 && <small className="goal-hit">目标已达成</small>}
        <button className="secondary" disabled={busy} onClick={() => void archive(goal)}>归档目标</button>
      </article>;
    })}
    {goals.filter(goal => goal.is_archived).map(goal => <p className="savings-archived" key={goal.id}>已归档：{goal.name} · 原目标 ¥{Number(goal.target_amount).toFixed(2)}</p>)}
    {notice && <p className="notice" role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}
    <button className="secondary" disabled={busy || loading} onClick={() => void refresh()}>刷新目标</button>
  </section>;
}
