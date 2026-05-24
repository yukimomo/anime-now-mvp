import { fetchSeasonalAnime } from "./anilist.js";
import type { AppConfig, RankedAnime } from "./types.js";
import { rankAnime } from "./ranking.js";
import { buildTasteProfile, loadViewingHistory } from "./taste/profile.js";

const cache = new Map<string, { expiresAt: number; ranking: RankedAnime[] }>();
const cacheTtlMs = 10 * 60 * 1000;

export async function getTopAnime(config: AppConfig): Promise<RankedAnime[]> {
  const cacheKey = [
    config.region,
    config.year,
    config.season,
    config.personalizeEnabled,
    config.personalizeWeight,
    config.viewingHistoryPath
  ].join(":");
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ranking;
  }

  const anime = await fetchSeasonalAnime(config.season, config.year);
  let tasteProfile = null;
  if (config.personalizeEnabled) {
    const history = await loadViewingHistory(config.viewingHistoryPath);
    tasteProfile = history ? await buildTasteProfile(history) : null;
  }
  const ranking = rankAnime(anime, config.region, 10, {
    personalizeEnabled: config.personalizeEnabled,
    personalizeWeight: config.personalizeWeight,
    tasteProfile
  });
  cache.set(cacheKey, {
    expiresAt: Date.now() + cacheTtlMs,
    ranking
  });
  return ranking;
}
