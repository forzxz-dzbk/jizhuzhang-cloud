# 记祝账 Supabase 首次接入指引（当前只做项目准备）

## 你现在需要操作的部分

### 1. 创建独立 Supabase 项目

在 Supabase 控制台新建一个**全新项目**，名称建议 `jizhuzhang-prod`（或 `jizhuzhang-dev`），数据库区域优先选离你常用设备近的区域。不要复用或连接旧的 `balance-test`、`balance-guard-e2e` 或其他项目。妥善保存数据库密码，不要发到聊天。

### 2. 取得前端公开配置

在项目 Dashboard 的 **Connect** 对话框或 **Settings → API Keys** 获取：

- Project URL
- `sb_publishable_...` Publishable key（如暂时没有，旧 `anon` key 可临时兼容）

Publishable key 是浏览器端可用的项目标识；**不要获取或粘贴 `sb_secret_...` / `service_role` key 到前端**。Supabase 正在从旧 anon/service-role key 迁移到 publishable/secret key；本项目优先使用 Publishable key。[Supabase API keys 文档](https://supabase.com/docs/guides/getting-started/api-keys)

### 3. 写入本机环境文件

在项目根目录 `F:\AI\《记祝账》云端记账项目开发\06-云端候选`，复制 `.env.example` 为 `.env.local`，只在本机填入：

```dotenv
VITE_SUPABASE_URL=https://你的项目引用.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_你的公开key
```

不要把 `.env.local` 发到聊天、提交到 Git、放进截图或公开仓库。代码已将其加入 `.gitignore`。保存后你可以告诉我“本地配置已完成”，无需把 URL/key 发给我；我会在本机验证客户端能否初始化。

## 暂时不要做的事

- **不要运行** `supabase/migrations/0001_cloud_foundation.sql`。
- **不要运行** `supabase/operations/enable-realtime.sql`。
- 不导入任何真实财务数据，不连接旧项目，不改 Auth/RLS/数据库设置。

原因：本地 PGlite 已验证候选迁移的核心 SQL/RLS/业务约束，但还没有在真实 Supabase Auth/Postgres 上通过；且迁移目前是首版候选。你完成项目创建与本地环境准备后，我会先做只读连通性和部署前检查，再明确说明将要应用的迁移及其影响。在你确认目标项目确实是新建的记祝账项目后，才会进入数据库写入。

## 我负责的后续步骤

1. 验证 URL/key 指向你刚创建的隔离项目（不触碰任何其他项目）。
2. 复核并修订候选迁移，然后在**本地隔离数据库**跑完整业务/RLS 测试。
3. 给出将写入的对象清单与回退方案；再执行用户确认的首次 schema migration。
4. 执行 Realtime publication 配置，实际验证 Auth、RLS、多设备事件、订单/退款、固定支出确认。
5. 配置 Cloudflare Pages：本仓库候选工程的 Build command 为 `pnpm build`，Build output directory 为 `dist`；部署设置中的环境变量需配置上述 URL 与 Publishable key。[Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)

Cloudflare Pages 生产部署与本机开发要分别配置环境变量。正式域名确定后，再在 Supabase Auth 的 Site URL / Redirect URLs 中添加实际地址，并做邮箱验证登录测试。

## 当前状态

当前代码不含真实云凭据。`.env.example` 仅列变量名。未连接、未迁移、未部署、未写入任何 Supabase 项目。
