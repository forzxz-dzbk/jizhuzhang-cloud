import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const configurationError = !url || !publicKey
  ? '缺少必要配置：VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY。'
  : '';
export const supabase = configurationError ? null : createClient(url!, publicKey!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
