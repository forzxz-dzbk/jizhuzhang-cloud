export type BackupRow = Record<string, unknown>;
export type BackupTables = Record<string, BackupRow[]>;
export const BACKUP_TABLES: readonly string[];
export function readAllRows(client: any, table: string, pageSize?: number): Promise<BackupRow[]>;
export function createCloudBackup(client: any, ownerId: string, exportedAt?: Date): Promise<{ format: string; version: number; exported_at: string; timezone: string; owner_id: string; tables: BackupTables }>;
export function validateCloudBackup(value: any, ownerId: string): BackupTables;
export function restoreCloudBackup(client: any, ownerId: string, value: any, confirmRestore: (count: number) => boolean, batchSize?: number): Promise<number | undefined>;
