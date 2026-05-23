import type { AnimeSeason, AniListAnime } from "./types.js";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

interface AniListResponse {
  data?: {
    Page?: {
      media?: AniListAnime[];
    };
  };
  errors?: Array<{ message: string }>;
}

const query = `
query SeasonalAnime($season: MediaSeason!, $year: Int!, $perPage: Int!) {
  Page(page: 1, perPage: $perPage) {
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
      averageScore
      popularity
      favourites
      episodes
      genres
      siteUrl
      status
    }
  }
}
`;

export async function fetchSeasonalAnime(season: AnimeSeason, year: number): Promise<AniListAnime[]> {
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
      body: JSON.stringify({
        query,
        variables: {
          season,
          year,
          perPage: 50
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`AniList API request failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as AniListResponse;
    if (json.errors?.length) {
      throw new Error(`AniList API error: ${json.errors.map((error) => error.message).join("; ")}`);
    }

    return json.data?.Page?.media ?? [];
  } finally {
    clearTimeout(timeout);
  }
}
