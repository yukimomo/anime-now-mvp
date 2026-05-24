import assert from "node:assert/strict";
import test from "node:test";
import { rankAnime } from "../dist/ranking.js";
import { scorePersonalTaste } from "../dist/taste/scoring.js";

const anime = {
  id: 1,
  title: {
    native: "鬼滅の刃 新章",
    romaji: "Kimetsu no Yaiba New Arc",
    english: "Demon Slayer New Arc"
  },
  season: "SPRING",
  seasonYear: 2026,
  averageScore: 80,
  popularity: 1000,
  favourites: 200,
  episodes: 12,
  genres: ["Action", "Fantasy"],
  tags: [{ name: "Urban Fantasy", rank: 90 }],
  siteUrl: "https://anilist.co/anime/1",
  status: "RELEASING"
};

const profile = {
  genreWeights: {
    Action: 1,
    Drama: 0.4
  },
  tagWeights: {
    "Urban Fantasy": 0.8
  },
  likedTitles: ["鬼滅の刃"],
  seriesStats: [
    {
      title: "鬼滅の刃",
      watchCount: 12,
      lastWatchedAt: "2026-05-10"
    }
  ],
  generatedAt: "2026-05-24T00:00:00.000Z"
};

test("calculates personal taste score and reasons", () => {
  const result = scorePersonalTaste(anime, profile);
  assert.ok(result.personalTasteScore > 50);
  assert.equal(result.isPreviouslyWatched, false);
  assert.ok(result.tasteReasons.some((reason) => reason.includes("Action")));
});

test("falls back to legacy score when personalization is disabled", () => {
  const [ranked] = rankAnime([anime], "JP", 10, {
    personalizeEnabled: false,
    personalizeWeight: 0.25,
    tasteProfile: profile
  });

  assert.equal(ranked.recommendationScore, ranked.baseScore);
  assert.equal(ranked.personalTasteScore, 0);
});

test("mixes base and personal scores when personalization is enabled", () => {
  const [ranked] = rankAnime([anime], "JP", 10, {
    personalizeEnabled: true,
    personalizeWeight: 0.25,
    tasteProfile: profile
  });

  assert.notEqual(ranked.recommendationScore, ranked.baseScore);
  assert.ok(ranked.personalTasteScore > 0);
});
