import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AppConfig, RankedAnime } from "./types.js";

const dbPath = join(process.cwd(), "data", "anime-now.sqlite");

export interface NotificationRun {
  id: number;
  season: string;
  year: number;
  content_hash: string;
  created_at: string;
}

export function openDb(): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season TEXT NOT NULL,
      year INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(season, year, content_hash)
    );

    CREATE TABLE IF NOT EXISTS notified_anime (
      anime_id INTEGER NOT NULL,
      season TEXT NOT NULL,
      year INTEGER NOT NULL,
      first_rank INTEGER NOT NULL,
      first_score REAL NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(anime_id, season, year)
    );

    CREATE TABLE IF NOT EXISTS ranking_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season TEXT NOT NULL,
      year INTEGER NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

export function saveRankingSnapshot(db: DatabaseSync, config: AppConfig, ranked: RankedAnime[]): void {
  db.prepare("INSERT INTO ranking_snapshots (season, year, payload) VALUES (?, ?, ?)")
    .run(config.season, config.year, JSON.stringify(ranked));
}

export function hasNotificationRun(db: DatabaseSync, config: AppConfig, contentHash: string): boolean {
  const row = db.prepare(
    "SELECT id FROM notification_runs WHERE season = ? AND year = ? AND content_hash = ?"
  ).get(config.season, config.year, contentHash);
  return Boolean(row);
}

export function recordNotificationRun(
  db: DatabaseSync,
  config: AppConfig,
  contentHash: string,
  ranked: RankedAnime[]
): void {
  const insertRun = db.prepare(
    "INSERT OR IGNORE INTO notification_runs (season, year, content_hash) VALUES (?, ?, ?)"
  );
  const insertAnime = db.prepare(`
    INSERT OR IGNORE INTO notified_anime
      (anime_id, season, year, first_rank, first_score, title)
    VALUES
      (?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    insertRun.run(config.season, config.year, contentHash);
    for (const anime of ranked) {
      insertAnime.run(
        anime.id,
        config.season,
        config.year,
        anime.rank,
        anime.recommendationScore,
        anime.displayTitleJa
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
