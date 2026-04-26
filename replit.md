# TRINETRA AI / Marauder's Eye — Crowd Intelligence

## Overview
A browser-based crowd intelligence demo (people count, safety zone, foot traffic, crowd flow, demographics, mask check, behaviour alerts). Uses TensorFlow.js + face-api in the browser — all ML inference runs client-side. A small Express API handles email/password auth backed by Replit Postgres.

## Auth / DB
- Custom email+password auth (bcrypt + JWT cookie) lives in `artifacts/crowd-intel/server/auth.ts`.
- Backed by **Replit's built-in PostgreSQL** (provisioned automatically). The `users` table is created on first request via `ensureUsersTable()` in `artifacts/crowd-intel/server/db.ts`.
- `JWT_SECRET` is auto-set as a Replit env var. If missing, the server generates one and persists it to `artifacts/crowd-intel/.local/jwt-secret`. Multiple users can register and sign in with no extra setup.
- API routes:
  - `POST /api/auth/register` — `{ email, password, name }` → sets `trinetra_session` cookie.
  - `POST /api/auth/login` — `{ email, password }`.
  - `POST /api/auth/logout`.
  - `GET  /api/auth/me` — returns current user from the session cookie.

## Stack
- pnpm workspace monorepo
- React 19 + Vite 7 (TypeScript)
- Tailwind CSS v4
- TensorFlow.js, COCO-SSD, face-api
- Wouter routing, Radix UI / shadcn-style components

## Project Layout
- `artifacts/crowd-intel/` — the React app (workspace package `@workspace/crowd-intel`)
- `lib/` — shared workspace libs
- `scripts/` — workspace scripts
- `attached_assets/` — alias `@assets`
- `artifacts/api-server/` and `artifacts/mockup-sandbox/` — leftover scaffolding, not used

## Replit Setup
- Single workflow: `Start application` — `PORT=5000 pnpm --filter @workspace/crowd-intel dev` (port 5000, webview)
- `host: 0.0.0.0`, `allowedHosts: true`, reads `PORT` env var.

## Routes
- `/` — landing → dashboard (loads straight in, no sign-in).
- `?broadcast=<peerId>` — phone-side broadcaster page that streams a webcam feed to the dashboard.

## Local Run
1. `pnpm install` at repo root.
2. `pnpm dev` (or `pnpm --filter @workspace/crowd-intel dev`) — frontend on `http://localhost:22338`.

## Deployment
- Static deployment configured for the frontend.
- Build: `pnpm --filter @workspace/crowd-intel run build`
- Public dir: `artifacts/crowd-intel/dist/public`
