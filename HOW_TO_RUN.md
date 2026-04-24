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

```powershell
pnpm install
```

This downloads everything the app needs. It takes about 1–3 minutes the first time.

## 4. Start TRINETRA AI

In the same terminal:

```powershell
pnpm --filter @workspace/crowd-intel dev
```

You'll see a line like:

```
  ➜  Local:   http://localhost:22337/
```

Hold **Ctrl** and click that link, or just open it in Chrome / Edge.

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
