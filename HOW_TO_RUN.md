# TRINETRA AI — Run on Windows 11 with VS Code

A short, friendly guide. Nothing technical to set up beyond Node.

## 1. One-time setup

1. **Install Node.js 20 (LTS)**
   Download from https://nodejs.org → run the installer → click Next through everything → Finish.

2. **Install pnpm** (the package tool this project uses)
   Open **PowerShell** (press `Win` → type *PowerShell* → Enter) and paste:
   ```powershell
   npm install -g pnpm
   ```

3. **Install VS Code** (if you don't already have it)
   https://code.visualstudio.com/

## 2. Get the project on your PC

1. Download the project as a ZIP and extract it somewhere easy, e.g. `C:\Users\<you>\Desktop\trinetra-ai`.
2. Open VS Code → **File → Open Folder…** → pick that folder.

## 3. Install the project's stuff (one time)

Open the VS Code terminal (**Ctrl + `** — the backtick key, top-left under Esc) and run:

Important: the terminal should say **PowerShell**, not **cmd**. If VS Code opens `cmd`, click the small dropdown on the terminal tab and switch to **PowerShell** first.

If you want to stay in **cmd**, `pnpm install` works there too. Only the cleanup commands later are different.

```powershell
pnpm install
```

This downloads everything the app needs. It takes about 1–3 minutes the first time.

If pnpm shows a message like `Ignored build scripts: ... Run "pnpm approve-builds"`, run this once too:

```powershell
pnpm approve-builds
```

When it opens the picker, approve the package(s) it shows, then run:

```powershell
pnpm install
```

## 4. Start TRINETRA AI

In the same terminal, from the project root:

```powershell
pnpm dev
```

You'll see a line like:

```
  [trinetra] dev server (HTTPS, self-signed) listening on :22338
```

Open `https://localhost:22338/` in Chrome / Edge. Your browser will warn about the self-signed certificate — click **Advanced → Proceed**. You'll land on the **sign-in / sign-up page**: create an account with any email + password (8+ characters) and you're in.

> Multiple people can sign up on the same machine — accounts are stored in a small local database file (or in Replit's PostgreSQL when running on Replit). Sign-in survives restarts.

### Phone QR scanning (local dev only)

When you click **Use phone camera** on the dashboard you'll get a QR code. To scan it from your phone:

- Make sure phone + laptop are on the **same Wi-Fi**.
- Find your laptop's LAN IP (`ipconfig` in PowerShell, look for `IPv4 Address`).
- On the dashboard, replace `localhost` in the QR's URL with that IP, e.g. `https://192.168.1.42:22338/?broadcast=...`.
- The phone will warn about the certificate — tap **Advanced → Proceed**. The phone needs HTTPS to allow camera access.

**Easier alternative:** push the project to Replit and use the public Replit URL — it has a real HTTPS certificate, so the phone just works with no warnings.

## 4B. Where do user accounts go?

- **Locally (VS Code):** there's nothing to set up. Accounts are saved to a small file at `artifacts/crowd-intel/.local/users.json` and persist across restarts. Multiple people can register on the same machine.
- **On Replit:** accounts go into Replit's built-in PostgreSQL automatically.
- **Optional override:** if you set `DATABASE_URL=postgres://...` in your environment, it'll use that Postgres instead of the local file.

The session signing key is auto-generated on first run and saved to `artifacts/crowd-intel/.local/jwt-secret`, so you stay logged in across restarts.

## 4A. If you get `Cannot find native binding`

On some Windows PCs, pnpm can skip an optional native package used by Tailwind/Vite. If you see an error like `Cannot find native binding` or `failed to load config from ... vite.config.ts`, run these commands in the project root:

```powershell
Remove-Item -Recurse -Force node_modules
pnpm approve-builds
pnpm install
pnpm dev
```

If you are using **cmd** instead of PowerShell, use this version:

```cmd
rmdir /s /q node_modules
pnpm approve-builds
pnpm install
pnpm dev
```

Notes:

- These recovery commands are for **PowerShell**. If your terminal says `cmd`, switch it to PowerShell first.
- For `cmd`, use `rmdir /s /q node_modules` instead of `Remove-Item -Recurse -Force node_modules`.
- If `pnpm approve-builds` opens a list, select and approve everything it asks for.
- If PowerShell says a file is in use, close the dev server / VS Code terminal first, then run the commands again.
- If it still fails after that, delete `pnpm-lock.yaml` too, then run `pnpm install` again.
- This fix is safe: it only reinstalls the project's dependencies.

## 5. Use it

On the **landing page**, pick one:

- **Use webcam** → allow camera access when the browser asks.
- **Upload a video** → pick an MP4 / WebM / MOV file.
- **Upload a photo** → pick a JPG / PNG.

The **dashboard** then shows live people count, safety zone, foot traffic, crowd flow, demographics, mask check, and behaviour alerts.

In the top bar you can:

| Button         | What it does                                            |
| -------------- | ------------------------------------------------------- |
| **Heatmap**    | Toggle the crowd-density heat overlay                   |
| **Snapshot**   | Save a PNG of the current scene with stats footer        |
| **Record**     | Save a 10-second WebM clip of the incident with overlay |
| **Alarms**     | Mute / unmute the audio safety alarm                    |
| **Pause**      | Freeze the live analysis                                |
| **Change source** | Go back to the landing page to pick a different feed |

Everything runs **inside your browser** — nothing is uploaded.

## 6. Stop the app

In the terminal, press **Ctrl + C**, then **Y**.

---

## Project structure

```
trinetra-ai/
├─ HOW_TO_RUN.md              ← this file
├─ replit.md                  ← project notes
├─ package.json               ← root pnpm config
├─ pnpm-workspace.yaml
├─ pnpm-lock.yaml
├─ tsconfig.base.json
└─ artifacts/
   └─ crowd-intel/            ← the TRINETRA AI app (the one you run)
      ├─ index.html
      ├─ package.json
      ├─ vite.config.ts
      ├─ tsconfig.json
      ├─ public/
      │  ├─ favicon.svg
      │  └─ face-models/      ← face / age / gender / mask weights
      └─ src/
         ├─ main.tsx          ← React entry
         ├─ App.tsx           ← Landing ↔ Dashboard router
         ├─ index.css         ← light blue theme + animations
         ├─ pages/
         │  ├─ Landing.tsx    ← hero + source picker
         │  └─ Dashboard.tsx  ← main dashboard (count, safety, flow, etc.)
         └─ lib/
            ├─ detection.ts   ← person + face detection wrappers
            ├─ tracker.ts     ← centroid tracker, flow, fall/run, in/out
            └─ audio.ts       ← Web Audio safety alarm
```

The `artifacts/api-server/` folder is leftover from an earlier plan and is not used — you can ignore it.

---

## Tips

- **No camera popup?** Click the little camera icon in the address bar and allow it, then refresh.
- **Audio alarm silent?** Click anywhere on the page once — browsers block sound until you interact.
- **Slow on first load?** First run downloads the AI brain (~25 MB). Later runs are instant.
- **Best browser:** Chrome or Microsoft Edge.
- **Recorded clip won't open?** It's a `.webm` file — VLC, Chrome, and Edge all play it natively.

That's it. Enjoy demoing TRINETRA AI 🛡️
