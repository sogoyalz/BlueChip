import { spawn, spawnSync, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { MongoMemoryServer } from "mongodb-memory-server";
import { startGeminiStub } from "../support/geminiStub";

declare global { var __bluechipDeploymentStop: (() => Promise<void>) | undefined; }
const container = `bluechip-deployment-check-${process.pid}`;
export default async function setup() {
  const root = path.resolve(__dirname, "../..");
  const mongo = await MongoMemoryServer.create();
  const gemini = await startGeminiStub();
  const sites = await fs.mkdtemp(path.join(os.tmpdir(), "bluechip-deployment-sites-"));
  let backend: ChildProcess | undefined;
  let startedContainer = false;
  const stop = async () => {
    if (startedContainer) spawnSync("docker", ["rm", "-f", container], { stdio: "ignore", timeout: 20_000 });
    if (backend && backend.exitCode === null) {
      const exited = new Promise<void>(resolve => backend!.once("exit", () => resolve()));
      backend.kill("SIGTERM");
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 12_000))]);
      if (backend.exitCode === null) backend.kill("SIGKILL");
    }
    await gemini.close(); await mongo.stop(); await fs.rm(sites, { recursive: true, force: true });
  };
  globalThis.__bluechipDeploymentStop = stop;
  try {
    const created = spawnSync("docker", ["create", "bluechip-fullstack:predeploy"], { encoding: "utf8", timeout: 20_000 });
    if (created.status !== 0) throw Error("Build the fullstack image before deployment verification");
    const sourceContainer = created.stdout.trim();
    try {
      const copied = spawnSync("docker", ["cp", `${sourceContainer}:/app/sites/.`, sites], { encoding: "utf8", timeout: 30_000 });
      if (copied.status !== 0) throw Error("Could not extract compiled sites from the production image");
    } finally { spawnSync("docker", ["rm", sourceContainer], { stdio: "ignore" }); }
    const logs: string[] = [];
    backend = spawn("node", ["dist/index.js"], { cwd: path.join(root, "backend"), env: {
      ...process.env, NODE_ENV: "production", PORT: "4320", MONGO_URL: mongo.getUri("deployment_fixture"),
      TOKEN_KEY: "isolated-deployment-fixture-signing-key-32-characters", COOKIE_SAMESITE: "lax",
      CORS_ORIGINS: "https://localhost:4343", RUN_MIGRATIONS: "false", OPERATOR_USER_IDS: "",
      STATIC_SITE_ROOT: sites,
      GEMINI_API_KEY: "", GEMINI_API_SECRET: "", GEMINI_PRIVATE_API_URL: "https://api.sandbox.gemini.com",
      GEMINI_API_URL: gemini.url, GEMINI_WS_URL: "ws://127.0.0.1:1", MONITORING_WEBHOOK_URL: "",
      AUTH_RATE_MAX: "1000", GENERAL_RATE_MAX: "10000",
    }, stdio: ["ignore", "pipe", "pipe"] });
    backend.stdout?.on("data", value => logs.push(String(value))); backend.stderr?.on("data", value => logs.push(String(value)));
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { ready = (await fetch("http://127.0.0.1:4320/backend/readyz")).ok; } catch { /* waiting for fixture boot */ }
      if (ready) break;
      if (backend.exitCode !== null) throw Error("Production fixture exited: " + logs.join("").slice(-1500));
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw Error("Production fixture did not become ready");
    const result = spawnSync("docker", ["run", "--detach", "--rm", "--name", container,
      "--publish", "127.0.0.1:4343:443", "--env", "SITE_ADDRESS=https://localhost",
      "--mount", `type=bind,source=${path.join(root, "e2e/deployment/Caddyfile")},target=/etc/caddy/Caddyfile,readonly`,
      "--env", "BACKEND_UPSTREAM=host.lima.internal:4320", "bluechip-gateway:predeploy"], { encoding: "utf8", timeout: 30_000 });
    if (result.status !== 0) throw Error("Could not start gateway fixture: " + result.stderr);
    startedContainer = true;
  } catch (error) { await stop(); throw error; }
}
