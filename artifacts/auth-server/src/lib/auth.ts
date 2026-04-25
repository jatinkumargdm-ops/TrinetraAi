import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { User, type UserDoc } from "../models/User.js";

const JWT_SECRET =
  process.env.JWT_SECRET ?? "trinetra-dev-only-secret-please-change-in-prod";
const JWT_EXPIRY = "7d";
export const COOKIE_NAME = "trinetra_token";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(user: SessionUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): SessionUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SessionUser & {
      iat: number;
      exp: number;
    };
    return { id: decoded.id, email: decoded.email, name: decoded.name };
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function toSessionUser(doc: UserDoc): SessionUser {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name,
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function ensureMongo(res: Response): boolean {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      error:
        "Database is offline. Make sure MongoDB is running at the configured URI.",
    });
    return false;
  }
  return true;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!ensureMongo(res)) return;
  const token = (req.cookies?.[COOKIE_NAME] ?? "") as string;
  if (!token) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  const session = verifyToken(token);
  if (!session) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  // Make sure the user still exists.
  const fresh = await User.findById(session.id).lean();
  if (!fresh) {
    clearAuthCookie(res);
    res.status(401).json({ error: "Account not found" });
    return;
  }
  req.user = {
    id: fresh._id.toString(),
    email: fresh.email,
    name: fresh.name,
  };
  next();
}
