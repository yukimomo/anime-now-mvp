import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatDiscordMessage } from "../dist/discord.js";

test("gitignore excludes local viewing history", () => {
  const gitignore = readFileSync(".gitignore", "utf-8");
  assert.match(gitignore, /data\/viewing-history\.json/);
  assert.match(gitignore, /data\/\*\.csv/);
  assert.match(gitignore, /app-config\.json/);
  assert.match(gitignore, /run-history\.json/);
  assert.match(gitignore, /logs\//);
});

test("Discord notification includes taste reason", () => {
  const message = formatDiscordMessage(
    {
      region: "JP",
      season: "SPRING",
      year: 2026,
      port: 3000,
      personalizeEnabled: true,
      personalizeWeight: 0.25,
      viewingHistoryPath: "./data/viewing-history.json"
    },
    [
      {
        id: 1,
        rank: 1,
        title: { native: "作品名" },
        season: "SPRING",
        seasonYear: 2026,
        averageScore: 80,
        popularity: 100,
        favourites: 10,
        episodes: 12,
        genres: ["Fantasy"],
        tags: [{ name: "Magic", rank: 80 }],
        siteUrl: "https://anilist.co/anime/1",
        status: "RELEASING",
        baseScore: 75,
        recommendationScore: 82.2,
        personalTasteScore: 92,
        normalizedPopularity: 100,
        normalizedFavourites: 100,
        airingBonus: 5,
        isAiring: true,
        isPreviouslyWatched: false,
        tasteReasons: ["よく見るジャンル: Fantasy"],
        displayTitleJa: "作品名",
        displayTitleEn: "Anime Title",
        justWatchSearchUrl: "https://www.justwatch.com/jp/search?q=x",
        googleSearchUrl: "https://www.google.com/search?q=x"
      }
    ]
  );

  assert.match(message, /総合 82\.2 \/ 好み 92\.0/);
  assert.match(message, /理由: よく見るジャンル: Fantasy/);
});
