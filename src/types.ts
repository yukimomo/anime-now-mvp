export type AnimeSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export interface AppConfig {
  discordWebhookUrl?: string;
  region: string;
  season: AnimeSeason;
  year: number;
  port: number;
}

export interface AnimeTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

export interface AniListAnime {
  id: number;
  title: AnimeTitle;
  season?: AnimeSeason | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  popularity: number;
  favourites: number;
  episodes?: number | null;
  genres: string[];
  siteUrl: string;
  status?: string | null;
}

export interface RankedAnime extends AniListAnime {
  rank: number;
  recommendationScore: number;
  normalizedPopularity: number;
  normalizedFavourites: number;
  airingBonus: number;
  isAiring: boolean;
  displayTitleJa: string;
  displayTitleEn: string;
  justWatchSearchUrl: string;
  googleSearchUrl: string;
}
