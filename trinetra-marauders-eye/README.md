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
This boots the app **and** opens a `https://xxxxx.loca.lt` tunnel in the same
terminal. Open the printed `https://xxxxx.loca.lt` URL on your laptop, sign in,
and the QR code in the dashboard will encode that URL — your phone scans it,
opens the same valid HTTPS URL, and the camera works with no warnings.

> First time you visit a `*.loca.lt` URL the localtunnel landing page asks for
> a one-time password — it's just your laptop's public IPv4 (it tells you how
> to find it on the page). After that you're in.

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
Visit `https://localhost:5000` and accept the browser warning. Your phone
must be on the same Wi-Fi and accept the warning too — Option A is much nicer.

---

## Production build
```bash
pnpm build
pnpm start          # serves dist/public + the API on PORT (default 5000)
```

---

## Optional: real Postgres
Drop a `DATABASE_URL` in `.env` (or your shell) and the app uses Postgres
instead of the JSON file. The `users` table is auto-created on first boot.
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
│   ├── api.ts          Mounts /api routes
│   ├── auth.ts         JWT + bcrypt auth (register / login / logout / me)
│   ├── userStore.ts    Postgres OR .local/users.json (auto)
│   ├── dev.ts          Vite middleware dev server
│   └── index.ts        Production static server
├── public/             face-api models + favicon
├── index.html
├── vite.config.ts
├── tsconfig.json
├── components.json
└── package.json
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `pnpm: command not found` | `npm install -g pnpm` |
| Port 5000 in use | `PORT=3000 pnpm dev` |
| Phone camera "permission denied" | Use `pnpm dev:tunnel` and open the `*.loca.lt` URL on your laptop, *then* scan the QR |
| Tunnel asks for password | Enter your laptop's public IPv4 (the tunnel page links to it) |
| Want to wipe local users | Delete `.local/users.json` |
