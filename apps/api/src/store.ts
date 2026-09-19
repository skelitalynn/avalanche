import { DatabaseSync } from "node:sqlite";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export const digest = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
export class Store {
  readonly db: DatabaseSync;
  readonly key: Buffer;
  constructor(path: string, key: string) {
    this.key = Buffer.from(key, "hex");
    if (this.key.length !== 32)
      throw Error("DATA_ENCRYPTION_KEY must be 32 bytes hex");
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,address TEXT,message TEXT,expires INTEGER,consumed INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,address TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS agreements(id TEXT PRIMARY KEY,a TEXT,b TEXT,panel TEXT,hash TEXT,body TEXT,created INTEGER,situation TEXT UNIQUE,deleted INTEGER DEFAULT 0,UNIQUE(a,hash));
 CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,situation TEXT,kind TEXT,owner TEXT,unique_key TEXT,body TEXT,confirmed INTEGER DEFAULT 0,created INTEGER,UNIQUE(situation,kind,unique_key));
 CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY,situation TEXT,dispute TEXT,owner TEXT,commitment TEXT,body TEXT,created INTEGER);
 CREATE TABLE IF NOT EXISTS idempotency(id TEXT PRIMARY KEY,request_hash TEXT,response TEXT,status INTEGER,created INTEGER);
 `);
  }
  seal(data: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(data)),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
  }
  open<T = any>(sealed: string): T {
    const raw = Buffer.from(sealed, "base64");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      raw.subarray(0, 12),
    );
    cipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        cipher.update(raw.subarray(28)),
        cipher.final(),
      ]).toString(),
    );
  }
  unique(s: string) {
    return createHmac("sha256", this.key).update(s).digest("hex");
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
