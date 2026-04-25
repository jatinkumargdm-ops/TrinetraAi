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

In the same terminal:

```powershell
pnpm --filter @workspace/crowd-intel dev
```

Do not run `pnpm dev` at the project root. This repo's app lives inside the `@workspace/crowd-intel` workspace, so the command above is the correct one.

You'll see a line like:

```
  ➜  Local:   http://localhost:22338/
```

Hold **Ctrl** and click that link, or just open it in Chrome / Edge.

## 4A. If you get `Cannot find native binding`

On some Windows PCs, pnpm can skip an optional native package used by Tailwind/Vite. If you see an error like `Cannot find native binding` or `failed to load config from ... vite.config.ts`, run these commands in the project root:

```powershell
Remove-Item -Recurse -Force node_modules
pnpm approve-builds
pnpm install
pnpm --filter @workspace/crowd-intel dev
```

If you are using **cmd** instead of PowerShell, use this version:

```cmd
rmdir /s /q node_modules
pnpm approve-builds
pnpm install
pnpm --filter @workspace/crowd-intel dev
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
