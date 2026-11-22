# 记祝账 · 云端候选

React + TypeScript + Vite client using Supabase Auth, Postgres, RLS, RPCs, and Realtime. This is the cloud-first candidate intended to replace the local-only MVP; it is not yet a formally deployed production service.

## Current delivery status (2026-11-22)

- Supabase project is connected through local `.env.local` using only the browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never add a service-role key to client configuration or source control.
- The core migration was applied in the Supabase Dashboard. The owner reported the migration's first re-run failed with `42P07 relation "ledgers" already exists`; do not run `0001_cloud_foundation.sql` again. A read-only audit reported all seven business tables, both views, RLS enabled on all seven tables, seven owner policies, six SECURITY INVOKER functions, three triggers, and `security_invoker=true` on both views.
- `supabase/operations/enable-realtime.sql` was run in the Dashboard; the owner reported `Success. No rows returned`.
- No real financial transactions or demo financial data have been inserted.
- Automated evidence on 2026-11-22: `pnpm test` (10/10), `pnpm test:db` (pass), `pnpm build` (pass), `pnpm audit --prod` (no known vulnerabilities), and local Vite production preview (HTTP 200, title `记祝账`).

## Implemented

- Email/password sign-in, sign-up, password recovery, persisted-session restoration, and sign-out.
- Separate personal and Mac-business ledgers; ledger, account, category, and transaction views.
- Server-side note search and page navigation across the full ledger history; literal `%`, `_`, and `\` are escaped rather than interpreted as search wildcards.
- Account opening balances and current balances computed from actual income, expenses, refunds, and transfers, using cent-based arithmetic and complete keyset-paged ledger reads.
- Business-order types, optional order-linked actual expense transactions, refunds, and per-order revenue/cost/operating-surplus statistics are implemented through additive migration `0002_business_order_costs_and_types.sql`.
- Idempotent transaction RPC, business orders/refunds, recurring-expense generation and confirmation, and daily ¥500 revenue calendar.
- Realtime subscriptions for active ledger data; service worker caches only the same-origin app shell/assets, never auth or database API traffic.
- Owner-scoped RLS and clear client-side save errors.
- Authenticated full-cloud JSON backup download and guarded restore, covering all seven data tables; export is paginated, restore is limited to an empty account, checks backup identity/schema, confirms before writing, and attempts to roll back partial writes. Pending expenses retain their status.

## Not yet production-accepted

- Formal public deployment URL and GitHub remote are not configured. The candidate has a local Git repository with committed source, but no GitHub remote, Vercel CLI, or linked Vercel project.
- Live end-to-end acceptance with the owner's real sign-in, a real test transaction, and a second device has not been completed. Do this before treating the product as ready for personal financial use.
- Restore has been locally built and tested, including the reciprocal foreign-key flow for confirmed recurring expenses; live authenticated export/restore and the production recovery procedure still need end-to-end verification. Restore only accepts this account's backup and requires all data tables to be empty. Keep downloaded JSON encrypted/private because it contains personal financial data.
- Migration `0002_business_order_costs_and_types.sql` is additive and locally tested but has not yet been applied to the hosted Supabase project. Business order type/cost/statistics screens require applying it before use; do not rerun the non-idempotent `0001` foundation migration.
- Supabase email-confirmation and password-recovery redirect settings must be checked for the final deployment URL.
- The configured Supabase Auth health endpoint returned HTTP 200 on 2026-11-22; this was a health check only, with no financial-table reads or writes.
- A local Git repository was initialized on `main` and committed as `d833739`; `.env.local` is ignored and was not included. No GitHub remote, GitHub CLI, Vercel CLI, or deployment token is available in this workspace.

## Local setup and checks

Requirements: Node.js 20+ and pnpm.

1. `pnpm install`
2. Copy `.env.example` to `.env.local`; set the Supabase URL and browser-safe Publishable key.
3. `pnpm dev`
4. `pnpm test`, `pnpm test:db`, and `pnpm build`

`pnpm test:db` runs the migration against isolated PGlite with a minimal Auth shim; it is not a substitute for live hosted-Postgres and Auth acceptance.

## Deployment preparation (Vercel)

`vercel.json` sets the Vite build/output and SPA history fallback. The candidate has not been deployed because it has no GitHub remote or linked Vercel project yet.

1. Push this folder to a new private GitHub repository (do not include `.env.local`; it is ignored).
2. Import that repository in Vercel; keep the project root at this folder. Build settings are in `vercel.json` (`pnpm build`, output `dist`).
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as Vercel environment variables for Production and Preview. Use the Supabase project's URL and browser-safe Publishable key only; never add `service_role` or database passwords.
4. Deploy, then in Supabase Auth set the deployed origin as Site URL and add the exact deployed URL plus its password-recovery redirect URL to the redirect allowlist.
5. Verify sign-in, password recovery, ledger reads/writes, backup download and second-device sync before entering real financial data.

## Supabase migration safety

The current live project already contains the core schema. The initial migration is non-idempotent and must not be replayed. Before changing hosted schema, inspect current state and prepare a targeted, additive migration. Realtime setup is separately represented by `supabase/operations/enable-realtime.sql`.
