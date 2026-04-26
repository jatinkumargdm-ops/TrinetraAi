import express from "express";
import cookieParser from "cookie-parser";
import { authRouter } from "./auth";

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/auth", authRouter);
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  return app;
}
