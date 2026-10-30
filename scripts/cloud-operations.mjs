// Private local backups and read-only operational checks. Never trades or wakes Render.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { MongoClient, BSON } = require('mongodb');
const env = { ...parseEnv(await fs.readFile(path.join(root, 'backend/.env'), 'utf8')), ...process.env };
const directory = path.join(root, '.private/backups');
const mode = process.argv[2];
const canonical = value => BSON.EJSON.stringify(value, { relaxed: false });
if (!['backup', 'monitor', 'verify-restore'].includes(mode)) throw Error('Use backup, monitor, or verify-restore');
function key() {
  if (!/^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY ?? '')) throw Error('A private 32-byte hex BACKUP_ENCRYPTION_KEY is required');
  return Buffer.from(env.BACKUP_ENCRYPTION_KEY, 'hex');
}
function encrypt(payload) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(gzipSync(BSON.EJSON.stringify(payload, { relaxed: false }))), cipher.final()]);
  return Buffer.concat([Buffer.from('BLUECHIP1'), iv, cipher.getAuthTag(), data]);
}
function decrypt(data) {
  if (data.subarray(0, 9).toString() !== 'BLUECHIP1') throw Error('Invalid backup format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), data.subarray(9, 21));
  decipher.setAuthTag(data.subarray(21, 37));
  return BSON.EJSON.parse(gunzipSync(Buffer.concat([decipher.update(data.subarray(37)), decipher.final()])).toString(), { relaxed: false });
}
async function latest() {
  const files = (await fs.readdir(directory)).filter(x => /^bluechip-.*\.bluechip\.enc$/.test(x)).sort();
  if (!files.length) throw Error('No backup available');
  return files;
}
let client;
try {
  if (mode === 'verify-restore') {
    const files = await latest(), payload = decrypt(await fs.readFile(path.join(directory, files.at(-1))));
    // Reject tampering before any data is restored.
    const tampered = await fs.readFile(path.join(directory, files.at(-1)));
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => decrypt(tampered));
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    try {
      client = await new MongoClient(server.getUri()).connect();
      const db = client.db('backup_restore_verification');
      let documents = 0;
      for (const collection of payload.collections) {
        await db.createCollection(collection.name, collection.options);
        const target = db.collection(collection.name);
        if (collection.documents.length) await target.insertMany(collection.documents);
        for (const index of collection.indexes) {
          if (index.name === '_id_') continue;
          const { key: fields, v, ns, ...options } = index;
          await target.createIndex(fields, options);
        }
        const restored = await target.find({}).sort({ _id: 1 }).toArray();
        assert.equal(canonical(restored), canonical(collection.documents));
        const indexes = await target.listIndexes().toArray();
        const normalize = rows => rows.map(({ v, ns, ...index }) => BSON.EJSON.stringify(index)).sort();
        assert.deepEqual(normalize(indexes), normalize(collection.indexes));
        documents += restored.length;
      }
      console.log(JSON.stringify({ restoredIntoIsolatedFixture: true, collections: payload.collections.length, documents, indexesVerified: true, tamperingRejected: true }));
    } finally {
      await client?.close(); client = undefined;
      await server.stop();
    }
  } else {
    if (!env.ATLAS_MONGO_URL) throw Error('ATLAS_MONGO_URL is required');
    client = await new MongoClient(env.ATLAS_MONGO_URL, { serverSelectionTimeoutMS: 15000 }).connect();
    const db = client.db('bluechip');
    await db.command({ ping: 1 });
    if (mode === 'backup') {
      const collections = [];
      for (const info of await db.listCollections().toArray()) {
        if (info.type !== 'collection' || info.name.startsWith('system.')) continue;
        const collection = db.collection(info.name);
        collections.push({ name: info.name, options: info.options ?? {}, indexes: await collection.listIndexes().toArray(), documents: await collection.find({}).sort({ _id: 1 }).toArray() });
      }
      const payload = { version: 1, createdAt: new Date(), collections };
      const encrypted = encrypt(payload);
      assert.equal(canonical(decrypt(encrypted)), canonical(payload));
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      await fs.chmod(directory, 0o700);
      const name = `bluechip-${new Date().toISOString().replaceAll(':', '-')}.bluechip.enc`;
      await fs.writeFile(path.join(directory, name + '.partial'), encrypted, { mode: 0o600, flag: 'wx' });
      await fs.rename(path.join(directory, name + '.partial'), path.join(directory, name));
      // Keep the most recent 14 successful snapshots, never prune before validation.
      for (const old of (await latest()).slice(0, -14)) await fs.unlink(path.join(directory, old));
      console.log(JSON.stringify({ backupCreated: true, encrypted: true, collections: collections.length, documents: collections.reduce((n, c) => n + c.documents.length, 0), retained: (await latest()).length }));
    } else {
      const stale = { status: { $in: ['UNKNOWN', 'PENDING'] }, createdAt: { $lt: new Date(Date.now() - 10 * 60_000) } };
      const unresolved = await db.collection('orders').countDocuments(stale);
      let backupAgeHours = null;
      try { const files = await latest(); backupAgeHours = (Date.now() - (await fs.stat(path.join(directory, files.at(-1)))).mtimeMs) / 3600000; } catch {}
      const issues = [];
      if (unresolved) issues.push(`${unresolved} sandbox order(s) unresolved for more than ten minutes`);
      if (backupAgeHours === null || backupAgeHours > 36) issues.push('Private backup missing or older than 36 hours');
      console.log(JSON.stringify({ databaseReachable: true, unresolved, backupAgeHours, issues }));
      if (issues.length) process.exitCode = 2;
    }
  }
} catch {
  // Driver errors can contain connection strings. Keep failures secret-free.
  console.error(JSON.stringify({ success: false, mode, message: 'Operation failed; inspect private configuration/connectivity locally. No credentials have been printed.' }));
  process.exitCode = 1;
} finally { await client?.close(); }
