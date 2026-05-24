import { buildGoogleSearchUrl, buildJustWatchSearchUrl } from "./links.js";
import { scorePersonalTaste } from "./taste/scoring.js";
import type { AniListAnime, RankedAnime, ScoreWeights, TasteProfile, TasteWeights } from "./types.js";

function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return (value / max) * 100;
}

export function rankAnime(
  animeList: AniListAnime[],
  region: string,
  limit = 10,
  options: {
    personalizeEnabled?: boolean;
    personalizeWeight?: number;
    tasteProfile?: TasteProfile | null;
    scoreWeights?: ScoreWeights;
    tasteWeights?: TasteWeights;
    includeWatched?: boolean;
    sequelBoostEnabled?: boolean;
  } = {}
): RankedAnime[] {
  const maxPopularity = Math.max(...animeList.map((anime) => anime.popularity), 0);
  const maxFavourites = Math.max(...animeList.map((anime) => anime.favourites), 0);
  const personalizeWeight = Math.min(1, Math.max(0, options.personalizeWeight ?? 0.25));
  const shouldPersonalize = Boolean(options.personalizeEnabled && options.tasteProfile);
  const scoreWeights = options.scoreWeights ?? {
    averageScore: 0.5,
    popularity: 0.3,
    favourites: 0.2,
    airingBonus: 5
  };

  return animeList
    .map((anime) => {
      const averageScore = anime.averageScore ?? 60;
      const normalizedPopularity = normalize(anime.popularity, maxPopularity);
      const normalizedFavourites = normalize(anime.favourites, maxFavourites);
      const isAiring = anime.status === "RELEASING";
      const airingBonus = isAiring ? scoreWeights.airingBonus : 0;
      const baseScore =
        averageScore * scoreWeights.averageScore +
        normalizedPopularity * scoreWeights.popularity +
        normalizedFavourites * scoreWeights.favourites +
        airingBonus;
      const tasteScore = shouldPersonalize
        ? scorePersonalTaste(
            anime,
            options.tasteProfile ?? null,
            options.tasteWeights,
            options.sequelBoostEnabled ?? true
          )
        : {
            personalTasteScore: 0,
            tasteReasons: [],
            isPreviouslyWatched: false
          };
      const recommendationScore = shouldPersonalize
        ? baseScore * (1 - personalizeWeight) + tasteScore.personalTasteScore * personalizeWeight
        : baseScore;

      return {
        ...anime,
        rank: 0,
        baseScore,
        recommendationScore,
        personalTasteScore: tasteScore.personalTasteScore,
        normalizedPopularity,
        normalizedFavourites,
        airingBonus,
        isAiring,
        isPreviouslyWatched: tasteScore.isPreviouslyWatched,
        tasteReasons: tasteScore.tasteReasons,
        displayTitleJa: anime.title.native || anime.title.romaji || anime.title.english || "Untitled",
        displayTitleEn: anime.title.english || anime.title.romaji || anime.title.native || "Untitled",
        justWatchSearchUrl: buildJustWatchSearchUrl(anime, region),
        googleSearchUrl: buildGoogleSearchUrl(anime, region)
      };
    })
    .filter((anime) => anime.status === "RELEASING" || anime.status === "FINISHED")
    .filter((anime) => options.includeWatched !== false || !anime.isPreviouslyWatched)
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .slice(0, limit)
    .map((anime, index) => ({
      ...anime,
      rank: index + 1
    }));
}
