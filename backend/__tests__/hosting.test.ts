import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHostedApp } from "../hosting";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "bluechip-hosting-"));
  for (const site of ["landing", "dashboard"]) {
    fs.mkdirSync(path.join(root, site));
    fs.writeFileSync(path.join(root, site, "index.html"), `<h1>${site}</h1>`);
  }
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

test("the landing and dashboard keep separate SPA fallbacks and nested assets", async () => {
  fs.writeFileSync(path.join(root, "dashboard", "logo.svg"), "<svg></svg>");
  const hosted = createHostedApp(express(), root);
  expect((await request(hosted).get("/login")).text).toContain("landing");
  expect((await request(hosted).get("/app/orders")).text).toContain("dashboard");
  const dashboardHome = await request(hosted).get("/app/");
  expect(dashboardHome.status).toBe(200);
  expect(dashboardHome.text).toContain("dashboard");
  expect((await request(hosted).get("/app/logo.svg")).headers["content-type"]).toMatch(/svg/);
  expect((await request(hosted).get("/app")).headers.location).toBe("/app/");
});

test("API requests preserve their body and missing API routes never return SPA HTML", async () => {
  const api = express(); api.use(express.json()); api.post("/echo", (req, res) => { res.json(req.body); });
  const hosted = createHostedApp(api, root);
  expect((await request(hosted).post("/backend/echo").send({ original: true })).body).toEqual({ original: true });
  for (const method of ["get", "post"] as const) {
    const missing = await request(hosted)[method]("/backend/missing");
    expect(missing.status).toBe(404); expect(missing.body).toEqual({ message: "API route not found" });
  }
});

test("an incomplete static bundle fails before the server can accept traffic", () => {
  fs.unlinkSync(path.join(root, "dashboard", "index.html"));
  expect(() => createHostedApp(express(), root)).toThrow(/build is missing/);
});
