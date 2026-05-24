import { getConfig } from "../config.js";
import { fetchAndSaveSeasonSource } from "../seasonSource.js";
import { parseSeasonArgs } from "./seasonArgs.js";

const args = parseSeasonArgs();
const config = getConfig();
const result = await fetchAndSaveSeasonSource({
  year: args.year,
  season: args.season,
  region: args.region ?? config.region
});

console.log(`Saved ${result.items.length} source items to ${result.path}`);
