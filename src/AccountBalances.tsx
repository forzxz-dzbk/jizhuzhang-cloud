import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { calculateAccountBalances } from './account-balance.mjs';

type Account = { id: string; name: string; opening_balance: number | string };
const PAGE_SIZE = 500;

export function AccountBalances({ ledgerId, accounts }: { ledgerId: string; accounts: Account[] }) {
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const client = supabase;
    if (!client || accounts.length === 0) {
      setBalances(new Map()); setLoading(false); setError('');
      return () => { requestSequence.current += 1; };
    }
    setLoading(true); setError('');
    void (async () => {
      try {
        const transactions: { type: string; amount: number | string; account_id: string; transfer_account_id: string | null; id: string }[] = [];
        let afterId = '';
        for (;;) {
          let query = client.from('transactions').select('id,type,amount,account_id,transfer_account_id')
            .eq('ledger_id', ledgerId).order('id').limit(PAGE_SIZE);
          if (afterId) query = query.gt('id', afterId);
          const { data, error: queryError } = await query;
          if (queryError) throw new Error(queryError.message);
          const page = data ?? [];
          transactions.push(...page as typeof transactions);
          if (page.length < PAGE_SIZE) break;
          afterId = page[page.length - 1].id;
        }
        if (requestId !== requestSequence.current) return;
        setBalances(calculateAccountBalances(accounts, transactions));
      } catch (cause) {
        if (requestId === requestSequence.current) setError(`账户余额读取失败：${cause instanceof Error ? cause.message : '网络错误'}`);
      } finally {
        if (requestId === requestSequence.current) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [ledgerId, accounts]);

  return <section className="account-balances" aria-label="账户余额">
    <h3>账户余额</h3>
    <p>按期初余额加实际收入、减实际支出和退款，并计入内部转账；待确认账单不参与计算。</p>
    {loading && <small role="status">正在读取全部流水计算余额…</small>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && accounts.length === 0 && <p className="empty">请先添加账户。</p>}
    {!loading && !error && accounts.length > 0 && <ul>{accounts.map(account => <li key={account.id}><span>{account.name}</span><strong>¥{((balances.get(account.id) ?? Number(account.opening_balance) * 100) / 100).toFixed(2)}</strong></li>)}</ul>}
  </section>;
}
