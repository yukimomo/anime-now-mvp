import type { AnimeSeason, AniListAnime } from "./types.js";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

interface AniListResponse {
  data?: {
    Page?: {
      pageInfo?: {
        currentPage: number;
        hasNextPage: boolean;
      };
      media?: AniListAnime[];
    };
  };
  errors?: Array<{ message: string }>;
}

interface AniListSearchResponse {
  data?: {
    Media?: AniListAnime | null;
  };
  errors?: Array<{ message: string }>;
}

const query = `
query SeasonalAnime($season: MediaSeason!, $year: Int!, $page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      currentPage
      hasNextPage
    }
    media(
      type: ANIME
      format_in: [TV, TV_SHORT, ONA]
      season: $season
      seasonYear: $year
      sort: POPULARITY_DESC
      isAdult: false
    ) {
      id
      title {
        romaji
        english
        native
      }
      season
      seasonYear
      status
      format
      episodes
      averageScore
      meanScore
      popularity
      favourites
      trending
      genres
      tags {
        name
        rank
      }
      studios(isMain: true) {
        nodes {
          name
        }
      }
      coverImage {
        large
        medium
      }
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      siteUrl
    }
  }
}
`;

const searchQuery = `
query SearchAnime($search: String!) {
  Media(type: ANIME, search: $search, isAdult: false) {
    id
    title {
      romaji
      english
      native
    }
      season
      seasonYear
      status
      format
      episodes
      averageScore
      meanScore
      popularity
      favourites
      trending
      genres
      tags {
        name
        rank
      }
      studios(isMain: true) {
        nodes {
          name
        }
      }
      coverImage {
        large
        medium
      }
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      siteUrl
  }
}
`;

async function postAniList<T>(body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "anime-now-mvp/0.1"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`AniList API request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSeasonalAnime(season: AnimeSeason, year: number): Promise<AniListAnime[]> {
  const items: AniListAnime[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const json = await postAniList<AniListResponse>({
      query,
      variables: {
        season,
        year,
        page,
        perPage: 50
      }
    });
    if (json.errors?.length) {
      throw new Error(`AniList API error: ${json.errors.map((error) => error.message).join("; ")}`);
    }

    items.push(...normalizeAniListAnime(json.data?.Page?.media ?? []));
    hasNextPage = Boolean(json.data?.Page?.pageInfo?.hasNextPage);
    page += 1;
  }

  return items;
}

export function normalizeAniListAnime(items: AniListAnime[]): AniListAnime[] {
  return items.map((anime) => ({
    ...anime,
    studios: Array.isArray((anime as unknown as { studios?: { nodes?: Array<{ name: string }> } }).studios?.nodes)
      ? (anime as unknown as { studios: { nodes: Array<{ name: string }> } }).studios.nodes.map((studio) => studio.name)
      : anime.studios ?? []
  }));
}

export async function fetchSeasonalAnimeFirstPage(season: AnimeSeason, year: number): Promise<AniListAnime[]> {
  const json = await postAniList<AniListResponse>({
    query,
    variables: {
      season,
      year,
      page: 1,
      perPage: 50
    }
  });
  if (json.errors?.length) {
    throw new Error(`AniList API error: ${json.errors.map((error) => error.message).join("; ")}`);
  }

  return normalizeAniListAnime(json.data?.Page?.media ?? []);
}

export async function searchAnimeByTitle(title: string): Promise<AniListAnime | null> {
  const json = await postAniList<AniListSearchResponse>({
    query: searchQuery,
    variables: {
      search: title
    }
  });
  if (json.errors?.length) {
    throw new Error(`AniList API error: ${json.errors.map((error) => error.message).join("; ")}`);
  }

  return json.data?.Media ?? null;
}
