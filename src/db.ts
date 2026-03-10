import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../data/contacts.db");

let db: Database.Database;

export function initDb(): Database.Database {
  const BetterSqlite3 = require("better-sqlite3");

  // Automatically create the data folder if it doesn't exist
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new BetterSqlite3(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS Contact (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      phoneNumber    TEXT,
      email          TEXT,
      linkedId       INTEGER,
      linkPrecedence TEXT NOT NULL CHECK(linkPrecedence IN ('primary','secondary')),
      createdAt      DATETIME NOT NULL DEFAULT (datetime('now')),
      updatedAt      DATETIME NOT NULL DEFAULT (datetime('now')),
      deletedAt      DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_email  ON Contact(email)       WHERE deletedAt IS NULL;
    CREATE INDEX IF NOT EXISTS idx_phone  ON Contact(phoneNumber) WHERE deletedAt IS NULL;
    CREATE INDEX IF NOT EXISTS idx_linked ON Contact(linkedId)    WHERE deletedAt IS NULL;
  `);

  return db;
}

export function getDb(): Database.Database {
  if (!db) initDb();
  return db;
}