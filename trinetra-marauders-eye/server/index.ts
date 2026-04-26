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

  app.use("/api", createApiApp());

  const distDir = path.resolve(__dirname, "..", "dist", "public");
  app.use(express.static(distDir, { index: false, extensions: ["html"] }));
  app.get("*", (_req, res) => {
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
