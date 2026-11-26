# 记祝账：Supabase 邮件投递配置

## 当前现象
记祝账的 Supabase Auth 已启用邮箱确认。Supabase 默认邮件服务仅向 Supabase 组织成员邮箱发送，且整个项目默认每小时最多发送 2 封。收到“已提交重发”不等于邮件已送达。

## 用 QQ 邮箱配置自定义 SMTP
> 授权码只输入 QQ 邮箱和 Supabase 控制台。不要发到聊天、截图或代码仓库；不要使用 QQ 登录密码。

1. QQ 邮箱网页端 → 设置 → 账户，开启 SMTP（服务项可能显示为 IMAP/SMTP），生成第三方客户端授权码。
2. Supabase Dashboard 选择“记祝账”项目 → Authentication → SMTP Settings，启用自定义 SMTP。
3. 发件人名称：记祝账；发件人邮箱：同一个 QQ 邮箱；SMTP 主机：`smtp.qq.com`；端口：`465`；安全连接：SSL/TLS；用户名：完整 QQ 邮箱；密码：刚生成的授权码。
4. 保存设置。保留回跳 URL：`https://forzxz-dzbk.github.io/jizhuzhang-cloud/`。不要修改数据库迁移、RLS 或账本数据。
5. 回到记祝账“创建账户”页，只重发一次确认邮件；检查垃圾邮件，只用最新邮件里的链接。

## 故障判断
- `over_email_send_rate_limit` / `email rate limit exceeded`：发送频率超限；默认服务每项目目前 2 封/小时，自定义 SMTP 也可能受供应商限额约束。
- `email_address_not_authorized`：默认服务不向该邮箱发送；配置自定义 SMTP 后再试。
- 页面提示已提交但邮箱无信：通用提示不是送达回执；查看 Supabase Auth 日志和 SMTP 供应商发送记录。
- `otp_expired`：旧链接已过期，只重发一次并使用最新邮件。

## 从 Supabase 日志定位（不要连续点重发）
1. 登录 Supabase Dashboard，打开「记祝账」项目 → **Logs / Logs Explorer**，选择 **Auth logs**，把时间范围设为最近 1 小时，查找 `signup`、`resend`、`email`、`smtp` 或错误码。
2. 若日志显示限流或 SMTP 连接/认证错误，先修 SMTP 配置；不要关闭邮箱确认来规避问题。
3. 若 Auth 日志显示已交给邮件服务且没有错误，到发件平台查投递事件、退信/抑制列表和收件人地址；Supabase 交接后无法保证邮件进入收件箱。
4. 重发只做一次并记录页面的错误码/时间；若成功提示但仍无邮件，同时查垃圾箱、QQ 邮箱拦截/黑名单。

**当前项目线上配置尚待核实**：页面提示“请求已提交”不能证明 SMTP 已启用，也不能证明邮件已送达。先看日志再决定修复还是换发件服务，不要反复发送造成限流。

参考：
- Supabase SMTP：https://supabase.com/docs/guides/auth/auth-smtp
- Supabase 限额：https://supabase.com/docs/guides/auth/rate-limits
- Supabase 未收到 Auth 邮件排障：https://supabase.com/kb/troubleshooting/not-receiving-auth-emails-from-the-supabase-project-OFSNzw
- QQ 授权码：https://consumer.huawei.com/cn/support/content/zh-cn16108643/
