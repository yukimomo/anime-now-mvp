import { getConfig } from "../config.js";
import { notifySeasonRanking } from "../seasonSource.js";
import { parseSeasonArgs } from "./seasonArgs.js";

const args = parseSeasonArgs();
const config = getConfig();
await notifySeasonRanking(config, args.year, args.season);
console.log(`Discord notification sent for ${args.year} ${args.season}.`);
