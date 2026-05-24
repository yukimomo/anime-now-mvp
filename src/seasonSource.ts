import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchSeasonalAnime } from "./anilist.js";
import { createTop10Hash, formatDiscordMessage, sendDiscordWebhook } from "./discord.js";
import { rankAnime } from "./ranking.js";
import { buildTasteProfile, loadViewingHistory } from "./taste/profile.js";
import type { AnimeSeason, AniListAnime, AppConfig, RankedAnime } from "./types.js";

export interface SeasonRequest {
  year: number;
  season: AnimeSeason;
  region?: string;
  personalize?: boolean;
  personalizeWeight?: number;
  limit?: number;
}

export interface SeasonRankingOptions extends SeasonRequest {
  source?: AniListAnime[];
}

const seasonRoot = join("data", "seasons");

export function seasonKey(year: number, season: AnimeSeason): string {
  return `${year}-${season}`;
}

export function seasonDir(year: number, season: AnimeSeason): string {
  return join(seasonRoot, seasonKey(year, season));
}

export function seasonPaths(year: number, season: AnimeSeason) {
  const dir = seasonDir(year, season);
  return {
    dir,
    source: join(dir, "source.json"),
    ranking: join(dir, "ranking.json"),
    csv: join(dir, "ranking.csv")
  };
}

export function parseSeason(value: unknown): AnimeSeason {
  const normalized = String(value ?? "").toUpperCase();
  if (["WINTER", "SPRING", "SUMMER", "FALL"].includes(normalized)) return normalized as AnimeSeason;
  throw new Error("season must be WINTER, SPRING, SUMMER, or FALL.");
}

export function parseYear(value: unknown): number {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error("year must be a valid number.");
  }
  return year;
}

export async function fetchAndSaveSeasonSource(request: SeasonRequest): Promise<{ path: string; items: AniListAnime[] }> {
  const items = await fetchSeasonalAnime(request.season, request.year);
  const paths = seasonPaths(request.year, request.season);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.source, `${JSON.stringify({ fetchedAt: new Date().toISOString(), request, items }, null, 2)}\n`, "utf-8");
  return { path: paths.source, items };
}

export async function loadSeasonSource(year: number, season: AnimeSeason): Promise<AniListAnime[]> {
  const raw = JSON.parse(await readFile(seasonPaths(year, season).source, "utf-8")) as { items?: AniListAnime[] };
  return raw.items ?? [];
}

async function tasteProfileForSeason(config: AppConfig, enabled: boolean) {
  if (!enabled) return null;
  const history = await loadViewingHistory(config.viewingHistoryPath);
  return history ? buildTasteProfile(history, config.recencyWeight) : null;
}

export async function rankAndSaveSeason(
  config: AppConfig,
  options: SeasonRankingOptions
): Promise<{ jsonPath: string; csvPath: string; ranking: RankedAnime[] }> {
  let source = options.source;
  if (!source) {
    try {
      source = await loadSeasonSource(options.year, options.season);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      source = (await fetchAndSaveSeasonSource(options)).items;
    }
  }
  const personalizeEnabled = options.personalize ?? config.personalizeEnabled;
  const tasteProfile = await tasteProfileForSeason(config, personalizeEnabled);
  const ranking = rankAnime(source, options.region ?? config.region, options.limit ?? config.rankingLimit, {
    personalizeEnabled,
    personalizeWeight: options.personalizeWeight ?? config.personalizeWeight,
    tasteProfile,
    scoreWeights: config.scoreWeights,
    tasteWeights: config.tasteWeights,
    includeWatched: config.includeWatched,
    sequelBoostEnabled: config.sequelBoostEnabled
  });

  const paths = seasonPaths(options.year, options.season);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(
    paths.ranking,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), options, ranking }, null, 2)}\n`,
    "utf-8"
  );
  await writeFile(paths.csv, toSeasonCsv(ranking), "utf-8");
  return { jsonPath: paths.ranking, csvPath: paths.csv, ranking };
}

function csvValue(value: unknown): string {
  const text = Array.isArray(value) ? value.join(" / ") : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export const seasonCsvColumns = [
  "rank",
  "id",
  "titleNative",
  "titleRomaji",
  "titleEnglish",
  "season",
  "seasonYear",
  "status",
  "format",
  "episodes",
  "averageScore",
  "popularity",
  "favourites",
  "trending",
  "baseScore",
  "personalTasteScore",
  "recommendationScore",
  "tasteReasons",
  "genres",
  "tags",
  "studios",
  "siteUrl"
];

export function toSeasonCsv(ranking: RankedAnime[]): string {
  const rows = ranking.map((anime) => [
    anime.rank,
    anime.id,
    anime.title.native,
    anime.title.romaji,
    anime.title.english,
    anime.season,
    anime.seasonYear,
    anime.status,
    anime.format,
    anime.episodes,
    anime.averageScore ?? 60,
    anime.popularity,
    anime.favourites,
    anime.trending ?? 0,
    anime.baseScore.toFixed(2),
    anime.personalTasteScore.toFixed(2),
    anime.recommendationScore.toFixed(2),
    anime.tasteReasons,
    anime.genres,
    anime.tags.map((tag) => tag.name),
    anime.studios ?? [],
    anime.siteUrl
  ]);
  return `${seasonCsvColumns.join(",")}\n${rows.map((row) => row.map(csvValue).join(",")).join("\n")}\n`;
}

export async function loadSeasonRanking(year: number, season: AnimeSeason): Promise<RankedAnime[]> {
  const raw = JSON.parse(await readFile(seasonPaths(year, season).ranking, "utf-8")) as { ranking?: RankedAnime[] };
  return raw.ranking ?? [];
}

export async function listSavedSeasons(): Promise<Array<{ key: string; year: number; season: AnimeSeason }>> {
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(seasonRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const [year, season] = entry.name.split("-");
        return { key: entry.name, year: Number(year), season: parseSeason(season) };
      })
      .filter((item) => Number.isInteger(item.year));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function notifySeasonRanking(config: AppConfig, year: number, season: AnimeSeason): Promise<string> {
  if (!config.discordWebhookUrl) throw new Error("Discord webhook is not configured.");
  const ranking = await loadSeasonRanking(year, season);
  const seasonConfig = { ...config, year, season };
  await sendDiscordWebhook(config.discordWebhookUrl, formatDiscordMessage(seasonConfig, ranking.slice(0, 10)));
  return createTop10Hash(ranking.slice(0, 10));
}
