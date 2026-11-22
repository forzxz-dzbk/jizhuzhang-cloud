import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const TABLES = [
  'ledgers',
  'accounts',
  'categories',
  'business_orders',
  'recurring_expenses',
  'transactions',
  'recurring_expense_instances',
] as const;

async function readAllRows(table: (typeof TABLES)[number]) {
  if (!supabase) throw new Error('云端服务未配置，无法创建备份。');
  const rows: Record<string, unknown>[] = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase.from(table).select('*').range(start, start + pageSize - 1);
    if (error) throw new Error(`${table}读取失败：${error.message}`);
    rows.push(...(data ?? []) as Record<string, unknown>[]);
    if (!data || data.length < pageSize) return rows;
  }
}

export function CloudBackup({ session }: { session: Session }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function exportBackup() {
    setBusy(true); setError(''); setNotice('');
    try {
      const tables = Object.fromEntries(await Promise.all(TABLES.map(async table => [table, await readAllRows(table)])));
      const backup = {
        format: 'jizhuzhang-cloud-backup',
        version: 1,
        exported_at: new Date().toISOString(),
        timezone: 'Asia/Shanghai',
        owner_id: session.user.id,
        tables,
      };
      const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `记祝账-云端备份-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      const count = Object.values(tables as Record<string, Record<string, unknown>[]>).reduce((total, rows) => total + rows.length, 0);
      setNotice(`云端备份已生成：${count} 条记录。请妥善保管此文件。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '云端备份失败，请稍后重试。');
    } finally { setBusy(false); }
  }

  return <section className="panel" aria-labelledby="backup-title">
    <h2 id="backup-title">云端数据备份</h2>
    <p>导出此账号的生活与业务账本、账户、分类、订单、固定支出及全部流水。未确认的固定支出仍保持待确认状态。</p>
    <button className="secondary" disabled={busy} onClick={() => void exportBackup()}>{busy ? '正在读取云端数据…' : '下载完整云端备份'}</button>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
