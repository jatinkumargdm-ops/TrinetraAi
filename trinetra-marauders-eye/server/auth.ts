import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getUserStore } from "./userStore";

const COOKIE_NAME = "trinetra_session";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/password authentication failed/i.test(msg)) {
    return "Database rejected credentials. Check your DATABASE_URL.";
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo/i.test(msg)) {
    return "Database is unreachable. Check that DATABASE_URL points to a running Postgres instance.";
  }
  return "Server error";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedSecret: string | null = null;

function loadOrCreateLocalSecret(): string {
  const secretsDir = path.resolve(__dirname, "..", ".local");
  const secretPath = path.join(secretsDir, "jwt-secret");
  try {
    const existing = fs.readFileSync(secretPath, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    // file doesn't exist yet
  }
  const generated = crypto.randomBytes(48).toString("base64url");
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[auth] WARNING: NODE_ENV=production but no JWT_SECRET set. " +
        "Generated an in-memory secret — every server restart will sign " +
        "users out. Set JWT_SECRET in your hosting environment to a long " +
        "random string (e.g. `openssl rand -base64 48`).",
    );
    return generated;
  }
  try {
    fs.mkdirSync(secretsDir, { recursive: true });
    fs.writeFileSync(secretPath, generated, { mode: 0o600 });
    console.log(
      `[auth] no JWT_SECRET set; generated one and stored it at ${secretPath}`,
    );
  } catch (err) {
    console.warn(
      "[auth] could not persist generated JWT secret to disk; sessions will be invalidated on restart:",
      err,
    );
  }
  return generated;
}

function getSecret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  cachedSecret = loadOrCreateLocalSecret();
  return cachedSecret;
}

function setSessionCookie(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, getSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
  });
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: "/",
  });
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body ?? {};
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof name !== "string"
    ) {
      res
        .status(400)
        .json({ error: "email, password, and name are required" });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (!EMAIL_RE.test(cleanEmail)) {
      res.status(400).json({ error: "Please enter a valid email." });
      return;
    }
    if (password.length < 8) {
      res
        .status(400)
        .json({ error: "Password must be at least 8 characters." });
      return;
    }
    if (cleanName.length < 1) {
      res.status(400).json({ error: "Please enter your name." });
      return;
    }

    const store = getUserStore();
    await store.init();
    const existing = await store.findByEmail(cleanEmail);
    if (existing) {
      res
        .status(409)
        .json({ error: "An account with this email already exists." });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await store.createUser({
      email: cleanEmail,
      name: cleanName,
      passwordHash,
    });
    setSessionCookie(res, created.id);
    res.status(201).json({
      user: { id: created.id, email: created.email, name: created.name },
    });
  } catch (err) {
    console.error("[auth] register error", err);
    res.status(500).json({ error: describeError(err) });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "email and password are required" });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const store = getUserStore();
    await store.init();
    const user = await store.findByEmail(cleanEmail);
    if (!user) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    setSessionCookie(res, user.id);
    res.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error("[auth] login error", err);
    res.status(500).json({ error: describeError(err) });
  }
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  try {
    const token = (req as { cookies?: Record<string, string> }).cookies?.[
      COOKIE_NAME
    ];
    if (!token) {
      res.status(200).json({ user: null });
      return;
    }

    let payload: JwtPayload;
    try {
      const decoded = jwt.verify(token, getSecret());
      if (typeof decoded === "string") {
        res.status(200).json({ user: null });
        return;
      }
      payload = decoded;
    } catch {
      res.status(200).json({ user: null });
      return;
    }
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) {
      res.status(200).json({ user: null });
      return;
    }

    const store = getUserStore();
    await store.init();
    const user = await store.findById(userId);
    if (!user) {
      res.status(200).json({ user: null });
      return;
    }
    res.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error("[auth] me error", err);
    res.status(500).json({ error: describeError(err) });
  }
});
