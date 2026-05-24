import type { AniListAnime, SeriesStat } from "../types.js";

const episodeSeparators = [
  ": シーズン",
  ": Season",
  ": season",
  ": 第",
  "：シーズン",
  "：Season",
  "：第",
  " - Season",
  " Season "
];

export function normalizeSeriesTitle(rawTitle: string): string {
  let title = rawTitle.trim().replace(/^\uFEFF/, "");
  for (const separator of episodeSeparators) {
    const index = title.indexOf(separator);
    if (index > 0) {
      title = title.slice(0, index);
      break;
    }
  }

  return title
    .replace(/\s+/g, " ")
    .replace(/\s+\(\d{4}\)$/, "")
    .trim();
}

export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[「」『』【】()[\]{}:：!！?？.,，、。・\-_'"’”\s]/g, "");
}

function bigrams(value: string): Set<string> {
  const normalized = normalizeForMatch(value);
  if (normalized.length <= 1) return new Set(normalized ? [normalized] : []);
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

export function titleSimilarity(a: string, b: string): number {
  const normalizedA = normalizeForMatch(a);
  const normalizedB = normalizeForMatch(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return 0.85;

  const aBigrams = bigrams(a);
  const bBigrams = bigrams(b);
  const union = new Set([...aBigrams, ...bBigrams]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const item of aBigrams) {
    if (bBigrams.has(item)) intersection += 1;
  }
  return intersection / union.size;
}

export function animeTitles(anime: AniListAnime): string[] {
  return [anime.title.native, anime.title.romaji, anime.title.english].filter(Boolean) as string[];
}

export function findBestTitleMatch(anime: AniListAnime, seriesStats: SeriesStat[]): {
  title: string;
  similarity: number;
  watchCount: number;
} | null {
  let best: { title: string; similarity: number; watchCount: number } | null = null;
  for (const stat of seriesStats) {
    const similarity = Math.max(...animeTitles(anime).map((title) => titleSimilarity(title, stat.title)), 0);
    if (!best || similarity > best.similarity) {
      best = {
        title: stat.title,
        similarity,
        watchCount: stat.watchCount
      };
    }
  }
  return best;
}
