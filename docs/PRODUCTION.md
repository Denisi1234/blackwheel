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
3. Storage: create public bucket `tire-photos` (Dashboard > Storage) for `uploadTirePhoto`. Without it, photos fall back to base64/localStorage with quota warnings.
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
- [ ] Export CSV/PDF from TireList, Deliveries, WorkerTracking.
- [ ] Settings backup JSON downloads; currency/threshold persist.
- [ ] Dark toggle + 360px mobile pass on TireHotel charts, dialogs, tables.

## 6. Data looks lost after refresh (rows in Supabase, UI empty)

This is filtering, not deletion. Check in order:

1. **Wrong shop.** Header shows the active shop. `localStorage blackwheel_shop_id` must match the rows' `shop_id`. Use "Switch shop" in the account menu if you belong to several shops. Each shop only sees its own rows.
2. **Orphan rows (`shop_id NULL` or other shop).** In Supabase SQL editor:
   ```sql
   select shop_id, count(*) from tires group by shop_id;
   select id, brand, size, shop_id, created_at from tires where shop_id is null order by created_at desc limit 20;
   ```
   Rows with `shop_id NULL` are invisible under RLS (`my_shop_ids()`). Backfill them to the correct shop, or re-add while the right shop is active. `insertRow` refuses orphan writes when no shop is selected — if a save silently stayed local-only, the shop context was missing.
3. **Inactive profile / email mismatch.** `select id, email, shop_id, role, active from profiles where lower(email) = lower('<login-email>');` — needs `active = true` and the right `shop_id`. Re-invites create a second profile row; strongest role wins per shop.
4. **No-shop loads no longer wipe cache.** `loadTable` returns `null` (local fallback) when no shop is selected instead of `[]`. The app also warns in the UI when cloud returns 0 tires but the browser cache had rows.
5. **Browser vs device.** Offline mode lives in `localStorage` per browser. Different device/incognito = empty until Supabase sync. Export JSON backup from Settings before switching devices.
6. **Local-only rows never uploaded.** Records created before a shop was selected (or while cloud writes failed) live only in that browser. The app now keeps them on screen with a warning banner instead of wiping them — click **Upload N local records to cloud** (or Settings → **Sync Local Data to Cloud**) on the device that holds the data, then refresh other devices.
7. **Shared devices / account switching.** Browser caches are namespaced per shop (`<key>::<shop_id>`), workspace state is cleared on sign-out, and screens remount on shop change — account B never sees account A's data. Every screen dual-writes to Supabase (fire-and-forget, local UI stays instant), so switching accounts is: sign out → sign in → cloud reloads in seconds. If a second account shows empty, its rows were never uploaded: run the Upload step on the original device first.

## 7. Ops notes / known limits

- Bundle: `main ~323 kB` gzipped after code-splitting; heavy screens lazy-load with `ErrorBoundary` retry (`App.js`, `ErrorBoundary.js`).
- Roles are coarse by design (DB allows member writes; destructive UI gated). `Sales` has no distinct write rights. Add `profiles`-checked RLS migration if per-role DB enforcement is needed.
- Backups are browser-local JSON (`Settings.js`); schedule Supabase PITR/backups separately — do not rely on local export for DR.
- Emails (appointment reminders) require `REACT_APP_EMAILJS_*`; otherwise UI shows "not configured".
- B2B / Virtual POS / E-Invoice / mobile app are not implemented (README Upcoming).
- Rollback: `kubectl rollout undo deploy/blackwheel-web -n blackwheel`; frontend is stateless (data in Supabase).
