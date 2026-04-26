import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
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

  const vite = await createViteServer({
    configFile: path.resolve(__dirname, "..", "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);

  // HTTPS is OFF by default — we recommend the `pnpm tunnel` script for phone
  // camera access (gives you a real *.loca.lt URL with a valid cert, no
  // browser warnings). Set HTTPS=true to enable a local self-signed cert.
  const enableLocalHttps = process.env.HTTPS === "true";

  if (enableLocalHttps) {
    const selfsignedMod = (await import("selfsigned")) as unknown as {
      generate: (
        attrs: Array<{ name: string; value: string }>,
        opts?: Record<string, unknown>,
      ) => { private: string; cert: string };
    };
    const https = await import("node:https");
    const pems = selfsignedMod.generate(
      [{ name: "commonName", value: "trinetra.local" }],
      { days: 365 },
    );
    const server = https.createServer(
      { key: pems.private, cert: pems.cert },
      app,
    );
    server.listen(PORT, "0.0.0.0", () => {
      console.log(
        `[trinetra] dev server (HTTPS, self-signed) https://localhost:${PORT}`,
      );
    });
  } else {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[trinetra] dev server  http://localhost:${PORT}`);
      console.log(
        `[trinetra] for phone camera, run  pnpm tunnel  in a 2nd terminal`,
      );
    });
  }
}

main().catch((err) => {
  console.error("[trinetra] dev server failed to start:", err);
  process.exit(1);
});
