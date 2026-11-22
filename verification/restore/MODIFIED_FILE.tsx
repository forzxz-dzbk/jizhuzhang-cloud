import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { stageRecurringInstances } from './backup-restore.mjs';

const TABLES = [
  'ledgers',
  'accounts',
  'categories',
  'business_orders',
  'recurring_expenses',
  'transactions',
  'recurring_expense_instances',
] as const;
type BackupTable = (typeof TABLES)[number];
type Backup = { format: string; version: number; owner_id: string; tables: Record<BackupTable, Record<string, unknown>[]> };
const CORE_RESTORE_ORDER: BackupTable[] = ['ledgers', 'accounts', 'categories', 'business_orders', 'recurring_expenses'];
const ROLLBACK_ORDER: BackupTable[] = [...CORE_RESTORE_ORDER, 'recurring_expense_instances', 'transactions'];

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

  async function restoreBackup(file: File) {
    const client = supabase;
    if (!client) throw new Error('云端服务未配置，无法恢复备份。');
    if (file.size > 100 * 1024 * 1024) throw new Error('备份文件超过 100 MB，请使用桌面端或拆分后再试。');
    const value = JSON.parse(await file.text()) as Partial<Backup>;
    if (value.format !== 'jizhuzhang-cloud-backup' || value.version !== 1 || value.owner_id !== session.user.id || !value.tables) {
      throw new Error('备份格式、版本或所属账号不匹配；只能恢复此账号导出的备份。');
    }
    for (const table of TABLES) {
      if (!Array.isArray(value.tables[table]) || value.tables[table].some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
        throw new Error(`备份中的 ${table} 数据格式无效。`);
      }
    }
    if (value.tables.ledgers.some(row => row.owner_id !== session.user.id)) throw new Error('备份账本所属账号不一致。');
    const tables = value.tables as Backup['tables'];
    for (const table of TABLES) {
      const { data, error } = await client.from(table).select('id').limit(1);
      if (error) throw new Error(`恢复前检查 ${table} 失败：${error.message}`);
      if (data?.length) throw new Error('为避免覆盖或混合现有数据，恢复仅允许在此账号所有账本均为空时执行。');
    }
    if (!window.confirm(`即将恢复 ${Object.values(tables).reduce((n, rows) => n + rows.length, 0)} 条备份记录到空账号。此操作不可撤销，是否继续？`)) return;

    const inserted: Partial<Record<BackupTable, string[]>> = {};
    try {
      const insertRows = async (table: BackupTable, rows: Record<string, unknown>[]) => {
        for (let start = 0; start < rows.length; start += 100) {
          const chunk = rows.slice(start, start + 100);
          const { error } = await client.from(table).insert(chunk);
          if (error) throw new Error(`${table}写入失败：${error.message}`);
          inserted[table] = [...(inserted[table] ?? []), ...chunk.map(row => String(row.id))];
        }
      };
      for (const table of CORE_RESTORE_ORDER) await insertRows(table, tables[table]);

      // The schema has reciprocal FKs: transactions.recurring_instance_id ->
      // instances.id, and instances.transaction_id -> transactions.id. Stage
      // instances as pending, insert the transactions, then restore confirmed state.
      await insertRows('recurring_expense_instances', stageRecurringInstances(tables.recurring_expense_instances));
      await insertRows('transactions', tables.transactions);
      const confirmedInstances = tables.recurring_expense_instances.filter(row => row.status === 'confirmed');
      for (let start = 0; start < confirmedInstances.length; start += 100) {
        const chunk = confirmedInstances.slice(start, start + 100);
        const { error } = await client.from('recurring_expense_instances').upsert(chunk, { onConflict: 'id' });
        if (error) throw new Error(`已确认固定支出恢复失败：${error.message}`);
      }
    } catch (cause) {
      const rollbackErrors: string[] = [];
      for (const table of [...ROLLBACK_ORDER].reverse()) {
        const ids = inserted[table];
        if (!ids?.length) continue;
        const { error } = await client.from(table).delete().in('id', ids);
        if (error) rollbackErrors.push(`${table}回滚失败：${error.message}`);
      }
      const detail = cause instanceof Error ? cause.message : '未知错误';
      throw new Error(rollbackErrors.length ? `恢复未完成：${detail}；${rollbackErrors.join('；')}。请勿重复操作，先联系支持。` : `恢复失败，已尝试撤销本次写入：${detail}`);
    }
    return Object.values(tables).reduce((n, rows) => n + rows.length, 0);
  }

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
    <label>从本账号备份恢复（仅允许空账本）<input type="file" accept="application/json,.json" disabled={busy} onChange={event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
      if (!file) return;
      setBusy(true); setError(''); setNotice('');
      void restoreBackup(file).then(count => { if (count !== undefined) setNotice(`备份恢复完成：${count} 条记录。请刷新云端数据。`); })
        .catch(cause => setError(cause instanceof Error ? cause.message : '恢复失败，请检查备份文件后重试。'))
        .finally(() => setBusy(false));
    }}/></label>
  </section>;
}
