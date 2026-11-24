import { FormEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, configurationError } from './supabase';
import { LedgerHome } from './LedgerHome';

type Mode = 'signin' | 'signup' | 'recovery' | 'recovery_password';

export function AuthGate() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>('signin');

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (active) {
        if (error) setMessage(error.message);
        setSession(data.session);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setMode('recovery_password');
      setSession(next);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage('');
    if (!supabase) { setMessage(configurationError); return; }
    setBusy(true);
    try {
      const normalizedEmail = email.trim();
      // GitHub Pages serves this app below the repository path. Authentication
      // links must return to that base path, not the GitHub Pages domain root.
      const authRedirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
      if (mode === 'recovery') {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: authRedirectTo });
        if (error) throw error;
        setMessage('如该邮箱已注册，请查收密码重置邮件。');
      } else if (mode === 'recovery_password') {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          setMessage(`密码已更新，但自动退出失败：${signOutError.message}。请退出后使用新密码登录。`);
        } else {
          setMode('signin');
          setMessage('密码已更新，请使用新密码登录。');
        }
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password, options: { emailRedirectTo: authRedirectTo } });
        if (error) throw error;
        setMessage(data.session ? '账户已创建并登录。' : '账户创建请求已提交；如需邮箱验证，请检查收件箱。');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) throw error;
        setMessage('登录成功。云端数据访问仍须由数据库 RLS 策略保护。');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '认证操作失败，请稍后重试。'); }
    finally { setBusy(false); }
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setMessage(error?.message ?? '已退出登录。');
    setBusy(false);
  }

  async function resendConfirmation() {
    setMessage('');
    if (!supabase) { setMessage(configurationError); return; }
    const normalizedEmail = email.trim();
    if (!normalizedEmail) { setMessage('请先填写邮箱。'); return; }
    setBusy(true);
    try {
      const authRedirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: { emailRedirectTo: authRedirectTo },
      });
      if (error) throw error;
      setMessage('如该邮箱存在待验证账户，请查收新的确认邮件。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '确认邮件发送失败，请稍后重试。'); }
    finally { setBusy(false); }
  }

  if (configurationError) return <main className="card"><div className="brand">记祝账</div><h1>云端环境尚未配置</h1><p>{configurationError}</p><p>请在本地 .env.local 配置 Supabase URL 与 anon key。不要将 service role key 放入前端。</p></main>;
  if (session && mode !== 'recovery_password') return <LedgerHome session={session} onSignOut={signOut} />;

  const title = mode === 'signin' ? '登录你的账户' : mode === 'signup' ? '创建账户' : mode === 'recovery_password' ? '设置新密码' : '重置密码';
  return <main className="card"><div className="brand">记祝账</div><h1>{title}</h1><p>个人生活与 Mac 业务账本将严格分开。</p>
    <form onSubmit={submit}>
      {mode !== 'recovery_password' && <label>邮箱<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>}
      {mode !== 'recovery' && <label>密码<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label>}
      <button disabled={busy}>{busy ? '正在处理…' : title}</button>
    </form>
    <nav className="auth-links" aria-label="账户操作">
      <button className="link" onClick={()=>{setMode(mode === 'signin' ? 'signup' : 'signin');setMessage('');}}>{mode === 'signin' ? '创建账户' : '返回登录'}</button>
      {mode !== 'recovery' && mode !== 'recovery_password' && <button className="link" onClick={()=>{setMode('recovery');setMessage('');}}>忘记密码？</button>}
    </nav>
    {mode === 'signup' && <button className="link" type="button" disabled={busy} onClick={()=>void resendConfirmation()}>重新发送确认邮件</button>}
    {message && <p role="status">{message}</p>}
  </main>;
}
