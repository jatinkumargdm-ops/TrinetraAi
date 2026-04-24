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

- **Use webcam** → allow camera access when the browser asks.
- **Upload a video** → pick an MP4 / WebM / MOV file from your PC.
- **Upload a photo** → pick a JPG / PNG.

Everything runs **inside your browser** — no internet upload, no server needed.

## 6. Stop the app

In the terminal, press **Ctrl + C**, then **Y**.

---

## Tips

- **No camera popup?** Click the little camera icon in the address bar and allow it, then refresh.
- **Audio alarm silent?** Click anywhere on the page once — browsers block sound until you interact.
- **Slow on first load?** First run downloads the AI brain (~25 MB). Later runs are instant.
- **Best browser:** Chrome or Microsoft Edge.

That's it. Enjoy demoing TRINETRA AI 🛡️
