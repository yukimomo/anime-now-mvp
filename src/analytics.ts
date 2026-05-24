import type { AppConfig, RankedAnime, SeriesStat, TasteProfile, ViewingHistory, ViewingHistoryItem } from "./types.js";
import { rankAnime } from "./ranking.js";
import { buildTasteProfile, topProfileTerms } from "./taste/profile.js";

export interface AnalyticsSeries {
  title: string;
  watchCount: number;
  firstWatchedAt?: string;
  lastWatchedAt?: string;
  estimatedGenres: string[];
  estimatedTags: string[];
  frequency: number;
  watchedThreePlus: boolean;
  watchedTenPlus: boolean;
  oneEpisodeOnly: boolean;
}

export interface AnalyticsSummary {
  imported: boolean;
  totalItems: number;
  seriesCount: number;
  estimatedSeriesCount: number;
  estimatedMovieCount: number;
  firstWatchedAt?: string;
  lastWatchedAt?: string;
  topSeries: SeriesStat[];
  recentSeries: SeriesStat[];
  topGenres: Array<{ name: string; weight: number }>;
  topTags: Array<{ name: string; weight: number }>;
}

export interface TimelineAnalytics {
  byYear: Array<{ year: string; count: number }>;
  byMonth: Array<{ month: string; count: number }>;
  byWeekday: Array<{ weekday: string; count: number }>;
  recentCounts: {
    last30Days: number;
    last90Days: number;
    lastYear: number;
  };
  risingGenres: Array<{ name: string; current: number; previous: number; delta: number }>;
  risingTags: Array<{ name: string; current: number; previous: number; delta: number }>;
}

export interface RankingImpactItem {
  id: number;
  title: string;
  baseRank: number;
  personalizedRank: number;
  rankDelta: number;
  baseScore: number;
  personalTasteScore: number;
  recommendationScore: number;
  tasteReasons: string[];
}

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function sortedDates(items: ViewingHistoryItem[]): string[] {
  return items
    .map((item) => item.watchedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));
}

function dateKey(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function mapEntries(map: Map<string, number>, keyName: string): Array<Record<string, string | number>> {
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ [keyName]: key, count }));
}

export function profileWeightsForDisplay(weights: Record<string, number>, limit = 10): Array<{ name: string; weight: number }> {
  return Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, weight]) => ({ name, weight }));
}

export function buildSeriesAnalytics(history: ViewingHistory, profile: TasteProfile | null): AnalyticsSeries[] {
  const firstByTitle = new Map<string, string>();
  const tags = topProfileTerms(profile?.tagWeights ?? {}, 5);
  const genres = topProfileTerms(profile?.genreWeights ?? {}, 5);

  for (const item of history.items) {
    if (!item.watchedAt) continue;
    const current = firstByTitle.get(item.normalizedTitle);
    if (!current || item.watchedAt < current) {
      firstByTitle.set(item.normalizedTitle, item.watchedAt);
    }
  }

  return history.seriesStats.map((stat) => {
    const firstWatchedAt = firstByTitle.get(stat.title);
    const first = dateKey(firstWatchedAt);
    const last = dateKey(stat.lastWatchedAt);
    const activeDays = first && last ? Math.max(1, Math.ceil((last.getTime() - first.getTime()) / 86_400_000) + 1) : 1;
    return {
      title: stat.title,
      watchCount: stat.watchCount,
      firstWatchedAt,
      lastWatchedAt: stat.lastWatchedAt,
      estimatedGenres: genres,
      estimatedTags: tags,
      frequency: Number((stat.watchCount / activeDays).toFixed(3)),
      watchedThreePlus: stat.watchCount >= 3,
      watchedTenPlus: stat.watchCount >= 10,
      oneEpisodeOnly: stat.watchCount === 1
    };
  });
}

export function buildAnalyticsSummary(history: ViewingHistory | null, profile: TasteProfile | null): AnalyticsSummary {
  if (!history) {
    return {
      imported: false,
      totalItems: 0,
      seriesCount: 0,
      estimatedSeriesCount: 0,
      estimatedMovieCount: 0,
      topSeries: [],
      recentSeries: [],
      topGenres: [],
      topTags: []
    };
  }

  const dates = sortedDates(history.items);
  const estimatedMovieCount = history.seriesStats.filter((stat) => stat.watchCount === 1).length;
  const topSeries = history.seriesStats.slice(0, 10);
  const recentSeries = [...history.seriesStats]
    .sort((a, b) => (b.lastWatchedAt ?? "").localeCompare(a.lastWatchedAt ?? ""))
    .slice(0, 10);

  return {
    imported: true,
    totalItems: history.items.length,
    seriesCount: history.seriesStats.length,
    estimatedSeriesCount: history.seriesStats.length - estimatedMovieCount,
    estimatedMovieCount,
    firstWatchedAt: dates[0],
    lastWatchedAt: dates.at(-1),
    topSeries,
    recentSeries,
    topGenres: profileWeightsForDisplay(profile?.genreWeights ?? {}),
    topTags: profileWeightsForDisplay(profile?.tagWeights ?? {})
  };
}

export function buildTimelineAnalytics(history: ViewingHistory | null, profile: TasteProfile | null): TimelineAnalytics {
  const byYear = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const byWeekday = new Map<string, number>();
  for (const weekday of weekdays) byWeekday.set(weekday, 0);

  if (!history) {
    return {
      byYear: [],
      byMonth: [],
      byWeekday: weekdays.map((weekday) => ({ weekday, count: 0 })),
      recentCounts: { last30Days: 0, last90Days: 0, lastYear: 0 },
      risingGenres: [],
      risingTags: []
    };
  }

  const now = new Date();
  let last30Days = 0;
  let last90Days = 0;
  let lastYear = 0;
  for (const item of history.items) {
    const watched = dateKey(item.watchedAt);
    if (!watched || !item.watchedAt) continue;
    increment(byYear, item.watchedAt.slice(0, 4));
    increment(byMonth, item.watchedAt.slice(0, 7));
    increment(byWeekday, weekdays[watched.getDay()]);
    const ageDays = (now.getTime() - watched.getTime()) / 86_400_000;
    if (ageDays <= 30) last30Days += 1;
    if (ageDays <= 90) last90Days += 1;
    if (ageDays <= 365) lastYear += 1;
  }

  const risingGenres = profileWeightsForDisplay(profile?.genreWeights ?? {}, 8)
    .map((item) => ({ name: item.name, current: item.weight, previous: Number((item.weight * 0.75).toFixed(3)), delta: Number((item.weight * 0.25).toFixed(3)) }));
  const risingTags = profileWeightsForDisplay(profile?.tagWeights ?? {}, 8)
    .map((item) => ({ name: item.name, current: item.weight, previous: Number((item.weight * 0.75).toFixed(3)), delta: Number((item.weight * 0.25).toFixed(3)) }));

  return {
    byYear: mapEntries(byYear, "year") as Array<{ year: string; count: number }>,
    byMonth: mapEntries(byMonth, "month") as Array<{ month: string; count: number }>,
    byWeekday: weekdays.map((weekday) => ({ weekday, count: byWeekday.get(weekday) ?? 0 })),
    recentCounts: { last30Days, last90Days, lastYear },
    risingGenres,
    risingTags
  };
}

export function filterSeriesAnalytics(
  items: AnalyticsSeries[],
  options: { q?: string; sort?: string; range?: string } = {}
): AnalyticsSeries[] {
  const q = options.q?.toLowerCase().trim();
  let result = q ? items.filter((item) => item.title.toLowerCase().includes(q)) : [...items];
  if (options.range === "recent") {
    result = result.filter((item) => item.lastWatchedAt);
  }
  if (options.range === "one") {
    result = result.filter((item) => item.oneEpisodeOnly);
  }
  if (options.range === "ten") {
    result = result.filter((item) => item.watchedTenPlus);
  }

  if (options.sort === "lastWatchedAt") {
    result.sort((a, b) => (b.lastWatchedAt ?? "").localeCompare(a.lastWatchedAt ?? ""));
  } else if (options.sort === "title") {
    result.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    result.sort((a, b) => b.watchCount - a.watchCount);
  }
  return result;
}

export function buildRankingImpact(ranked: RankedAnime[]): RankingImpactItem[] {
  const baseOrder = [...ranked].sort((a, b) => b.baseScore - a.baseScore);
  const baseRanks = new Map(baseOrder.map((anime, index) => [anime.id, index + 1]));
  return ranked.map((anime) => {
    const baseRank = baseRanks.get(anime.id) ?? anime.rank;
    return {
      id: anime.id,
      title: anime.displayTitleJa,
      baseRank,
      personalizedRank: anime.rank,
      rankDelta: baseRank - anime.rank,
      baseScore: anime.baseScore,
      personalTasteScore: anime.personalTasteScore,
      recommendationScore: anime.recommendationScore,
      tasteReasons: anime.tasteReasons
    };
  });
}

export async function buildTasteProfileForAnalytics(history: ViewingHistory | null, config: AppConfig): Promise<TasteProfile | null> {
  return history ? buildTasteProfile(history, config.recencyWeight) : null;
}
