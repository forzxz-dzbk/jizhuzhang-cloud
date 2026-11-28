import { stageRecurringInstances } from './backup-restore.mjs';

export const BACKUP_TABLES = [
  'ledgers',
  'accounts',
  'categories',
  'business_orders',
  'recurring_expenses',
  'transactions',
  'recurring_expense_instances',
  'savings_goals',
  'business_daily_goal_settings',
];

const CORE_RESTORE_ORDER = ['ledgers', 'business_daily_goal_settings', 'accounts', 'categories', 'business_orders', 'recurring_expenses', 'savings_goals'];
const ROLLBACK_ORDER = [...CORE_RESTORE_ORDER, 'recurring_expense_instances', 'transactions'];

export async function readAllRows(client, table, pageSize = 500) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client.from(table).select('*').range(start, start + pageSize - 1);
    if (error) throw new Error(`${table}读取失败：${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function createCloudBackup(client, ownerId, exportedAt = new Date()) {
  const tables = Object.fromEntries(await Promise.all(BACKUP_TABLES.map(async table => [table, await readAllRows(client, table)])));
  return {
    format: 'jizhuzhang-cloud-backup',
    version: 1,
    exported_at: exportedAt.toISOString(),
    timezone: 'Asia/Shanghai',
    owner_id: ownerId,
    tables,
  };
}

export function validateCloudBackup(value, ownerId) {
  if (!value || value.format !== 'jizhuzhang-cloud-backup' || value.version !== 1 || value.owner_id !== ownerId || !value.tables || typeof value.tables !== 'object') {
    throw new Error('备份格式、版本或所属账号不匹配；只能恢复此账号导出的备份。');
  }
  const tables = { ...value.tables };
  // Backward-compatible with version-1 exports created before goal settings existed.
  if (tables.business_daily_goal_settings === undefined) tables.business_daily_goal_settings = [];
  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(tables[table]) || tables[table].some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error(`备份中的 ${table} 数据格式无效。`);
    }
  }
  if (tables.ledgers.some(row => row.owner_id !== ownerId)) throw new Error('备份账本所属账号不一致。');
  return tables;
}

export async function restoreCloudBackup(client, ownerId, value, confirmRestore, batchSize = 100) {
  const tables = validateCloudBackup(value, ownerId);
  for (const table of BACKUP_TABLES) {
    const { data, error } = await client.from(table).select('id').limit(1);
    if (error) throw new Error(`恢复前检查 ${table} 失败：${error.message}`);
    if (data?.length) throw new Error('为避免覆盖或混合现有数据，恢复仅允许在此账号所有账本均为空时执行。');
  }
  const total = Object.values(tables).reduce((n, rows) => n + rows.length, 0);
  if (!confirmRestore(total)) return undefined;

  const inserted = {};
  try {
    const insertRows = async (table, rows) => {
      for (let start = 0; start < rows.length; start += batchSize) {
        const chunk = rows.slice(start, start + batchSize);
        const { error } = await client.from(table).insert(chunk);
        if (error) throw new Error(`${table}写入失败：${error.message}`);
        inserted[table] = [...(inserted[table] ?? []), ...chunk.map(row => String(row.id))];
      }
    };
    for (const table of CORE_RESTORE_ORDER) await insertRows(table, tables[table]);
    // The schema has reciprocal FKs: stage instances, insert transactions, then finalize confirmation state.
    await insertRows('recurring_expense_instances', stageRecurringInstances(tables.recurring_expense_instances));
    await insertRows('transactions', tables.transactions);
    const confirmedInstances = tables.recurring_expense_instances.filter(row => row.status === 'confirmed');
    for (let start = 0; start < confirmedInstances.length; start += batchSize) {
      const chunk = confirmedInstances.slice(start, start + batchSize);
      const { error } = await client.from('recurring_expense_instances').upsert(chunk, { onConflict: 'id' });
      if (error) throw new Error(`已确认固定支出恢复失败：${error.message}`);
    }
  } catch (cause) {
    const rollbackErrors = [];
    for (const table of [...ROLLBACK_ORDER].reverse()) {
      const ids = inserted[table];
      if (!ids?.length) continue;
      const { error } = await client.from(table).delete().in('id', ids);
      if (error) rollbackErrors.push(`${table}回滚失败：${error.message}`);
    }
    const detail = cause instanceof Error ? cause.message : '未知错误';
    throw new Error(rollbackErrors.length ? `恢复未完成：${detail}；${rollbackErrors.join('；')}。请勿重复操作，先联系支持。` : `恢复失败，已尝试撤销本次写入：${detail}`);
  }
  return total;
}
