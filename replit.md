# TRINETRA AI / Marauder's Eye — Crowd Intelligence

## Overview
A browser-based crowd intelligence demo (people count, safety zone, foot traffic, crowd flow, demographics, mask check, behaviour alerts). Uses TensorFlow.js + face-api in the browser — no backend, all inference runs client-side.

## Stack
- pnpm workspace monorepo
- React 19 + Vite 7 (TypeScript)
- Tailwind CSS v4
- TensorFlow.js, COCO-SSD, face-api
- Wouter routing, Radix UI / shadcn-style components

## Project Layout
- `artifacts/crowd-intel/` — the actual app (workspace package `@workspace/crowd-intel`)
- `lib/` — shared workspace libs
- `scripts/` — workspace scripts
- `attached_assets/` — alias `@assets`
- `artifacts/api-server/` and `artifacts/mockup-sandbox/` — leftover scaffolding, not used

## Replit Setup
- Workflow `Start application` runs `PORT=5000 pnpm --filter @workspace/crowd-intel dev` and serves on port 5000.
- Vite is configured with `host: 0.0.0.0`, `allowedHosts: true`, and reads the `PORT` env var, so the Replit iframe proxy works without changes.

## Deployment
- Static deployment configured.
- Build: `pnpm --filter @workspace/crowd-intel run build`
- Public dir: `artifacts/crowd-intel/dist/public`
