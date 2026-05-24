import { fetchSeasonalAnime } from "./anilist.js";
import type { AppConfig, RankedAnime } from "./types.js";
import { rankAnime } from "./ranking.js";
import { buildTasteProfile, loadViewingHistory } from "./taste/profile.js";

const cache = new Map<string, { expiresAt: number; ranking: RankedAnime[] }>();
const cacheTtlMs = 10 * 60 * 1000;

export function clearTopAnimeCache(): void {
  cache.clear();
}

export async function getTopAnime(config: AppConfig): Promise<RankedAnime[]> {
  const cacheKey = [
    config.region,
    config.year,
    config.season,
    config.personalizeEnabled,
    config.personalizeWeight,
    config.viewingHistoryPath,
    config.rankingLimit,
    config.includeWatched,
    config.sequelBoostEnabled,
    config.recencyWeight,
    JSON.stringify(config.scoreWeights),
    JSON.stringify(config.tasteWeights)
  ].join(":");
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ranking;
  }

  const anime = await fetchSeasonalAnime(config.season, config.year);
  let tasteProfile = null;
  if (config.personalizeEnabled) {
    const history = await loadViewingHistory(config.viewingHistoryPath);
    tasteProfile = history ? await buildTasteProfile(history, config.recencyWeight) : null;
  }
  const ranking = rankAnime(anime, config.region, config.rankingLimit, {
    personalizeEnabled: config.personalizeEnabled,
    personalizeWeight: config.personalizeWeight,
    tasteProfile,
    scoreWeights: config.scoreWeights,
    tasteWeights: config.tasteWeights,
    includeWatched: config.includeWatched,
    sequelBoostEnabled: config.sequelBoostEnabled
  });
  cache.set(cacheKey, {
    expiresAt: Date.now() + cacheTtlMs,
    ranking
  });
  return ranking;
}
