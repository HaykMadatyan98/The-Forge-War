## Deploy: Render (API) + Vercel (Web) + Neon (DB)

### 1. Push repo to GitHub

```bash
git add -A && git commit -m "Prepare Render + Vercel deploy" && git push
```

### 2. Render — API

1. [render.com](https://render.com) → **New** → **Blueprint** (or Web Service)
2. Connect the GitHub repo
3. If Blueprint: use `render.yaml`
4. If manual Web Service:
   - **Root Directory:** _(empty / repo root)_
   - **Build:** `npm ci --include=dev && npm run build -w @tfw/api`
   - **Start:** `npm run db:deploy -w @tfw/api && npm run start:prod -w @tfw/api`
   - **Health:** `/v1/health/live`
5. **Environment** (Environment → Add):

| Key | Value |
|-----|--------|
| `DATABASE_URL` | Neon connection string (`sslmode=require`) |
| `NODE_ENV` | `production` |
| `WEB_ORIGIN` | temporary `https://placeholder.vercel.app` → update after Vercel |
| `WEB_PUBLIC_URL` | same as WEB_ORIGIN |
| `ALLOW_DEV_EMAIL_TOKEN` | `0` |
| `RETURN_AUTH_TOKEN` | `0` |
| `COOKIE_SAMESITE` | `None` |
| `COOKIE_SECURE` | `1` |
| `TRUST_PROXY` | `1` |
| `REQUIRE_SMTP` | `0` until Resend is set |

6. Deploy → copy URL, e.g. `https://tfw-api.onrender.com`

Check: `https://tfw-api.onrender.com/v1/health`

### 3. Vercel — Web

1. [vercel.com](https://vercel.com) → **Add New** → **Project** → import same repo
2. **Root Directory:** leave **repository root** (uses root `vercel.json`)
   - OR set Root to `apps/web` (uses `apps/web/vercel.json`)
3. Environment Variables:

| Key | Value |
|-----|--------|
| `NEXT_PUBLIC_API_URL` | `https://tfw-api.onrender.com/v1` |

4. Deploy → copy URL, e.g. `https://tfw-xxx.vercel.app`

### 4. Link them

Back on **Render** → Environment:

```text
WEB_ORIGIN=https://tfw-xxx.vercel.app
WEB_PUBLIC_URL=https://tfw-xxx.vercel.app
```

**Manual Deploy** API again.

On **Vercel**, confirm `NEXT_PUBLIC_API_URL` is correct → Redeploy if you changed it after first build.

### 5. Smoke

1. Open Vercel URL
2. Register (with `REQUIRE_SMTP=0`, check Render logs for verify link)
3. Or set Resend SMTP and `REQUIRE_SMTP=1`

### Resend (optional but recommended)

```text
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=1
SMTP_USER=resend
SMTP_PASS=re_...
SMTP_FROM=The Forge War <onboarding@resend.dev>
REQUIRE_SMTP=1
```
