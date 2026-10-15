# Black Wheel — Production Runbook

## 1. Build (strict, like Docker)

CRA bakes `REACT_APP_*` at build time. Always build with real values:

```bash
CI=true npm run build   # must pass; warnings fail the build
npm test -- --watchAll=false  # 15 tests must pass
```

Docker:

```bash
docker build \
  --build-arg REACT_APP_SUPABASE_URL=https://<proj>.supabase.co \
  --build-arg REACT_APP_SUPABASE_ANON_KEY=<anon-key> \
  -t registry/blackwheel-web:1.0.0 .
docker run -p 8080:80 registry/blackwheel-web:1.0.0
curl -f http://localhost:8080/  # healthcheck path (also k8s probes)
```

## 2. Supabase prod setup (once per project)

1. `supabase db push` (applies `supabase/schema.sql` + migrations: RLS, shop isolation, `workers/tasks` status checks).
2. Verify RLS: `profiles/shops` admin-only writes; 14 tenant tables `member_all` (any active shop member). Roles beyond that are UI-enforced (`Admin` full, `Technician` tasks-only, `Sales/Staff` read-only) — see `src/lib/team.js:getWorkerPermissions`.
3. Storage: create public bucket `tire-photos` (Dashboard > Storage) for `uploadTirePhoto`. Without it, photos persist as compressed dataURLs on the cloud row.
4. Auth: set `minimum_password_length = 6` (already in `supabase/config.toml:183`); configure SMTP for password reset in production.
5. Backfill check: legacy rows with `shop_id NULL` are invisible under new RLS — run the backfill note in `supabase/schema.sql:270-274` before go-live.

## 3. Deploy (k8s)

```bash
kubectl apply -f k8s/app.yaml
kubectl apply -f k8s/hpa.yaml
# edit k8s/ingress.yaml hosts first:
kubectl apply -f k8s/ingress.yaml
kubectl -n blackwheel set image deploy/blackwheel-web web=registry/blackwheel-web:1.0.0
kubectl -n blackwheel rollout status deploy/blackwheel-web
```

- Probes hit `/` every 10s/20s (`app.yaml:29-40`). HPA scales 2→6 pods at 70% CPU.
- TLS: `kubectl create secret tls blackwheel-tls --cert=tls.crt --key=tls.key -n blackwheel`; Ingress forces SSL + HSTS.
- Static assets under `/static/` cache 1y immutable; `index.html` never cached (`k8s/nginx.conf`).

## 4. Pilot checklist (1 real shop first)

- [ ] Sign up → personal shop auto-created, creator is `Admin` (no shop typing; `ensurePersonalShop`).
- [ ] Invite `Technician/Sales` by email; stranger lands `Staff` pending.
- [ ] Add tire → sell → void sale restores stock; profit = (sale − cost) × qty.
- [ ] WorkerTracking as `Sales` shows read-only banner; as `Technician` can complete tasks.
- [ ] Team invite auto-creates the worker row (and worker email invites the login) — one person, one record, matched by email; "My tasks" filter shows the login user's tasks.
- [ ] Export CSV/PDF from TireList, Deliveries, WorkerTracking.
- [ ] Sale receipt PDF downloads from SaleForm history and the post-sale dialog.
- [ ] Change currency/threshold in Settings, refresh: values persist from the cloud.
- [ ] Dark toggle + 360px mobile pass on TireHotel charts, dialogs, tables.

## 6. Data looks missing after login (rows exist for another account)

Pure cloud: every read comes from Postgres, scoped to your shop by RLS.
There is no browser cache, so "lost" data is always one of these:

1. **Wrong account.** One account owns exactly one shop. Sign out and back in with the correct email; each account only ever sees its own rows.
2. **Orphan rows (`shop_id NULL` or other shop).** In Supabase SQL editor:
   ```sql
   select shop_id, count(*) from tires group by shop_id;
   select id, brand, size, shop_id, created_at from tires where shop_id is null order by created_at desc limit 20;
   ```
   Rows with `shop_id NULL` are invisible under RLS (`my_shop_ids()`). Backfill them to the correct shop with the SQL in `supabase/schema.sql:270-274`.
3. **Inactive profile / email mismatch.** `select id, email, shop_id, role, active from profiles where lower(email) = lower('<login-email>');` — needs `active = true` and the right `shop_id`. Re-invites create a second profile row; strongest role wins per shop.
4. **Shared devices / account switching.** Workspace state is cleared on sign-out and screens remount on shop change — account B never sees account A's data. Every screen writes straight to Supabase, so switching accounts is: sign out → sign in → cloud reloads in seconds.
5. **Live multi-device refresh.** All 17 tables are in the `supabase_realtime` publication (`supabase/migrations/20261015000001_realtime.sql`); every screen subscribes with a `shop_id` filter and merges inserts/updates/deletes by id, so other devices see changes within seconds, no refresh. RLS still applies per client.

## 7. Ops notes / known limits

- Bundle: `main ~323 kB` gzipped after code-splitting; heavy screens lazy-load with `ErrorBoundary` retry (`App.js`, `ErrorBoundary.js`).
- Roles are coarse by design (DB allows member writes; destructive UI gated). `Sales` has no distinct write rights. Add `profiles`-checked RLS migration if per-role DB enforcement is needed.
- Failed cloud saves are visible: any rejected insert/update/delete shows a red toast naming the table and reason (e.g. unknown column), instead of looking saved until refresh.
 - Audit log: every successful cloud mutation records actor/action/table/row in `audit_log` (Admin → Audit Log screen, live + CSV export). No auto-purge — add retention if volume grows.
 - Task replies + notifications: per-task reply thread (`task_comments`, any member can reply even read-only) with live inbox (`notifications`, bell in Worker Tracking, unread badge, click to open thread). Assignment and replies also email the assignee via EmailJS when `REACT_APP_EMAILJS_*` is set — best-effort, never blocks the UI.
- Backups: Supabase PITR / scheduled database backups — the app holds no browser data, so there is nothing local to export for DR.
- Emails (appointment reminders) require `REACT_APP_EMAILJS_*`; otherwise UI shows "not configured".
- B2B / Virtual POS / E-Invoice / mobile app are not implemented (README Upcoming).
- Rollback: redeploy the previous Vercel deployment from the dashboard; frontend is stateless (data in Supabase).
