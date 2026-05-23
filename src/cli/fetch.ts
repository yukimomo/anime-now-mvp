import { getConfig } from "../config.js";
import { openDb, saveRankingSnapshot } from "../db.js";
import { getTopAnime } from "../service.js";

const config = getConfig();
const ranked = await getTopAnime(config);
const db = openDb();
saveRankingSnapshot(db, config, ranked);

console.table(
  ranked.map((anime) => ({
    rank: anime.rank,
    title: anime.displayTitleJa,
    score: anime.recommendationScore.toFixed(1),
    averageScore: anime.averageScore ?? 60,
    popularity: anime.popularity,
    favourites: anime.favourites,
    episodes: anime.episodes ?? "-"
  }))
);

db.close();
