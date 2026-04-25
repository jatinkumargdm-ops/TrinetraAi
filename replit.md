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
- `artifacts/crowd-intel/` — the React app (workspace package `@workspace/crowd-intel`)
- `artifacts/auth-server/` — Express + Mongoose auth API (workspace package `@workspace/auth-server`)
- `lib/` — shared workspace libs
- `scripts/` — workspace scripts
- `attached_assets/` — alias `@assets`
- `artifacts/api-server/` and `artifacts/mockup-sandbox/` — leftover scaffolding, not used
- `.data/mongo/` — local MongoDB data dir (git-ignored)

## Replit Setup (3 workflows)
- `Start application` — `PORT=5000 pnpm --filter @workspace/crowd-intel dev` (port 5000, webview)
- `Auth Server` — `AUTH_PORT=3001 MONGODB_URI=mongodb://127.0.0.1:27017/trinetra pnpm --filter @workspace/auth-server run dev` (port 3001, console)
- `MongoDB` — `mongod --dbpath .data/mongo --bind_ip 127.0.0.1 --port 27017 --quiet` (port 27017, console)
- Vite proxies `/_api` → `127.0.0.1:3001`, so the frontend just calls relative `/_api/auth/*` URLs.
- IMPORTANT: do NOT use the `/api/*` prefix — Replit's edge proxy reserves that path and returns 502 before requests reach Vite. We use `/_api/*` instead.
- `host: 0.0.0.0`, `allowedHosts: true`, reads `PORT` env var.

## Auth
- MongoDB-backed login. Default URI `mongodb://127.0.0.1:27017/trinetra` (override with `MONGODB_URI`).
- Endpoints: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- JWT in httpOnly cookie `trinetra_token`, 7-day expiry. Override secret with `JWT_SECRET`.
- Passwords hashed with bcryptjs (cost 10). User schema: `{ email, name, passwordHash }`.
- Frontend `Gate` in `src/App.tsx` checks `/api/auth/me` on load and shows `Auth.tsx` (login/signup) when unauthenticated. Broadcaster route (`?broadcast=...`) is intentionally public.

## Local Run (Windows / VS Code)
1. Install MongoDB Community and run `mongod` (default port 27017).
2. `pnpm install` at repo root.
3. In one terminal: `pnpm --filter @workspace/auth-server dev` (auth API on :3001).
4. In another: `pnpm --filter @workspace/crowd-intel dev` (frontend on :5000).
5. The DB name is taken from the URI path; default is `trinetra`. Change it by setting `MONGODB_URI=mongodb://127.0.0.1:27017/<your-db-name>`.

## Deployment
- Static deployment configured for the frontend only.
- Build: `pnpm --filter @workspace/crowd-intel run build`
- Public dir: `artifacts/crowd-intel/dist/public`
- Note: static deployment does NOT include the auth server or MongoDB. To deploy with auth, switch to a server-style deployment and provide a `MONGODB_URI` (e.g. MongoDB Atlas).
