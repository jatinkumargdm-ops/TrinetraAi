import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import {
  clearAuthCookie,
  comparePassword,
  ensureMongo,
  hashPassword,
  requireAuth,
  setAuthCookie,
  signToken,
  toSessionUser,
} from "../lib/auth.js";

export const authRouter = Router();

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

function firstZodError(err: z.ZodError): string {
  const issue = err.issues[0];
  return issue?.message ?? "Invalid input";
}

authRouter.post("/signup", async (req, res, next) => {
  try {
    if (!ensureMongo(res)) return;
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: firstZodError(parsed.error) });
      return;
    }
    const { name, email, password } = parsed.data;

    const existing = await User.findOne({ email }).lean();
    if (existing) {
      res
        .status(409)
        .json({ error: "An account with that email already exists." });
      return;
    }

    const passwordHash = await hashPassword(password);
    const created = await User.create({ email, name, passwordHash });
    const session = toSessionUser(created);
    const token = signToken(session);
    setAuthCookie(res, token);
    res.status(201).json({ user: session });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    if (!ensureMongo(res)) return;
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: firstZodError(parsed.error) });
      return;
    }
    const { email, password } = parsed.data;

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ error: "Wrong email or password." });
      return;
    }
    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Wrong email or password." });
      return;
    }
    const session = toSessionUser(user);
    const token = signToken(session);
    setAuthCookie(res, token);
    res.json({ user: session });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
