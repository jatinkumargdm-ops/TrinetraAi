import { MongoClient, type Db } from "mongodb";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let connectingPromise: Promise<Db> | null = null;

function parseDbName(uri: string): string | null {
  try {
    const normalized = uri
      .replace(/^mongodb\+srv:\/\//, "https://")
      .replace(/^mongodb:\/\//, "http://");
    const u = new URL(normalized);
    const path = u.pathname.replace(/^\//, "").split("?")[0];
    return path && path.length > 0 ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}

export async function getDb(): Promise<Db> {
  if (cachedDb) return cachedDb;
  if (connectingPromise) return connectingPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add it as a Replit secret to enable login.",
    );
  }

  connectingPromise = (async () => {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
    });
    await client.connect();
    const dbName = parseDbName(uri) || "trinetra";
    const db = client.db(dbName);
    await db
      .collection("users")
      .createIndex({ email: 1 }, { unique: true })
      .catch((err) => {
        console.warn("[db] failed to ensure users.email index:", err.message);
      });
    cachedClient = client;
    cachedDb = db;
    console.log(`[db] connected to MongoDB database "${dbName}"`);
    return db;
  })();

  try {
    return await connectingPromise;
  } finally {
    connectingPromise = null;
  }
}

export async function closeDb(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
  }
}
