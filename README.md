# 记祝账 · 云端候选

React + TypeScript + Vite client using Supabase Auth, Postgres, RLS, RPCs, and Realtime. This is the cloud-first candidate intended to replace the local-only MVP; it is not yet a formally deployed production service.

## Current delivery status (2026-11-24)

- Supabase project is connected through local `.env.local` using only the browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never add a service-role key to client configuration or source control.
- The core migration was applied in the Supabase Dashboard. The owner's first re-run failed with `42P07 relation "ledgers" already exists`; do not run `0001_cloud_foundation.sql` again. A read-only audit reported all seven business tables, both views, RLS enabled on all seven tables, seven owner policies, six SECURITY INVOKER functions, three triggers, and `security_invoker=true` on both views.
- `supabase/operations/enable-realtime.sql` was run in the Dashboard; the owner reported `Success. No rows returned`.
- No real financial transactions or demo financial data have been inserted.
- Latest local evidence: `pnpm test` (24/24), `pnpm test:db` (pass for migrations 0001–0003 and business/RLS/restore flows), `pnpm build` (pass), and `pnpm audit --prod` (no known vulnerabilities).
- `0002_business_order_costs_and_types.sql` was executed in a fresh query and returned `Success. No rows returned`. A subsequent read-only metadata query confirmed `business_orders.business_type`, `transactions.cost_order_id`, `business_order_totals`, both business RPCs, and RLS enabled on `business_orders`.

## Implemented

- Email/password sign-in, sign-up, password recovery, persisted-session restoration, and sign-out.
- Separate personal and Mac-business ledgers; ledger, account, category, and transaction views.
- Server-side note search and page navigation across the full ledger history; literal `%`, `_`, and `\` are escaped rather than interpreted as search wildcards.
- Transaction history shows account, category and linked business order (including transfers/refunds) so each amount can be audited from the list.
- Account opening balances and current balances computed from actual income, expenses, refunds, and transfers, using cent-based arithmetic and complete keyset-paged ledger reads.
- Daily financial summary for the selected ledger (Shanghai day) plus cent-accurate monthly actual income, expenses/refunds and surplus.
- Business-order types, optional order-linked actual expense transactions, refunds, and per-order revenue/cost/operating-surplus statistics are implemented through additive migration `0002_business_order_costs_and_types.sql`.
- The ¥500 daily goal now assigns business income to the transaction's actual received date (`occurred_on`), never the order creation date; refunds reduce the date they occur. The owner reports `Success. No rows returned` after running migration `0003_daily_goal_by_received_date.sql` in Supabase SQL Editor. A read-only hosted query in the correct Supabase project confirmed revenue_date (no order_date output column) and security_invoker=true. Do not rerun 0003.
- A Windows-only guarded runner (`pnpm db:apply-goal-migration`) is prepared for 0003: it takes a Session Pooler URI through hidden console input, pins the project ref, inspects existing view state, applies only this migration if needed, and verifies the resulting view without reading ledger data. It has not been run with a real connection URI.
- Idempotent transaction RPC, business orders/refunds, recurring-expense generation and confirmation, and daily ¥500 revenue calendar.
- Realtime subscriptions for active ledger data; service worker caches only the same-origin app shell/assets, never auth or database API traffic.
- Owner-scoped RLS and clear client-side save errors.
- Authenticated full-cloud JSON backup download and guarded restore, covering all seven data tables; export is paginated, restore is limited to an empty account, checks backup identity/schema, confirms before writing, and attempts to roll back partial writes. Pending expenses retain their status.

## Not yet production-accepted

- Formal public deployment is live at https://forzxz-dzbk.github.io/jizhuzhang-cloud/ (HTTP 200 verified).
- Live end-to-end acceptance with the owner's real sign-in, a real test transaction, and a second device has not been completed. Do this before treating the product as ready for personal financial use.
- Restore has been locally built and tested, including the reciprocal foreign-key flow for confirmed recurring expenses; live authenticated export/restore and the production recovery procedure still need end-to-end verification. Restore only accepts this account's backup and requires all data tables to be empty. Keep downloaded JSON encrypted/private because it contains personal financial data.
- Hosted 0002 was independently verified after application: the order type and cost-link columns, totals view, business RPCs, and order-table RLS are present. Never rerun the non-idempotent 0001 foundation migration.
- Hosted schema verification confirms business_daily_revenue.revenue_date and security_invoker=true; the read-only query found no order_date output column and did not read financial rows. Never rerun 0001 or 0003.
- Supabase email-confirmation and password-recovery redirect settings must be checked for the final deployment URL.
- The configured Supabase Auth health endpoint returned HTTP 200 on 2026-11-22; this was a health check only, with no financial-table reads or writes.
- Local Git is on `main`; `.env.local` is ignored and was not included. GitHub Pages workflow is configured; repository Pages source and Actions variables still need owner setup.

## Local setup and checks

Requirements: Node.js 20+ and pnpm.

1. `pnpm install`
2. Copy `.env.example` to `.env.local`; set the Supabase URL and browser-safe Publishable key.
3. `pnpm dev`
4. `pnpm test`, `pnpm test:db`, `pnpm build`, and `pnpm audit --prod`

`pnpm test:db` runs the migration against isolated PGlite with a minimal Auth shim; it is not a substitute for live hosted-Postgres and Auth acceptance.

GitHub Actions runs the same core test, isolated migration, production build, and production dependency audit on pushes and pull requests to `main`.

## Deployment (GitHub Pages)

The repository is public and GitHub Pages publishes only the frontend bundle; user data remains in Supabase behind Auth and owner-scoped RLS. The workflow `.github/workflows/deploy-pages.yml` builds and publishes on every push to `main`.

1. In repository Settings → Pages, select **GitHub Actions** as the source.
2. In Settings → Secrets and variables → Actions → Variables, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. These are browser-public settings; never use a `service_role` key or database password.
3. Push to `main` or manually run **Deploy GitHub Pages** in Actions. The site URL is `https://forzxz-dzbk.github.io/jizhuzhang-cloud/`.
4. In Supabase Auth URL Configuration, set that exact URL as the Site URL and add it to Redirect URLs. Email confirmation is enabled, so test confirmation and recovery links after configuration.
5. Verify sign-in, password recovery, ledger reads/writes, backup download and second-device sync before entering real financial data.
## Supabase migration safety

The current live project already contains the core schema. The initial migration is non-idempotent and must not be replayed. Before changing hosted schema, inspect current state and prepare a targeted, additive migration. Realtime setup is separately represented by `supabase/operations/enable-realtime.sql`.
