import { readFile } from "node:fs/promises";
import { searchAnimeByTitle } from "../anilist.js";
import type { AnimeTag, SeriesStat, TasteProfile, ViewingHistory } from "../types.js";

export async function loadViewingHistory(path: string): Promise<ViewingHistory | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as ViewingHistory;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function daysSince(value?: string): number {
  if (!value) return 365;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 365;
  return Math.max(0, (Date.now() - date.getTime()) / 86_400_000);
}

function seriesPreferenceWeight(stat: SeriesStat, recencyWeight = 0.6): number {
  const countWeight = Math.min(1, stat.watchCount / 10);
  const recencyFactor = Math.max(0.25, 1 - daysSince(stat.lastWatchedAt) / 730);
  const blendedRecency = 1 - recencyWeight + recencyFactor * recencyWeight;
  const completionHint = stat.watchCount >= 10 ? 1.25 : stat.watchCount >= 3 ? 1 : 0.45;
  return countWeight * blendedRecency * completionHint;
}

function addWeight(weights: Record<string, number>, key: string, amount: number): void {
  weights[key] = (weights[key] ?? 0) + amount;
}

function normalizeWeights(weights: Record<string, number>): Record<string, number> {
  const max = Math.max(...Object.values(weights), 0);
  if (max <= 0) return weights;
  return Object.fromEntries(
    Object.entries(weights)
      .map(([key, value]) => [key, Number((value / max).toFixed(3))])
      .sort((a, b) => Number(b[1]) - Number(a[1]))
  );
}

export async function buildTasteProfile(history: ViewingHistory, recencyWeight = 0.6): Promise<TasteProfile> {
  const genreWeights: Record<string, number> = {};
  const tagWeights: Record<string, number> = {};
  const topStats = history.seriesStats
    .filter((stat) => stat.watchCount > 0)
    .sort((a, b) => seriesPreferenceWeight(b, recencyWeight) - seriesPreferenceWeight(a, recencyWeight))
    .slice(0, 15);

  for (const stat of topStats) {
    try {
      const anime = await searchAnimeByTitle(stat.title);
      if (!anime) continue;
      const weight = seriesPreferenceWeight(stat, recencyWeight);
      for (const genre of anime.genres) {
        addWeight(genreWeights, genre, weight);
      }
      for (const tag of anime.tags.slice(0, 8)) {
        addWeight(tagWeights, tag.name, weight * tagStrength(tag));
      }
    } catch {
      // A failed lookup should not block local ranking fallback.
    }
  }

  return {
    genreWeights: normalizeWeights(genreWeights),
    tagWeights: normalizeWeights(tagWeights),
    likedTitles: history.seriesStats.filter((stat) => stat.watchCount >= 3).map((stat) => stat.title),
    seriesStats: history.seriesStats,
    generatedAt: new Date().toISOString()
  };
}

function tagStrength(tag: AnimeTag): number {
  if (!tag.rank) return 0.5;
  return Math.min(1, Math.max(0.25, tag.rank / 100));
}

export function topProfileTerms(weights: Record<string, number>, limit = 5): string[] {
  return Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}
