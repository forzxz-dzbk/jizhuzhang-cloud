import { existsSync, readFileSync } from 'node:fs';
const f=process.argv[2];
if(!existsSync(f)){console.log(JSON.stringify({exists:false,qqSmtp:false,port465:false,customSmtp:false,noCodeShare:false}));process.exit(0)}
const t=readFileSync(f,'utf8');const r={exists:true,qqSmtp:t.includes('smtp.qq.com'),port465:t.includes('465'),customSmtp:t.includes('SMTP Settings'),noCodeShare:t.includes('不要发到聊天')};console.log(JSON.stringify(r));process.exit(Object.values(r).every(Boolean)?0:1);
