# TRINETRA AI — Crowd Safety Vision

A hackathon-grade crowd safety website inspired by the user's friend's Flask + YOLOv8 project. Pure browser app — no server, no uploads. Marketing-grade light blue UI with zero technical jargon (no model names, FPS, confidence%, "backend", etc).

## What it does

The user picks a source on the **Landing page** (webcam / video file / image), and is taken to a **Dashboard** that shows:

- **Live people count** with peak
- **Safety zone** badge — Safe / Watch / High risk / Stampede risk — driven by count vs capacity
- **Foot traffic** — entered / left counters from a centroid tracker crossing the frame midline
- **Crowd flow** compass arrow + label
- **Age & gender** breakdown (bars)
- **Mask check** percentage
- **Behaviour alerts** for fall and run events
- **Heatmap** overlay (toggleable) — Float32 decay grid stamped on each detection
- **Snapshot** button — composites video + heatmap + overlay + stats footer to a downloadable PNG
- **Audio alarm** beeps via Web Audio when the safety tier escalates
- **History chart**, **alerts feed**, **capacity slider**, **Pause / Mute / Change source** top bar

Everything runs in the browser. No frame, count, or face ever leaves the device.

## Visual design

- Light marketing theme — bg `#f4f7fb`, ink `#0f1f3d`
- Brand: blue `#1d6cf3` + cyan `#06b6d4` gradient
- Tier colors: SAFE `#10b981`, MODERATE `#f59e0b`, HIGH `#ef4444`, STAMPEDE `#b91c1c`
- Inter font, generous spacing, rounded cards, soft shadows
- Smooth fade/slide transitions between Landing and Dashboard

## Stack

- pnpm monorepo, artifact `crowd-intel` at port `22337`
- React + Vite + Tailwind v4 + TypeScript
- `@tensorflow/tfjs` + `@tensorflow-models/coco-ssd` for person detection
- `@vladmandic/face-api` for age / gender / face landmarks (mask heuristic)
- Custom centroid tracker, Web Audio alarm, heatmap grid

## Files

- `artifacts/crowd-intel/src/App.tsx` — landing ↔ dashboard router
- `artifacts/crowd-intel/src/pages/Landing.tsx` — marketing hero + source picker
- `artifacts/crowd-intel/src/pages/Dashboard.tsx` — main dashboard
- `artifacts/crowd-intel/src/lib/detection.ts` — tfjs / coco-ssd / face-api wrappers
- `artifacts/crowd-intel/src/lib/tracker.ts` — centroid tracking, flow direction, fall/run, entered/left
- `artifacts/crowd-intel/src/lib/audio.ts` — Web Audio alarm beeps
- `artifacts/crowd-intel/src/index.css` — light theme tokens + animations
- `artifacts/crowd-intel/public/face-models/` — face-api model weights (tiny_face_detector, face_landmark_68, age_gender)
- `HOW_TO_RUN.md` — Windows 11 + VS Code instructions for the user

## Unused legacy

Earlier plan included a Postgres backend and OpenAPI codegen. None of it is referenced by the final app, but left in place to avoid breaking the workspace:

- `artifacts/api-server/*`
- `lib/api-spec/openapi.yaml`
- `lib/db/src/schema/*`
