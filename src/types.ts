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
  rankingLimit: number;
  includeWatched: boolean;
  sequelBoostEnabled: boolean;
  recencyWeight: number;
  discordNotifyEnabled: boolean;
  scoreWeights: ScoreWeights;
  tasteWeights: TasteWeights;
  configPath: string;
}

export interface ScoreWeights {
  averageScore: number;
  popularity: number;
  favourites: number;
  airingBonus: number;
}

export interface TasteWeights {
  genreMatch: number;
  tagMatch: number;
  titleSimilarity: number;
}

export interface StoredAppConfig {
  region?: string;
  season?: AnimeSeason | "AUTO";
  year?: number | "AUTO";
  rankingLimit?: number;
  personalizeEnabled?: boolean;
  personalizeWeight?: number;
  includeWatched?: boolean;
  sequelBoostEnabled?: boolean;
  recencyWeight?: number;
  discordNotifyEnabled?: boolean;
  discordWebhookUrl?: string;
  viewingHistoryPath?: string;
  scoreWeights?: Partial<ScoreWeights>;
  tasteWeights?: Partial<TasteWeights>;
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
  format?: string | null;
  meanScore?: number | null;
  averageScore?: number | null;
  popularity: number;
  favourites: number;
  trending?: number | null;
  episodes?: number | null;
  genres: string[];
  tags: AnimeTag[];
  studios?: string[];
  coverImage?: {
    large?: string | null;
    medium?: string | null;
  } | null;
  startDate?: FuzzyDate | null;
  endDate?: FuzzyDate | null;
  siteUrl: string;
  status?: string | null;
}

export interface AnimeTag {
  name: string;
  rank?: number | null;
}

export interface FuzzyDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
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
