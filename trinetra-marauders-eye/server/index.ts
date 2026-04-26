import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createApiApp } from "./api";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 5000);
if (Number.isNaN(PORT) || PORT <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

async function main() {
  const app = express();
  app.disable("x-powered-by");

  // Required when running behind a TLS-terminating proxy (Railway, Render,
  // Fly, Heroku, etc.) so that req.secure is correct and `secure` cookies
  // are actually sent on the proxied HTTPS connection.
  app.set("trust proxy", 1);

  app.use("/api", createApiApp());

  const distDir = path.resolve(__dirname, "..", "dist", "public");
  app.use(express.static(distDir, { index: false, extensions: ["html"] }));

  // SPA fallback. NOTE: Express 5 / path-to-regexp v6 no longer accepts "*"
  // as a path string — it throws "Missing parameter name". Use a middleware
  // (no path) instead so every unmatched GET serves index.html.
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(distDir, "index.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[trinetra] production server listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error("[trinetra] failed to start:", err);
  process.exit(1);
});
