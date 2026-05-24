import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import test from "node:test";
import { buildAppConfig } from "../dist/appConfig.js";
import { isAllowedCommand } from "../dist/runConsole.js";
import {
  parseSeason,
  rankAndSaveSeason,
  seasonCsvColumns,
  seasonPaths,
  toSeasonCsv
} from "../dist/seasonSource.js";

const sampleAnime = [
  {
    id: 100,
    title: { native: "Sample A", romaji: "Sample A", english: "Sample A" },
    season: "SPRING",
    seasonYear: 2026,
    status: "RELEASING",
    format: "TV",
    episodes: 12,
    averageScore: 80,
    meanScore: 78,
    popularity: 1000,
    favourites: 200,
    trending: 50,
    genres: ["Action", "Fantasy"],
    tags: [{ name: "Magic", rank: 90 }],
    studios: ["Studio One"],
    siteUrl: "https://anilist.co/anime/100"
  },
  {
    id: 101,
    title: { native: "Sample B", romaji: "Sample B", english: "Sample B" },
    season: "SPRING",
    seasonYear: 2026,
    status: "FINISHED",
    format: "ONA",
    episodes: 8,
    averageScore: null,
    meanScore: 60,
    popularity: 500,
    favourites: 100,
    trending: 20,
    genres: ["Drama"],
    tags: [{ name: "Family Life", rank: 70 }],
    studios: ["Studio Two"],
    siteUrl: "https://anilist.co/anime/101"
  }
];

test("season/year args can be validated", () => {
  assert.equal(parseSeason("SPRING"), "SPRING");
  assert.throws(() => parseSeason("BAD"), /season must be/);
});

test("season ranking saves source-derived JSON and CSV", async () => {
  await rm("data/seasons/2026-SPRING", { recursive: true, force: true });
  const config = buildAppConfig({
    season: "SPRING",
    year: 2026,
    personalizeEnabled: false,
    rankingLimit: 10
  });

  const result = await rankAndSaveSeason(config, {
    year: 2026,
    season: "SPRING",
    region: "JP",
    personalize: false,
    source: sampleAnime
  });

  assert.equal(result.ranking.length, 2);
  assert.equal(JSON.parse(await readFile(seasonPaths(2026, "SPRING").ranking, "utf-8")).ranking.length, 2);
  const csv = await readFile(seasonPaths(2026, "SPRING").csv, "utf-8");
  assert.ok(csv.startsWith(seasonCsvColumns.join(",")));
  assert.match(csv, /recommendationScore/);
  await rm("data/seasons/2026-SPRING", { recursive: true, force: true });
});

test("CSV export includes expected columns", () => {
  const csv = toSeasonCsv([
    {
      ...sampleAnime[0],
      rank: 1,
      baseScore: 90,
      recommendationScore: 88,
      personalTasteScore: 80,
      normalizedPopularity: 100,
      normalizedFavourites: 100,
      airingBonus: 5,
      isAiring: true,
      isPreviouslyWatched: false,
      tasteReasons: ["Action match"],
      displayTitleJa: "Sample A",
      displayTitleEn: "Sample A",
      justWatchSearchUrl: "https://example.com/jw",
      googleSearchUrl: "https://example.com/google"
    }
  ]);
  for (const column of seasonCsvColumns) {
    assert.ok(csv.split("\n")[0].includes(column));
  }
});

test("personalize on/off changes season ranking when profile exists", async () => {
  await rm("data/seasons/2026-SPRING", { recursive: true, force: true });
  const historyPath = "data/test-season-viewing-history.json";
  await import("node:fs/promises").then(({ mkdir, writeFile }) => mkdir("data", { recursive: true }).then(() => writeFile(historyPath, JSON.stringify({
    importedAt: "2026-05-24T00:00:00.000Z",
    items: [{ rawTitle: "Sample A", normalizedTitle: "Sample A", watchedAt: "2026-05-20" }],
    seriesStats: [{ title: "Sample A", watchCount: 10, lastWatchedAt: "2026-05-20" }]
  }), "utf-8")));
  const config = buildAppConfig({
    season: "SPRING",
    year: 2026,
    viewingHistoryPath: historyPath,
    rankingLimit: 10
  });

  const off = await rankAndSaveSeason(config, { year: 2026, season: "SPRING", personalize: false, source: sampleAnime });
  const on = await rankAndSaveSeason(config, { year: 2026, season: "SPRING", personalize: true, personalizeWeight: 0.5, source: sampleAnime });

  assert.notEqual(on.ranking[0].recommendationScore, off.ranking[0].recommendationScore);
  await rm("data/seasons/2026-SPRING", { recursive: true, force: true });
  await rm(historyPath, { force: true });
});

test("season files are gitignored and run console commands are whitelisted", async () => {
  const gitignore = await readFile(".gitignore", "utf-8");
  assert.match(gitignore, /data\/seasons\/\*\*/);
  assert.equal(isAllowedCommand("season-fetch"), true);
  assert.equal(isAllowedCommand("season-ranking"), true);
  assert.equal(isAllowedCommand("season-export"), true);
  assert.equal(isAllowedCommand("season-notify"), true);
  assert.equal(isAllowedCommand("season-fetch && rm -rf ."), false);
});

test("season APIs are present in the server", async () => {
  const server = await readFile("src/server.ts", "utf-8");
  assert.match(server, /\/api\/seasons\/fetch/);
  assert.match(server, /\/api\/seasons\/rank/);
  assert.match(server, /\/api\/seasons\/:year\/:season\/export\.csv/);
});
