# TRINETRA AI — The Marauder's Eye

Browser-based crowd intelligence dashboard with phone-camera streaming.
React 19 + Vite 7 + TensorFlow.js + Express 5.

---

## Quick start (VS Code terminal)

### Prerequisites
- **Node.js 20+**  → https://nodejs.org/
- **pnpm**  → `npm install -g pnpm`

### 1. Install dependencies
```bash
cd trinetra-marauders-eye
pnpm install
```

### 2. Run the app (one terminal)
```bash
pnpm dev
```
Open **http://localhost:5000** in your browser. Sign up, sign in, you're done.
Users are stored in `.local/users.json` automatically — **zero database setup**.

---

## Phone camera over HTTPS (no cert warnings)

Browsers block `getUserMedia` (camera) on plain HTTP from any non-localhost
origin, and self-signed certs trigger ugly warnings. The cleanest fix is a
public tunnel that proxies a **valid HTTPS URL** straight to your local server.

### Option A — One command (recommended)
```bash
pnpm dev:tunnel
```
Boots the app **and** opens a `https://xxxxx.loca.lt` tunnel. Open that URL on
your laptop, sign in — the dashboard QR code now encodes that valid HTTPS URL
and your phone can scan it with no warnings.

> First visit to a `*.loca.lt` URL asks for a one-time password — it's just
> your laptop's public IPv4 (the page links to it).

### Option B — Two terminals
```bash
# Terminal 1
pnpm dev
# Terminal 2
pnpm tunnel
```

### Option C — Local self-signed HTTPS (offline)
```bash
HTTPS=true pnpm dev          # macOS / Linux
$env:HTTPS="true"; pnpm dev  # Windows PowerShell
```

---

## Deploy to Railway

This repo is preconfigured for Railway — `railway.json`, `nixpacks.toml`, and
`Procfile` are all included.

### Step-by-step
1. **Push this folder to GitHub** as its own repo (the `trinetra-marauders-eye/`
   folder must be the repo root, not a subfolder — Railway can't build a
   subfolder out of the box).

2. **Create a new project on Railway** → "Deploy from GitHub repo" → select
   your repo. Railway detects `nixpacks.toml` and starts building.

3. **Add a Postgres database** to the project: click "+ New" → "Database" →
   "Add PostgreSQL".

4. **Wire env vars** on your service's **Variables** tab:

   | Name           | Value                                          |
   |----------------|------------------------------------------------|
   | `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` (reference)     |
   | `JWT_SECRET`   | output of `openssl rand -base64 48`            |
   | `NODE_ENV`     | `production` *(optional — pnpm start sets it)* |

   **Do not** set `PORT` — Railway injects it automatically.

5. **Generate a public domain**: Settings → Networking → "Generate Domain".
   Open the URL, sign up, scan the QR with your phone — full HTTPS, real cert,
   camera works, no localtunnel needed.

### Why deploys were failing — and what was fixed
| Problem | Fix applied |
|---|---|
| `tsx` was a dev dep → pruned after build → `pnpm start` crashed | Moved `tsx` + `typescript` into `dependencies` |
| Express 5 throws `Missing parameter name` on `app.get("*", …)` | SPA fallback rewritten as a `app.use((req, res) => …)` middleware |
| `secure: true` cookies dropped behind Railway's TLS proxy | Added `app.set("trust proxy", 1)` in `server/index.ts` |
| Railway Postgres rejects connections without SSL | `pg.Pool` now auto-enables `ssl: { rejectUnauthorized: false }` for non-localhost hosts |
| JWT secret + `users.json` written to ephemeral disk → users wiped on every redeploy | In production: refuses disk writes, warns loudly if `JWT_SECRET`/`DATABASE_URL` missing |
| Missing Railway/nixpacks config + Node version pin | Added `railway.json`, `nixpacks.toml`, `Procfile`, `.node-version`, `engines` field |

---

## Production build (any host)
```bash
pnpm install
pnpm build
NODE_ENV=production pnpm start
```

---

## Optional: real Postgres locally
Drop a `DATABASE_URL` in `.env` and the app uses Postgres instead of the JSON
file. The `users` table is auto-created on first boot.
```bash
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/trinetra
```

---

## Project layout
```
trinetra-marauders-eye/
├── src/                React app (pages, components, hooks, lib)
├── server/             Express API + dev server
│   ├── api.ts          Mounts /api routes (incl. /api/health)
│   ├── auth.ts         JWT + bcrypt auth (register / login / logout / me)
│   ├── userStore.ts    Postgres OR .local/users.json (auto, SSL-aware)
│   ├── dev.ts          Vite middleware dev server
│   └── index.ts        Production static server (trust-proxy, SPA fallback)
├── public/             face-api models + favicon
├── index.html
├── vite.config.ts
├── tsconfig.json
├── components.json
├── railway.json        Railway build/start/healthcheck config
├── nixpacks.toml       Build steps for nixpacks-based hosts
├── Procfile            Backup start command
├── .node-version       Pin Node 20
├── .env.example
└── package.json
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `pnpm: command not found` | `npm install -g pnpm` |
| Port 5000 in use | `PORT=3000 pnpm dev` |
| Phone camera "permission denied" locally | Use `pnpm dev:tunnel`, open the `*.loca.lt` URL on your laptop, *then* scan the QR |
| Tunnel asks for a password | Enter your laptop's public IPv4 (the tunnel page links to it) |
| Railway build fails on `vite: command not found` | Confirm `NPM_CONFIG_PRODUCTION=false` is in `nixpacks.toml` (it is) so devDeps install during build |
| Railway healthcheck fails | App is probably crashing — check Deploy Logs; usually a missing `DATABASE_URL` |
| Users vanish after Railway redeploy | You forgot `DATABASE_URL`. Add Postgres + reference it in Variables |
| Want to wipe local users | Delete `.local/users.json` |
