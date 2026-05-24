import type { AniListAnime, TasteProfile, TasteScore } from "../types.js";
import { findBestTitleMatch } from "./titleMatcher.js";

function averageMatches(values: string[], weights: Record<string, number>): { score: number; matches: string[] } {
  const matches = values.filter((value) => weights[value] !== undefined);
  if (!matches.length) return { score: 0, matches: [] };
  const sum = matches.reduce((total, value) => total + weights[value], 0);
  return {
    score: Math.min(100, (sum / Math.min(values.length || 1, 5)) * 100),
    matches: matches.slice(0, 3)
  };
}

export function scorePersonalTaste(anime: AniListAnime, profile: TasteProfile | null): TasteScore {
  if (!profile) {
    return {
      personalTasteScore: 0,
      tasteReasons: [],
      isPreviouslyWatched: false
    };
  }

  const genreMatch = averageMatches(anime.genres, profile.genreWeights);
  const tagMatch = averageMatches(anime.tags.map((tag) => tag.name), profile.tagWeights);
  const titleMatch = findBestTitleMatch(anime, profile.seriesStats);
  const titleSimilarityScore = titleMatch ? Math.min(100, titleMatch.similarity * 100) : 0;
  const isPreviouslyWatched = Boolean(titleMatch && titleMatch.similarity >= 0.92);
  const personalTasteScore =
    genreMatch.score * 0.4 + tagMatch.score * 0.4 + titleSimilarityScore * 0.2;
  const reasons: string[] = [];

  if (genreMatch.matches.length) {
    reasons.push(`よく見るジャンル: ${genreMatch.matches.join(" / ")}`);
  }
  if (tagMatch.matches.length) {
    reasons.push(`好きなタグ: ${tagMatch.matches.join(" / ")}`);
  }
  if (titleMatch && titleMatch.similarity >= 0.55) {
    const suffix = titleMatch.watchCount >= 3 ? "続編候補" : "視聴済み作品に近い";
    reasons.push(`${suffix}: ${titleMatch.title}`);
  }
  if (isPreviouslyWatched) {
    reasons.push("視聴済み");
  }

  return {
    personalTasteScore: Math.min(100, Number(personalTasteScore.toFixed(2))),
    tasteReasons: reasons.slice(0, 3),
    isPreviouslyWatched
  };
}
