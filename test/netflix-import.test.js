import assert from "node:assert/strict";
import test from "node:test";
import { parseNetflixViewingHistory } from "../dist/imports/netflix.js";
import { normalizeSeriesTitle } from "../dist/taste/titleMatcher.js";

test("normalizes Netflix episode titles to series titles", () => {
  assert.equal(normalizeSeriesTitle("鬼滅の刃: シーズン1: 第1話"), "鬼滅の刃");
  assert.equal(normalizeSeriesTitle("Example Anime: Season 1: Episode 2"), "Example Anime");
});

test("imports English Netflix CSV columns", () => {
  const history = parseNetflixViewingHistory(`Title,Date
"鬼滅の刃: シーズン1: 第1話",2026-05-01
"鬼滅の刃: シーズン1: 第2話",2026-05-02
"葬送のフリーレン",2026-05-03
`);

  assert.equal(history.items.length, 3);
  assert.equal(history.seriesStats[0].title, "鬼滅の刃");
  assert.equal(history.seriesStats[0].watchCount, 2);
  assert.equal(history.seriesStats[0].lastWatchedAt, "2026-05-02");
});

test("imports Japanese Netflix CSV columns", () => {
  const history = parseNetflixViewingHistory(`タイトル,日付
"薬屋のひとりごと: シーズン1: 第1話",2026/04/01
"薬屋のひとりごと: シーズン1: 第2話",2026/04/02
`);

  assert.equal(history.items.length, 2);
  assert.equal(history.seriesStats[0].title, "薬屋のひとりごと");
  assert.equal(history.seriesStats[0].watchCount, 2);
});
