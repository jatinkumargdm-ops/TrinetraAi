import pg from "pg";

const { Pool } = pg;

let cachedPool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (cachedPool) return cachedPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. The Replit PostgreSQL database is not provisioned.",
    );
  }
  cachedPool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  cachedPool.on("error", (err) => {
    console.error("[db] unexpected pool error:", err);
  });
  return cachedPool;
}

let initPromise: Promise<void> | null = null;

export function ensureUsersTable(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const pool = getPool();
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
    console.log("[db] connected to Postgres, users table ready");
  })().catch((err) => {
    initPromise = null;
    throw err;
  });
  return initPromise;
}

export async function closeDb(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = null;
    initPromise = null;
  }
}
