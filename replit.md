# MassMind — Crowd Intelligence Hackathon Site

A web port of the user's friend's Python/YOLOv8 crowd-counting project, rebuilt as a single-page React app that runs the AI model **directly in the browser**.

## What it does

- Accesses the user's webcam via `getUserMedia`
- Loads the **COCO-SSD** object detection model with TensorFlow.js
- Runs a real-time detection loop, filtering for the `person` class
- Draws bounding boxes + a HUD on a canvas overlay above the video
- Computes derived stats: density (ppl/m²), risk score, peak, rolling avg, FPS, confidence
- Plots a 60-sample rolling timeline as an SVG sparkline with threshold line
- Streams a synthetic "stdout" event log of system activity and tier transitions
- Threshold + area controls; configurable alert tiers (LOW / MODERATE / HIGH / CRITICAL)

100% client-side. No video frames or counts ever leave the browser.

## Visual design

Same hacker aesthetic as the friend's reference project:
- `Rajdhani` display + `JetBrains Mono` for stats
- GitHub-dark palette: `#0d1117` bg, `#161b22` panels, `#30363d` borders
- Green accents `#238636` / `#46c554`, danger `#f85149`, warn `#d29922`
- Scan-line, grid overlay, corner brackets, pulse-glow logo, scrolling ticker

## Stack

- React + Vite + Tailwind v4 (artifact: `artifacts/crowd-intel`, port `22337`)
- `@tensorflow/tfjs` + `@tensorflow-models/coco-ssd` (`lite_mobilenet_v2`)
- All UI handcrafted — no shadcn/Radix used in the final app
- Backend prefers WebGL but auto-falls back to CPU on unsupported devices

## Files

- `artifacts/crowd-intel/src/App.tsx` — entire single-page app
- `artifacts/crowd-intel/src/index.css` — MassMind theme + animations
- `artifacts/crowd-intel/src/main.tsx` — React entry

## Unused legacy

The original plan started a dashboard with a Postgres schema (venues/zones/alerts) and OpenAPI codegen. After the pivot to client-only AI, none of that is referenced by the frontend. Files left in place but inactive:
- `artifacts/api-server/*`
- `lib/api-spec/openapi.yaml`
- `lib/db/src/schema/*`
