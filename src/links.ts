import type { AniListAnime } from "./types.js";

function searchTitle(anime: AniListAnime): string {
  return anime.title.native || anime.title.romaji || anime.title.english || String(anime.id);
}

export function buildJustWatchSearchUrl(anime: AniListAnime, region: string): string {
  const query = encodeURIComponent(searchTitle(anime));
  return `https://www.justwatch.com/${region.toLowerCase()}/search?q=${query}`;
}

export function buildGoogleSearchUrl(anime: AniListAnime, region: string): string {
  const query = encodeURIComponent(`${searchTitle(anime)} 配信 ${region}`);
  return `https://www.google.com/search?q=${query}`;
}
