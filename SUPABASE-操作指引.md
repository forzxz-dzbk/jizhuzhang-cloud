# 记祝账 Supabase 操作指引

## 当前真实状态

- 本地候选已配置 Supabase 项目 URL 和浏览器安全的 Publishable key；Auth health 曾返回 HTTP 200。不要把 key、数据库密码或任何 `service_role` / `sb_secret_...` 密钥发到聊天或提交到 Git。
- 你此前确认核心迁移 `0001_cloud_foundation.sql` 与 Realtime SQL 均已执行成功。**不要再次运行 0001**，它不是可重复执行的初始化脚本。
- 新版本所需的 `0002_business_order_costs_and_types.sql` 是新增列、约束、函数和视图的事务式增量迁移；本地 PGlite 已通过生活/业务分账、订单退款、订单成本、经营结余、RLS 和幂等写入测试。它尚未应用到托管项目。

## 应用新增业务订单迁移（仅需一次）

1. 登录 Supabase Dashboard，打开你之前为「记祝账」创建的**新项目**。不要选择 `balance-test`、`balance-guard-e2e` 或其他旧项目。
2. 左侧进入 **SQL Editor**，点击 **New query**。
3. 在本机打开：`F:\AI\《记祝账》云端记账项目开发\06-云端候选\supabase\migrations\0002_business_order_costs_and_types.sql`，全选并复制。
4. 粘贴到 SQL Editor，确认当前项目后点击 **Run**。
5. 正常成功通常显示 `Success. No rows returned`：这是建列/函数/视图的 DDL 迁移，不会返回账目行。完成后只需告诉我“0002 成功”即可；失败时把错误文本发我，**不要改跑 0001**。

迁移会为既有订单标记“未分类”，不会伪造业务类型或财务金额；订单成本沿用真实业务支出流水，可选关联具体订单。个人账本不允许写入业务订单或业务成本。

## 正式部署（待外部仓库/账号授权）

本地 Git 已初始化并有提交，但没有 GitHub remote、Vercel CLI 或部署令牌。GitHub 新建空的私有仓库后，把仓库 URL 提供给项目执行环境；不要在聊天中提供账号密码或 Supabase 密钥。Vercel 环境变量只需配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`，绝不能配置高权限数据库密钥。

部署完成后，再把正式域名加入 Supabase Auth 的 Site URL 与 Redirect URLs，并实测登录、密码恢复、跨设备同步、备份和恢复。真实备份恢复尚未在线验收前，不要把生产唯一数据作为恢复试验对象。
