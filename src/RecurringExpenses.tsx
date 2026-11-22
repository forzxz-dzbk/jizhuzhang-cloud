import { FormEvent, useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

type Account = { id: string; name: string };
type Category = { id: string; name: string; flow: 'income'|'expense' };
type Template = { id: string; name: string; amount: number; due_day: number; active: boolean };
type Instance = { id: string; recurring_expense_id: string; due_on: string; status: 'pending'|'confirmed'; transaction_id: string|null };
const shanghaiMonth = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());

export function RecurringExpenses({ ledgerId, accounts, categories, onConfirmed }: { ledgerId: string; accounts: Account[]; categories: Category[]; onConfirmed: () => Promise<void> }) {
  const [templates,setTemplates]=useState<Template[]>([]);
  const [instances,setInstances]=useState<Instance[]>([]);
  const [month,setMonth]=useState(shanghaiMonth());
  const [name,setName]=useState('');
  const [amount,setAmount]=useState('');
  const [dueDay,setDueDay]=useState('1');
  const [requestIds,setRequestIds]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [busyInstance,setBusyInstance]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const refresh=useCallback(async()=>{
    if(!supabase)return;
    const [t,i]=await Promise.all([
      supabase.from('recurring_expenses').select('id,name,amount,due_day,active').eq('ledger_id',ledgerId).order('name'),
      supabase.from('recurring_expense_instances').select('id,recurring_expense_id,due_on,status,transaction_id').eq('ledger_id',ledgerId).order('due_on',{ascending:false}).limit(60),
    ]);
    if(t.error||i.error)setError(`固定支出读取失败：${t.error?.message??i.error?.message}`);
    else {setTemplates((t.data??[]) as Template[]);setInstances((i.data??[]) as Instance[]);}
  },[ledgerId]);
  useEffect(()=>{void refresh();},[refresh]);

  async function addTemplate(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!supabase)return;setBusy(true);setError('');setNotice('');
    const {error:e1}=await supabase.from('recurring_expenses').insert({ledger_id:ledgerId,name:name.trim(),amount:Number(amount),due_day:Number(dueDay)});
    if(e1)setError(`计划保存失败：${e1.message}`);else{setName('');setAmount('');setDueDay('1');setNotice('固定支出计划已保存；尚未计入实际支出。');await refresh();}
    setBusy(false);
  }
  async function generate(){
    if(!supabase)return;setBusy(true);setError('');setNotice('');
    const {data,error:e1}=await supabase.rpc('generate_recurring_instances',{p_ledger_id:ledgerId,p_month:`${month}-01`});
    if(e1)setError(`待确认账单生成失败：${e1.message}`);else{setNotice(`已新增 ${data} 条待确认账单（重复生成不会重复记账）。`);await refresh();}
    setBusy(false);
  }
  async function confirm(e:FormEvent<HTMLFormElement>,instance:Instance){
    e.preventDefault();if(!supabase)return;const form=new FormData(e.currentTarget);const id=requestIds[instance.id]??crypto.randomUUID();
    if(!requestIds[instance.id])setRequestIds(current=>({...current,[instance.id]:id}));
    setBusyInstance(instance.id);setError('');setNotice('');
    const {error:e1}=await supabase.rpc('confirm_recurring_instance',{
      p_instance_id:instance.id,p_request_id:id,p_account_id:String(form.get('account')),
      p_category_id:String(form.get('category')),p_actual_amount:Number(form.get('actualAmount')),
      p_confirmed_on:String(form.get('actualDate')),p_note:String(form.get('note')??''),
    });
    if(e1)setError(`确认失败，未标记为已支出：${e1.message}`);
    else{setRequestIds(current=>{const next={...current};delete next[instance.id];return next;});setNotice('账单已确认，实际金额已计入支出。');await refresh();await onConfirmed();}
    setBusyInstance('');
  }

  const templateById=new Map(templates.map(t=>[t.id,t]));
  const expenseCategories=categories.filter(c=>c.flow==='expense');
  const pending=instances.filter(i=>i.status==='pending');
  return <section className="panel recurring-panel">
    <h2>固定支出 · 计划与实际分开</h2>
    <form className="setup-grid" onSubmit={addTemplate}>
      <label>计划名称<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="例如：房租"/></label>
      <label>计划金额<input required type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
      <label>每月到期日<input required type="number" min="1" max="31" value={dueDay} onChange={e=>setDueDay(e.target.value)}/></label>
      <button disabled={busy}>保存计划</button>
    </form>
    <div className="generate-row"><label>账单月份<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button disabled={busy||templates.length===0} onClick={()=>void generate()}>生成本月待确认账单</button></div>
    {templates.length===0&&<p className="empty">尚无固定支出计划。</p>}
    {pending.length===0&&instances.length>0&&<p>当前账单均已确认。</p>}
    {pending.map(instance=>{const template=templateById.get(instance.recurring_expense_id);return <article className="pending-card" key={instance.id}>
      <div><strong>{template?.name??'固定支出'}</strong><span> 计划 ¥{Number(template?.amount??0).toFixed(2)} · 到期 {instance.due_on} · 待确认</span></div>
      <form className="confirm-row" onSubmit={e=>void confirm(e,instance)}>
        <label>实际金额<input name="actualAmount" type="number" min="0.01" step="0.01" required defaultValue={template?.amount}/></label>
        <label>实际扣款日<input name="actualDate" type="date" required defaultValue={instance.due_on}/></label>
        <label>账户<select name="account" required>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>支出分类<select name="category" required>{expenseCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>备注<input name="note" maxLength={500}/></label>
        <button disabled={busyInstance===instance.id||accounts.length===0||expenseCategories.length===0}>{busyInstance===instance.id?'确认中…':'确认并记为实际支出'}</button>
      </form>
      {(accounts.length===0||expenseCategories.length===0)&&<p className="error">确认前需先添加账户和支出分类。</p>}
    </article>;})}
    {notice&&<p className="notice" role="status">{notice}</p>}{error&&<p className="error" role="alert">{error}</p>}
  </section>;
}
