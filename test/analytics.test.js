import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalyticsSummary,
  buildRankingImpact,
  buildSeriesAnalytics,
  buildTimelineAnalytics,
  filterSeriesAnalytics,
  profileWeightsForDisplay
} from "../dist/analytics.js";

const history = {
  importedAt: "2026-05-24T00:00:00.000Z",
  items: [
    { rawTitle: "A: 第1話", normalizedTitle: "A", watchedAt: "2026-01-01" },
    { rawTitle: "A: 第2話", normalizedTitle: "A", watchedAt: "2026-01-02" },
    { rawTitle: "A: 第3話", normalizedTitle: "A", watchedAt: "2026-02-01" },
    { rawTitle: "B", normalizedTitle: "B", watchedAt: "2026-02-02" },
    { rawTitle: "C: 第1話", normalizedTitle: "C", watchedAt: "2026-03-03" },
    { rawTitle: "C: 第2話", normalizedTitle: "C", watchedAt: "2026-03-04" },
    { rawTitle: "C: 第3話", normalizedTitle: "C", watchedAt: "2026-03-05" },
    { rawTitle: "C: 第4話", normalizedTitle: "C", watchedAt: "2026-03-06" },
    { rawTitle: "C: 第5話", normalizedTitle: "C", watchedAt: "2026-03-07" },
    { rawTitle: "C: 第6話", normalizedTitle: "C", watchedAt: "2026-03-08" },
    { rawTitle: "C: 第7話", normalizedTitle: "C", watchedAt: "2026-03-09" },
    { rawTitle: "C: 第8話", normalizedTitle: "C", watchedAt: "2026-03-10" },
    { rawTitle: "C: 第9話", normalizedTitle: "C", watchedAt: "2026-03-11" },
    { rawTitle: "C: 第10話", normalizedTitle: "C", watchedAt: "2026-03-12" }
  ],
  seriesStats: [
    { title: "C", watchCount: 10, lastWatchedAt: "2026-03-12" },
    { title: "A", watchCount: 3, lastWatchedAt: "2026-02-01" },
    { title: "B", watchCount: 1, lastWatchedAt: "2026-02-02" }
  ]
};

const profile = {
  genreWeights: { Action: 1, Fantasy: 0.8, Drama: 0.2 },
  tagWeights: { Magic: 0.9, Isekai: 0.7, School: 0.1 },
  likedTitles: ["A", "C"],
  seriesStats: history.seriesStats,
  generatedAt: "2026-05-24T00:00:00.000Z"
};

test("builds summary analytics", () => {
  const summary = buildAnalyticsSummary(history, profile);
  assert.equal(summary.totalItems, 14);
  assert.equal(summary.seriesCount, 3);
  assert.equal(summary.estimatedMovieCount, 1);
  assert.equal(summary.firstWatchedAt, "2026-01-01");
  assert.equal(summary.lastWatchedAt, "2026-03-12");
  assert.equal(summary.topSeries[0].title, "C");
});

test("builds monthly and weekday timeline analytics", () => {
  const timeline = buildTimelineAnalytics(history, profile);
  assert.ok(timeline.byMonth.some((item) => item.month === "2026-03" && item.count === 10));
  assert.equal(timeline.byWeekday.length, 7);
});

test("converts genre and tag weights for display", () => {
  assert.deepEqual(profileWeightsForDisplay(profile.genreWeights, 2).map((item) => item.name), ["Action", "Fantasy"]);
  assert.deepEqual(profileWeightsForDisplay(profile.tagWeights, 2).map((item) => item.name), ["Magic", "Isekai"]);
});

test("builds series analytics and filters one episode / ten plus", () => {
  const series = buildSeriesAnalytics(history, profile);
  assert.equal(filterSeriesAnalytics(series, { range: "one" })[0].title, "B");
  assert.equal(filterSeriesAnalytics(series, { range: "ten" })[0].title, "C");
});

test("calculates ranking impact", () => {
  const impact = buildRankingImpact([
    { id: 1, rank: 1, displayTitleJa: "A", baseScore: 70, personalTasteScore: 95, recommendationScore: 80, tasteReasons: ["Magic"] },
    { id: 2, rank: 2, displayTitleJa: "B", baseScore: 90, personalTasteScore: 10, recommendationScore: 70, tasteReasons: [] }
  ]);
  assert.equal(impact[0].baseRank, 2);
  assert.equal(impact[0].rankDelta, 1);
});

test("analytics handles missing viewing history", () => {
  const summary = buildAnalyticsSummary(null, null);
  const timeline = buildTimelineAnalytics(null, null);
  assert.equal(summary.imported, false);
  assert.equal(timeline.recentCounts.last30Days, 0);
});
