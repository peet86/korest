/**
 * KoRest — self-hosted KOReader sync server for Readest App (koreader-sync-server compatible HTTP API).
 */

import { mkdirSync } from 'fs';
import { timingSafeEqual } from 'crypto';
import { dirname } from 'path';
import Database from 'better-sqlite3';
import Fastify from 'fastify';

const APP_NAME = 'KoRest';
const APP_TAGLINE = 'Self-hosted KOReader sync server for Readest';

const port = Number(process.env.PORT || 4242);
const dbPath = (process.env.KOREST_DATABASE_PATH || '/data/korest.db').trim();
const logIncoming =
  (process.env.LOG_INCOMING_REQUESTS ?? process.env.LOG_REQUEST_PAYLOADS ?? 'true').toLowerCase() !== 'false';

/** @type {import('better-sqlite3').Database} */
let db;

function normUsername(u) {
  return String(u || '').trim();
}

function normPasswordKey(p) {
  return String(p || '').trim();
}

function validPasswordKey(p) {
  const s = normPasswordKey(p);
  return s.length > 0 && s.length <= 256 && !s.includes('\n');
}

function progressKey(username, passwordKey, document) {
  const u = normUsername(username);
  const p = normPasswordKey(passwordKey);
  const d = String(document || '').trim();
  const hex = d.toLowerCase();
  const docNorm = /^[a-f0-9]{32}$/.test(hex) ? hex : d;
  return `${u}\n${p}\n${docNorm}`;
}

function secretEqual(a, b) {
  const x = Buffer.from(normPasswordKey(a), 'utf8');
  const y = Buffer.from(normPasswordKey(b), 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

function getStoredPassword(username) {
  const row = db.prepare('SELECT password_key AS p FROM users WHERE username = ?').get(normUsername(username));
  return row?.p != null ? String(row.p) : null;
}

function authOk(user, key) {
  if (!normUsername(user) || !normPasswordKey(key)) return false;
  const stored = getStoredPassword(user);
  if (stored == null) return false;
  return secretEqual(stored, key);
}

function ensureDirForFile(filePath) {
  const dir = dirname(filePath);
  if (dir && dir !== '.') {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
  }
}

function initSchema() {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY NOT NULL,
      password_key TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS progress (
      id TEXT PRIMARY KEY NOT NULL,
      progress TEXT NOT NULL,
      percentage REAL NOT NULL,
      device TEXT NOT NULL,
      device_id TEXT NOT NULL DEFAULT '',
      timestamp INTEGER NOT NULL
    );
  `);
}

function openDb() {
  ensureDirForFile(dbPath);
  db = new Database(dbPath);
  initSchema();
}

function getProgressRow(id) {
  return db
    .prepare(
      `SELECT progress, percentage, device, device_id, timestamp
       FROM progress WHERE id = ?`,
    )
    .get(id);
}

function validDocument(document) {
  const d = String(document || '').trim();
  if (!d || d.includes(':') || d.length > 512) return false;
  return true;
}

function parsePercentage(raw) {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function redactHeaders(raw) {
  const h = { ...raw };
  for (const k of Object.keys(h)) {
    const lk = k.toLowerCase();
    if (lk === 'x-auth-key' || lk === 'authorization' || lk === 'cookie') {
      h[k] = '[redacted]';
    }
  }
  return h;
}

function safeBodyForLog(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return body;
  const b = { ...body };
  if (typeof b.password === 'string') b.password = '[redacted]';
  if (typeof b.progress === 'string' && b.progress.length > 500) {
    b.progress = `${b.progress.slice(0, 500)}… (${b.progress.length} chars total)`;
  }
  return b;
}

const app = Fastify({
  logger: true,
  disableRequestLogging: true,
});

openDb();

if (logIncoming) {
  app.addHook('preHandler', async (req) => {
    req.log.info({
      msg: 'incoming_request',
      method: req.method,
      url: req.url,
      routerPath: req.routeOptions?.url,
      params: req.params,
      query: req.query,
      body: safeBodyForLog(req.body),
      headers: redactHeaders(req.headers),
      userAgent: req.headers['user-agent'],
    });
  });
}

app.addHook('onSend', async (_req, reply, payload) => {
  reply.header('Content-Type', 'application/json');
  return payload;
});

app.get('/healthstatus', async () => {
  const u = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  const p = db.prepare('SELECT COUNT(*) AS c FROM progress').get();
  return {
    message: 'healthy',
    app: APP_NAME,
    tagline: APP_TAGLINE,
    storage: 'sqlite',
    users: Number(u?.c) || 0,
    progress: Number(p?.c) || 0,
    database: dbPath,
  };
});

app.post('/users/create', async (req, reply) => {
  const body = req.body || {};
  const username = normUsername(body.username);
  const password = body.password != null ? String(body.password) : '';

  if (!username || !validPasswordKey(password)) {
    return reply.code(400).send({ message: 'Invalid request' });
  }

  const existing = getStoredPassword(username);
  if (existing != null) {
    if (secretEqual(existing, password)) {
      return reply.code(201).send({ username });
    }
    return reply.code(409).send({ message: 'Username already registered' });
  }

  try {
    db.prepare('INSERT INTO users (username, password_key) VALUES (?, ?)').run(username, normPasswordKey(password));
  } catch (e) {
    req.log.error({ err: e }, 'user insert failed');
    return reply.code(500).send({ message: 'Unknown server error' });
  }

  return reply.code(201).send({ username });
});

app.get('/users/auth', async (req, reply) => {
  const user = req.headers['x-auth-user'];
  const key = req.headers['x-auth-key'];
  if (!authOk(user, key)) return reply.code(401).send({ message: 'Unauthorized' });
  return { authorized: 'OK' };
});

const upsertProgress = db.prepare(
  `INSERT INTO progress (id, progress, percentage, device, device_id, timestamp)
   VALUES (@id, @progress, @percentage, @device, @device_id, @timestamp)
   ON CONFLICT(id) DO UPDATE SET
     progress = excluded.progress,
     percentage = excluded.percentage,
     device = excluded.device,
     device_id = excluded.device_id,
     timestamp = excluded.timestamp`,
);

const deleteProgress = db.prepare('DELETE FROM progress WHERE id = ?');

app.put('/syncs/progress', async (req, reply) => {
  const user = req.headers['x-auth-user'];
  const key = req.headers['x-auth-key'];
  if (!authOk(user, key)) return reply.code(401).send({ message: 'Unauthorized' });

  const body = req.body || {};
  const { document, progress: prog, percentage, device, device_id } = body;
  if (!document || prog === undefined || percentage === undefined || !device) {
    return reply.code(500).send({ message: 'Unknown server error' });
  }

  if (!validDocument(String(document))) {
    return reply.code(400).send({ message: 'Invalid document id' });
  }

  const pct = parsePercentage(percentage);
  if (pct === null) return reply.code(400).send({ message: 'Invalid percentage' });

  const u = normUsername(user);
  const k = normPasswordKey(key);
  const doc = String(document).trim();
  const pk = progressKey(u, k, doc);
  const hex = doc.toLowerCase();
  const docNorm = /^[a-f0-9]{32}$/.test(hex) ? hex : doc;
  const legacyKey = `${u}\n${docNorm}`;
  if (legacyKey !== pk) deleteProgress.run(legacyKey);

  const ts = Math.floor(Date.now() / 1000);

  try {
    upsertProgress.run({
      id: pk,
      progress: prog === null || prog === undefined ? '' : String(prog),
      percentage: pct,
      device: String(device),
      device_id: device_id != null ? String(device_id) : '',
      timestamp: ts,
    });
  } catch (e) {
    req.log.error({ err: e }, 'progress upsert failed');
    return reply.code(500).send({ message: 'Unknown server error' });
  }

  return { document: doc, timestamp: ts };
});

app.get('/syncs/progress/:document', async (req, reply) => {
  const user = req.headers['x-auth-user'];
  const key = req.headers['x-auth-key'];
  if (!authOk(user, key)) return reply.code(401).send({ message: 'Unauthorized' });

  const document = req.params.document;
  if (!document || !validDocument(String(document))) {
    return reply.code(500).send({ message: 'Unknown server error' });
  }

  const u = normUsername(user);
  const k = normPasswordKey(key);
  const doc = String(document).trim();
  const pk = progressKey(u, k, doc);
  let row = getProgressRow(pk);

  if (!row) {
    const hex = doc.toLowerCase();
    const docNorm = /^[a-f0-9]{32}$/.test(hex) ? hex : doc;
    const legacyKey = `${u}\n${docNorm}`;
    row = getProgressRow(legacyKey);
  }

  if (!row) return {};

  return {
    username: u,
    document: doc,
    progress: row.progress,
    percentage: row.percentage,
    device: row.device,
    device_id: row.device_id,
    timestamp: row.timestamp,
  };
});

app.setNotFoundHandler((req, reply) => {
  if (logIncoming) {
    req.log.warn(
      {
        msg: 'unknown_route',
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
      },
      'no handler for this path',
    );
  }
  reply.code(404).send({ message: 'Not found' });
});

app.listen({ port, host: '0.0.0.0' }).then(() => {
  const u = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  const p = db.prepare('SELECT COUNT(*) AS c FROM progress').get();
  app.log.info(
    {
      app: APP_NAME,
      port,
      database: dbPath,
      users: Number(u?.c) || 0,
      progress: Number(p?.c) || 0,
      logIncoming,
    },
    `${APP_NAME} listening`,
  );
}).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
