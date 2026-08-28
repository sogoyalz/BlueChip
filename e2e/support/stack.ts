import { ChildProcess, spawn, spawnSync } from "child_process";
import http from "http";
import path from "path";
import fs from "fs";
import net from "net";

import { MongoMemoryServer } from "mongodb-memory-server";

import { startGeminiStub, GeminiStub } from "./geminiStub";

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "e2e/.builds");

/**
 * Fixed ports, because both React apps bake each other's origins into their
 * bundles at build time — the dashboard needs to know where login lives before
 * it is compiled, so the ports cannot be assigned at runtime.
 */
export const PORTS = { api: 4310, landing: 4300, dashboard: 4301 } as const;

export const URLS = {
  api: `http://127.0.0.1:${PORTS.api}`,
  landing: `http://127.0.0.1:${PORTS.landing}`,
  dashboard: `http://127.0.0.1:${PORTS.dashboard}`,
} as const;

export interface Stack {
  gemini: GeminiStub;
  stop: () => Promise<void>;
}

async function assertPortFree(port: number, label: string) {
  await new Promise<void>((resolve, reject) => {
    const probe = net
      .createServer()
      .once("error", () =>
        reject(
          new Error(
            `port ${port} (${label}) is already in use — stop whatever holds it and retry`,
          ),
        ),
      )
      .once("listening", () => probe.close(() => resolve()))
      .listen(port, "127.0.0.1");
  });
}

/**
 * Builds an app into e2e/.builds/<name>, but only when it has to. The marker
 * records the environment the bundle was compiled with; if that is unchanged
 * and no source file is newer, the previous build stands.
 */
function buildApp(name: "frontend" | "dashboard", env: Record<string, string>) {
  const outDir = path.join(OUT, name);
  const marker = path.join(outDir, ".e2e-build.json");
  const want = JSON.stringify(env);

  const newestSource = (dir: string): number => {
    let newest = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      newest = Math.max(
        newest,
        entry.isDirectory() ? newestSource(full) : fs.statSync(full).mtimeMs,
      );
    }
    return newest;
  };

  // Everything the bundle is built FROM, not just src/. Watching src alone
  // meant an edit to index.html or vite.config.ts served a stale bundle and
  // the suite passed against code that no longer existed — silently testing
  // the wrong thing is worse than failing.
  const inputs = ["src", "index.html", "vite.config.ts", "package.json"].map((f) =>
    path.join(ROOT, name, f),
  );
  const newestInput = () =>
    Math.max(
      ...inputs.filter(fs.existsSync).map((f) =>
        fs.statSync(f).isDirectory() ? newestSource(f) : fs.statSync(f).mtimeMs,
      ),
    );

  if (fs.existsSync(marker)) {
    const previous = JSON.parse(fs.readFileSync(marker, "utf8"));
    const sameEnv = JSON.stringify(previous.env) === want;
    if (sameEnv && newestInput() < previous.builtAt) return outDir;
  }

  process.stdout.write(`[e2e] building ${name}…\n`);
  const result = spawnSync("npx", ["vite", "build", "--outDir", outDir, "--emptyOutDir"], {
    cwd: path.join(ROOT, name),
    env: { ...process.env, ...env, CI: "true" },
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${name} build failed:\n${result.stdout}\n${result.stderr}`);
  }
  fs.writeFileSync(
    marker,
    JSON.stringify({ env: JSON.parse(want), builtAt: Date.now() }),
  );
  return outDir;
}

/** Static file server with the SPA fallback Netlify provides in production. */
function serveSpa(dir: string, port: number) {
  const TYPES: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".txt": "text/plain",
  };

  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = path.join(dir, requested);
    // Anything that is not a real file is a client route: hand back index.html
    // so react-router resolves it, exactly as the Netlify redirect does.
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(dir, "index.html");
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise<{ close: () => Promise<void> }>((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({ close: () => new Promise<void>((r) => server.close(() => r())) }),
    );
  });
}

async function waitForHealth(proc: ChildProcess, log: string[]) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`backend exited (${proc.exitCode}):\n${log.join("")}`);
    }
    try {
      if ((await fetch(`${URLS.api}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`backend never became healthy:\n${log.join("")}`);
}

export async function startStack(): Promise<Stack> {
  for (const [label, port] of Object.entries(PORTS)) {
    await assertPortFree(port, label);
  }

  const landingDir = buildApp("frontend", {
    REACT_APP_API_URL: URLS.api,
    REACT_APP_DASHBOARD_URL: URLS.dashboard,
  });
  const dashboardDir = buildApp("dashboard", {
    REACT_APP_API_URL: URLS.api,
    REACT_APP_LOGIN_URL: `${URLS.landing}/login`,
  });

  const mongo = await MongoMemoryServer.create();
  const gemini = await startGeminiStub();
  const landing = await serveSpa(landingDir, PORTS.landing);
  const dashboard = await serveSpa(dashboardDir, PORTS.dashboard);

  const log: string[] = [];
  const backend = spawn("node", ["dist/index.js"], {
    cwd: path.join(ROOT, "backend"),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORTS.api),
      MONGO_URL: mongo.getUri("e2e"),
      TOKEN_KEY: "e2e-only-token-key-that-is-long-enough-to-boot",
      CORS_ORIGINS: `${URLS.landing},${URLS.dashboard}`,
      GEMINI_API_KEY: "e2e-key",
      GEMINI_API_SECRET: "e2e-secret",
      GEMINI_API_URL: gemini.url,
      GEMINI_PRIVATE_API_URL: gemini.url,
      // The balance cache would otherwise hide the post-fill invalidation the
      // journey checks for.
      GEMINI_BALANCES_TTL_MS: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  backend.stdout?.on("data", (d) => log.push(String(d)));
  backend.stderr?.on("data", (d) => log.push(String(d)));

  await waitForHealth(backend, log);

  return {
    gemini,
    stop: async () => {
      backend.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 600));
      if (backend.exitCode === null) backend.kill("SIGKILL");
      await landing.close();
      await dashboard.close();
      await gemini.close();
      await mongo.stop();
    },
  };
}
