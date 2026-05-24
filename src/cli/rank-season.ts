import { getConfig } from "../config.js";
import { rankAndSaveSeason } from "../seasonSource.js";
import { parseSeasonArgs } from "./seasonArgs.js";

const args = parseSeasonArgs();
const config = getConfig();
const result = await rankAndSaveSeason(config, {
  year: args.year,
  season: args.season,
  region: args.region ?? config.region,
  personalize: args.personalize,
  personalizeWeight: args.weight
});

console.table(result.ranking.map((anime) => ({
  rank: anime.rank,
  title: anime.displayTitleJa,
  baseScore: anime.baseScore.toFixed(1),
  tasteScore: anime.personalTasteScore.toFixed(1),
  score: anime.recommendationScore.toFixed(1)
})));
console.log(`Saved ranking to ${result.jsonPath}`);
console.log(`Saved CSV to ${result.csvPath}`);
