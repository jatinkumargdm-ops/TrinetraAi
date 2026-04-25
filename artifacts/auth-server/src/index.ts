import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import mongoose from "mongoose";
import { authRouter } from "./routes/auth.js";

const PORT = Number(process.env.AUTH_PORT ?? 3001);
const MONGODB_URI =
  process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/trinetra";

async function main() {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );

  // NOTE: Replit's edge proxy reserves the "/api/*" path prefix and returns
  // 502 before requests reach Vite, so we expose the backend under "/_api/*".
  app.get("/_api/health", (_req, res) => {
    res.json({
      ok: true,
      mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    });
  });

  app.use("/_api/auth", authRouter);

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const msg = err instanceof Error ? err.message : "Server error";
      console.error("[auth-server] error:", msg);
      res.status(500).json({ error: msg });
    },
  );

  // Connect to Mongo (don't crash if it isn't reachable yet — keep server alive
  // so the frontend gets a clear "database offline" message).
  mongoose.set("strictQuery", true);
  mongoose
    .connect(MONGODB_URI, { serverSelectionTimeoutMS: 4000 })
    .then(() => {
      console.log(`[auth-server] connected to MongoDB at ${MONGODB_URI}`);
    })
    .catch((err) => {
      console.error(
        `[auth-server] could not reach MongoDB at ${MONGODB_URI}:`,
        err.message,
      );
    });

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[auth-server] listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((err) => {
  console.error("[auth-server] fatal:", err);
  process.exit(1);
});
