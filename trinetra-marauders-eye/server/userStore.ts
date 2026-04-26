import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
};

export type UserStore = {
  kind: "postgres" | "file";
  init(): Promise<void>;
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<StoredUser>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cached: UserStore | null = null;

export function getUserStore(): UserStore {
  if (cached) return cached;
  if (process.env.DATABASE_URL) {
    cached = createPostgresStore(process.env.DATABASE_URL);
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[db] WARNING: NODE_ENV=production but no DATABASE_URL set. " +
          "Falling back to a JSON file user store on the local filesystem. " +
          "On hosts with ephemeral disks (Railway, Render, Fly, Heroku) " +
          "this means every user will be wiped on the next deploy/restart. " +
          "Add a Postgres database and set DATABASE_URL to fix this.",
      );
    }
    cached = createFileStore();
  }
  return cached;
}

function shouldUseSsl(connectionString: string): boolean {
  // Force SSL off for explicit local connections, force on for everything
  // else (Railway, Render, Neon, Supabase all require SSL).
  if (process.env.PGSSLMODE === "disable") return false;
  if (process.env.PGSSLMODE === "require") return true;
  try {
    const u = new URL(connectionString);
    if (u.searchParams.get("sslmode") === "disable") return false;
    if (u.searchParams.get("sslmode") === "require") return true;
    const host = u.hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host === "postgres" || // common Docker compose service name
      host === "db"
    ) {
      return false;
    }
  } catch {
    // fall through
  }
  return true;
}

function createPostgresStore(connectionString: string): UserStore {
  const useSsl = shouldUseSsl(connectionString);
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    // Managed Postgres providers (Railway, Render, Heroku, Neon, Supabase)
    // serve certs that Node's default CA bundle doesn't trust, so we accept
    // the cert without verifying its CA chain. Connection is still encrypted.
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });
  pool.on("error", (err) => console.error("[db] pool error:", err));

  let initPromise: Promise<void> | null = null;
  async function ensureSchema() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id            BIGSERIAL PRIMARY KEY,
          email         TEXT NOT NULL UNIQUE,
          name          TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));`,
      );
      console.log(
        `[db] connected to Postgres (ssl=${useSsl}), users table ready`,
      );
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
    return initPromise;
  }

  function rowToUser(row: {
    id: string;
    email: string;
    name: string;
    password_hash: string;
    created_at: Date;
  }): StoredUser {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      createdAt: row.created_at.toISOString(),
    };
  }

  return {
    kind: "postgres",
    init: ensureSchema,
    async findByEmail(email) {
      await ensureSchema();
      const r = await pool.query(
        `SELECT id::text, email, name, password_hash, created_at
         FROM users WHERE email = $1`,
        [email],
      );
      return r.rows[0] ? rowToUser(r.rows[0]) : null;
    },
    async findById(id) {
      await ensureSchema();
      let r;
      try {
        r = await pool.query(
          `SELECT id::text, email, name, password_hash, created_at
           FROM users WHERE id = $1::bigint`,
          [id],
        );
      } catch {
        return null;
      }
      return r.rows[0] ? rowToUser(r.rows[0]) : null;
    },
    async createUser({ email, name, passwordHash }) {
      await ensureSchema();
      const r = await pool.query(
        `INSERT INTO users (email, name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id::text, email, name, password_hash, created_at`,
        [email, name, passwordHash],
      );
      return rowToUser(r.rows[0]);
    },
  };
}

function createFileStore(): UserStore {
  const dataDir = path.resolve(__dirname, "..", ".local");
  const filePath = path.join(dataDir, "users.json");
  let memory: { users: StoredUser[]; nextId: number } | null = null;

  function load() {
    if (memory) return memory;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as {
        users?: StoredUser[];
        nextId?: number;
      };
      memory = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        nextId: typeof parsed.nextId === "number" ? parsed.nextId : 1,
      };
    } catch {
      memory = { users: [], nextId: 1 };
    }
    return memory;
  }

  function persist() {
    const m = load();
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(m, null, 2), { mode: 0o600 });
  }

  return {
    kind: "file",
    async init() {
      load();
      console.log(
        `[db] no DATABASE_URL set; using local file user store at ${filePath}`,
      );
    },
    async findByEmail(email) {
      return load().users.find((u) => u.email === email) ?? null;
    },
    async findById(id) {
      return load().users.find((u) => u.id === id) ?? null;
    },
    async createUser({ email, name, passwordHash }) {
      const m = load();
      const id = String(m.nextId++);
      const user: StoredUser = {
        id,
        email,
        name,
        passwordHash,
        createdAt: new Date().toISOString(),
      };
      m.users.push(user);
      persist();
      return user;
    },
  };
}
