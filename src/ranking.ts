import { buildGoogleSearchUrl, buildJustWatchSearchUrl } from "./links.js";
import type { AniListAnime, RankedAnime } from "./types.js";

function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return (value / max) * 100;
}

export function rankAnime(animeList: AniListAnime[], region: string, limit = 10): RankedAnime[] {
  const maxPopularity = Math.max(...animeList.map((anime) => anime.popularity), 0);
  const maxFavourites = Math.max(...animeList.map((anime) => anime.favourites), 0);

  return animeList
    .map((anime) => {
      const averageScore = anime.averageScore ?? 60;
      const normalizedPopularity = normalize(anime.popularity, maxPopularity);
      const normalizedFavourites = normalize(anime.favourites, maxFavourites);
      const isAiring = anime.status === "RELEASING";
      const airingBonus = isAiring ? 5 : 0;
      const recommendationScore =
        averageScore * 0.5 + normalizedPopularity * 0.3 + normalizedFavourites * 0.2 + airingBonus;

      return {
        ...anime,
        rank: 0,
        recommendationScore,
        normalizedPopularity,
        normalizedFavourites,
        airingBonus,
        isAiring,
        displayTitleJa: anime.title.native || anime.title.romaji || anime.title.english || "Untitled",
        displayTitleEn: anime.title.english || anime.title.romaji || anime.title.native || "Untitled",
        justWatchSearchUrl: buildJustWatchSearchUrl(anime, region),
        googleSearchUrl: buildGoogleSearchUrl(anime, region)
      };
    })
    .filter((anime) => anime.status === "RELEASING" || anime.status === "FINISHED")
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .slice(0, limit)
    .map((anime, index) => ({
      ...anime,
      rank: index + 1
    }));
}
