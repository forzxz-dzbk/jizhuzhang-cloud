/**
 * Break the transactions <-> recurring instances foreign-key cycle during restore.
 * A confirmed instance is first inserted as pending; its transaction is restored
 * next, then the original confirmed state is restored in a final upsert.
 */
export function stageRecurringInstances(rows) {
  return rows.map(row => row.status === 'confirmed'
    ? { ...row, status: 'pending', transaction_id: null, confirmed_at: null }
    : { ...row });
}
