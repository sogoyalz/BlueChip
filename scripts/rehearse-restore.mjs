// A fixture rehearsal using TWO isolated, temporary servers. Never reads .env.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const requireBackend = createRequire(new URL("../backend/package.json", import.meta.url));
const { MongoMemoryServer } = requireBackend("mongodb-memory-server");
const { MongoClient } = requireBackend("mongodb");
const servers = [], clients = [];
const dir = await mkdtemp(path.join(tmpdir(), "bluechip-restore-"));
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 60_000 });
  if (result.error || result.status !== 0) throw Error(`${command} failed; install MongoDB Database Tools and retry`);
}
try {
  for (let i = 0; i < 2; i++) {
    const server = await MongoMemoryServer.create(); servers.push(server);
    clients.push(await new MongoClient(server.getUri()).connect());
  }
  const source = clients[0].db("bluechip_rehearsal"), target = clients[1].db("bluechip_rehearsal");
  const fixture = { userId: "fixture-user", clientOrderId: "fixture-intent", exchangeClientOrderId: "fixture-exchange", status: "UNKNOWN",
    recentEvents: [{ kind: "INTENT_RECORDED", at: new Date("2026-01-01") }] };
  await source.collection("orders").createIndex({ userId: 1, clientOrderId: 1 }, { unique: true, partialFilterExpression: { clientOrderId: { $type: "string" } } });
  await source.collection("orders").insertOne(fixture);
  const archive = path.join(dir, "fixture.archive.gz");
  run("mongodump", ["--uri", servers[0].getUri("bluechip_rehearsal"), "--archive=" + archive, "--gzip"]);
  run("mongorestore", ["--uri", servers[1].getUri(), "--archive=" + archive, "--gzip", "--stopOnError"]);
  assert.deepEqual(await target.collection("orders").findOne({}), await source.collection("orders").findOne({}));
  assert.deepEqual(await target.collection("orders").listIndexes().toArray(), await source.collection("orders").listIndexes().toArray());
  await assert.rejects(target.collection("orders").insertOne({ ...fixture, _id: undefined }), { code: 11000 });
  console.log("PASS: isolated fixture dump/restore preserved the order, event date, and unique partial index. Production backup/restore was not exercised.");
} finally {
  await Promise.allSettled(clients.map(client => client.close()));
  await Promise.allSettled(servers.map(server => server.stop()));
  await rm(dir, { recursive: true, force: true });
}
