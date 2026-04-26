import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { getDb } from "./db";

const COOKIE_NAME = "trinetra_session";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function describeDbError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/MONGODB_URI is not set/i.test(msg)) {
    return "Database is not configured. MONGODB_URI secret is missing.";
  }
  if (/Authentication failed|bad auth/i.test(msg)) {
    return "Database rejected credentials. Check the username/password in your MONGODB_URI secret.";
  }
  if (/tlsv1 alert internal error|SSL routines|ERR_SSL_TLSV1_ALERT/i.test(msg)) {
    return "MongoDB Atlas refused the connection (TLS rejected). This usually means this server's IP is not allowed in Atlas Network Access. Open Atlas → Network Access → Add IP Address → 0.0.0.0/0 (Allow from Anywhere).";
  }
  if (
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo|querySrv|server selection/i.test(
      msg,
    )
  ) {
    return "Database is unreachable. The MONGODB_URI secret looks invalid or the cluster is offline. Check your MongoDB Atlas connection string.";
  }
  return "Server error";
}

function getSecret(): string {
  const s = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "JWT_SECRET or SESSION_SECRET must be set (>=16 chars) to sign auth tokens.",
    );
  }
  return s;
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

    const db = await getDb();
    const users = db.collection("users");
    const existing = await users.findOne({ email: cleanEmail });
    if (existing) {
      res
        .status(409)
        .json({ error: "An account with this email already exists." });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    const result = await users.insertOne({
      email: cleanEmail,
      name: cleanName,
      passwordHash,
      createdAt: now,
    });
    setSessionCookie(res, result.insertedId.toString());
    res.status(201).json({
      user: {
        id: result.insertedId.toString(),
        email: cleanEmail,
        name: cleanName,
      },
    });
  } catch (err) {
    console.error("[auth] register error", err);
    res.status(500).json({ error: describeDbError(err) });
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
    const db = await getDb();
    const users = db.collection("users");
    const user = await users.findOne({ email: cleanEmail });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    const ok = await bcrypt.compare(password, user.passwordHash as string);
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    setSessionCookie(res, user._id.toString());
    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    console.error("[auth] login error", err);
    res.status(500).json({ error: describeDbError(err) });
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

    const db = await getDb();
    const users = db.collection("users");
    let oid: ObjectId;
    try {
      oid = new ObjectId(userId);
    } catch {
      res.status(200).json({ user: null });
      return;
    }
    const user = await users.findOne({ _id: oid });
    if (!user) {
      res.status(200).json({ user: null });
      return;
    }
    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    console.error("[auth] me error", err);
    res.status(500).json({ error: describeDbError(err) });
  }
});
