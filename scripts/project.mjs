import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apps = ["backend", "dashboard", "frontend"];
const command = process.argv[2];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(app, args) {
  const result = spawnSync(npm, args, { cwd: path.join(root, app), stdio: "inherit" });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (command === "dev") {
  const children = apps.map(app => spawn(npm, ["start"], { cwd: path.join(root, app), stdio: "inherit", detached: process.platform !== "win32" }));
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    children.forEach(child => {
      if (!child.pid || child.exitCode !== null) return;
      try {
        if (process.platform === "win32") child.kill("SIGTERM");
        else process.kill(-child.pid, "SIGTERM");
      } catch (error) { if (error.code !== "ESRCH") console.error(error.message); }
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  children.forEach(child => {
    child.on("error", error => { console.error(error.message); process.exitCode = 1; stop(); });
    child.on("exit", code => { if (!stopping) { process.exitCode = code || 1; stop(); } });
  });
} else if (command === "setup") {
  for (const app of [...apps, "e2e"]) run(app, ["ci"]);
} else if (command === "browsers") {
  run("e2e", ["exec", "--", "playwright", "install", "chromium"]);
} else if (command === "deployment") {
  run("backend", ["run", "build"]);
  for (const target of ["gateway", "fullstack"]) {
    const built = spawnSync("docker", ["build", "-f", "deploy/Dockerfile", "--target", target, "-t", `bluechip-${target}:predeploy`, "."], { cwd: root, stdio: "inherit" });
    if (built.error || built.status !== 0) process.exit(built.status ?? 1);
  }
  run("e2e", ["exec", "--", "playwright", "test", "--config", "deployment/playwright.config.ts"]);
} else if (command === "e2e") {
  run("backend", ["run", "build"]);
  run("e2e", ["test"]);
} else if (["build", "test", "check"].includes(command)) {
  if (command !== "test") for (const app of apps) run(app, ["run", "build"]);
  if (command !== "build") for (const app of apps) run(app, app === "backend" ? ["test", "--", "--runInBand"] : ["test"]);
  if (command === "check") run("e2e", ["test"]);
} else {
  console.error("Expected setup, browsers, dev, build, test, e2e or check");
  process.exitCode = 1;
}
