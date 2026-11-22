# 记祝账 Supabase 操作指引

## 当前真实状态

- 本地候选已配置 Supabase 项目 URL 和浏览器安全的 Publishable key；Auth health 曾返回 HTTP 200。不要把 key、数据库密码或任何 `service_role` / `sb_secret_...` 密钥发到聊天或提交到 Git。
- 你此前确认核心迁移 `0001_cloud_foundation.sql` 与 Realtime SQL 均已执行成功。**不要再次运行 0001**，它不是可重复执行的初始化脚本。
- 新版本所需的 `0002_business_order_costs_and_types.sql` 是新增列、约束、函数和视图的增量迁移；本地 PGlite 已通过生活/业务分账、订单退款、订单成本、经营结余、RLS 和幂等写入测试。最新云端检查确认 `business_orders.business_type`、`transactions.cost_order_id`、`business_order_totals`、两个业务 RPC 均存在，且业务订单表已启用 RLS。

## Hosted SQL 迁移状态

- `0001_cloud_foundation.sql`：核心架构曾成功执行；绝不要重跑。
- `0002_business_order_costs_and_types.sql`：已在新建的空白 SQL 查询中执行并返回 `Success. No rows returned`；只读核验已确认新增列、视图、两个业务 RPC 和业务订单 RLS。早先 `42601` 错误来自旧查询内容。
- `0003_daily_goal_by_received_date.sql`：你刚报告在 SQL Editor 得到 `Success. No rows returned`，按已执行记录；随后已完成独立只读 schema 核验：只返回 revenue_date 和 security_invoker=true，过滤条件未发现 order_date。该修正令 ¥500 目标按收入流水实际到账日 `transactions.occurred_on` 统计，而非业务订单创建日；退款仍按实际退款日扣减。**不要盲目重跑 0003**。

## Hosted 迁移状态已完成

此前 SQL Editor 的旧错误记录已被后续成功执行及只读核验 supersede。0002 和 0003 均已在项目“记祝账”中独立验证；不要重复执行，尤其绝不要重跑 0001。

## 操作约束

0002 与 0003 均已在正确的 Supabase 项目执行并通过独立元数据核验。当前不需要你再复制 SQL、输入数据库密码或手动重跑迁移。只读核验不触及任何账务行。若将来发生 schema 改动，先按新增迁移编号执行并核验，绝不重放 0001。

当前迁移状态已验证完成；下方脚本仅作为将来诊断记录，不是当前操作步骤。除非新的一次只读核验确认数据库偏离且先做了备份，否则不要运行或粘贴迁移 SQL。

迁移会为既有订单标记“未分类”，不会伪造业务类型或财务金额；订单成本沿用真实业务支出流水，可选关联具体订单。个人账本不允许写入业务订单或业务成本。

## 正式部署（待外部仓库/账号授权）

本地 Git 已初始化并有提交，但没有 GitHub remote、Vercel CLI 或部署令牌。GitHub 新建空的私有仓库后，把仓库 URL 提供给项目执行环境；不要在聊天中提供账号密码或 Supabase 密钥。Vercel 环境变量只需配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`，绝不能配置高权限数据库密钥。

部署完成后，再把正式域名加入 Supabase Auth 的 Site URL 与 Redirect URLs，并实测登录、密码恢复、跨设备同步、备份和恢复。真实备份恢复尚未在线验收前，不要把生产唯一数据作为恢复试验对象。
