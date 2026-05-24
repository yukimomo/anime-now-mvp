export type AnimeSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export interface AppConfig {
  discordWebhookUrl?: string;
  region: string;
  season: AnimeSeason;
  year: number;
  port: number;
  personalizeEnabled: boolean;
  personalizeWeight: number;
  viewingHistoryPath: string;
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
  tags: AnimeTag[];
  siteUrl: string;
  status?: string | null;
}

export interface AnimeTag {
  name: string;
  rank?: number | null;
}

export interface ViewingHistoryItem {
  rawTitle: string;
  normalizedTitle: string;
  watchedAt?: string;
}

export interface SeriesStat {
  title: string;
  watchCount: number;
  lastWatchedAt?: string;
}

export interface ViewingHistory {
  items: ViewingHistoryItem[];
  seriesStats: SeriesStat[];
  importedAt: string;
}

export interface TasteProfile {
  genreWeights: Record<string, number>;
  tagWeights: Record<string, number>;
  likedTitles: string[];
  seriesStats: SeriesStat[];
  generatedAt: string;
}

export interface TasteScore {
  personalTasteScore: number;
  tasteReasons: string[];
  isPreviouslyWatched: boolean;
}

export interface RankedAnime extends AniListAnime {
  rank: number;
  baseScore: number;
  recommendationScore: number;
  personalTasteScore: number;
  normalizedPopularity: number;
  normalizedFavourites: number;
  airingBonus: number;
  isAiring: boolean;
  isPreviouslyWatched: boolean;
  tasteReasons: string[];
  displayTitleJa: string;
  displayTitleEn: string;
  justWatchSearchUrl: string;
  googleSearchUrl: string;
}
