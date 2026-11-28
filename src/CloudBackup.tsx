import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { createCloudBackup, restoreCloudBackup } from './cloud-backup-core.mjs';

export function CloudBackup({ session }: { session: Session }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function restoreBackup(file: File) {
    const client = supabase;
    if (!client) throw new Error('云端服务未配置，无法恢复备份。');
    if (file.size > 100 * 1024 * 1024) throw new Error('备份文件超过 100 MB，请使用桌面端或拆分后再试。');
    const value = JSON.parse(await file.text());
    return restoreCloudBackup(client, session.user.id, value, count => window.confirm(`即将恢复 ${count} 条备份记录到空账号。此操作不可撤销，是否继续？`));
  }

  async function exportBackup() {
    setBusy(true); setError(''); setNotice('');
    try {
      if (!supabase) throw new Error('云端服务未配置，无法创建备份。');
      const backup = await createCloudBackup(supabase, session.user.id);
      const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `记祝账-云端备份-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      const count = Object.values(backup.tables).reduce((total, rows) => total + rows.length, 0);
      setNotice(`云端备份已生成：${count} 条记录。请妥善保管此文件。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '云端备份失败，请稍后重试。');
    } finally { setBusy(false); }
  }

  return <section className="panel" aria-labelledby="backup-title">
    <h2 id="backup-title">云端数据备份</h2>
    <p>导出此账号的支出与收入账本、每日目标设置、账户、分类、订单、固定支出、存钱目标及全部流水。未确认的固定支出仍保持待确认状态。</p>
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
