import express, { Express } from "express";
import path from "node:path";
import fs from "node:fs";
import helmet from "helmet";

/** Optional single-service hosting; API-only development remains unchanged. */
export function createHostedApp(api: Express, root: string): Express {
  const landing = path.resolve(root, "landing"), dashboard = path.resolve(root, "dashboard");
  for (const directory of [landing, dashboard]) {
    if (!fs.existsSync(path.join(directory, "index.html"))) throw new Error("Static site build is missing index.html");
  }
  const hosted = express();
  // /app redirects once; /app/ must serve its index instead of matching again.
  hosted.enable("strict routing");
  hosted.set("trust proxy", 1);
  hosted.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
  hosted.use("/backend", api);
  // Unknown API requests must never receive a successful SPA HTML response.
  hosted.use("/backend", (_req, res) => { res.status(404).json({ message: "API route not found" }); });
  hosted.get("/app", (_req, res) => { res.redirect(308, "/app/"); });
  hosted.use("/app", express.static(dashboard));
  hosted.get("/app/{*rest}", (_req, res) => { res.sendFile(path.join(dashboard, "index.html")); });
  hosted.use(express.static(landing));
  hosted.get("/{*rest}", (_req, res) => { res.sendFile(path.join(landing, "index.html")); });
  return hosted;
}
