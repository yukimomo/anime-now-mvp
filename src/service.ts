import { fetchSeasonalAnime } from "./anilist.js";
import type { AppConfig, RankedAnime } from "./types.js";
import { rankAnime } from "./ranking.js";

const cache = new Map<string, { expiresAt: number; ranking: RankedAnime[] }>();
const cacheTtlMs = 10 * 60 * 1000;

export async function getTopAnime(config: AppConfig): Promise<RankedAnime[]> {
  const cacheKey = `${config.region}:${config.year}:${config.season}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ranking;
  }

  const anime = await fetchSeasonalAnime(config.season, config.year);
  const ranking = rankAnime(anime, config.region, 10);
  cache.set(cacheKey, {
    expiresAt: Date.now() + cacheTtlMs,
    ranking
  });
  return ranking;
}
