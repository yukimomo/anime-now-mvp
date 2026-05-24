import { getConfig } from "../config.js";
import { importNetflixCsvFile } from "../imports/netflix.js";
import { buildTasteProfile } from "../taste/profile.js";
import { topProfileTerms } from "../taste/profile.js";

const csvPath = process.argv[2];
if (!csvPath) {
  throw new Error("Usage: npm run import:netflix -- ./data/netflix-viewing-history.csv");
}

const config = getConfig();
const history = await importNetflixCsvFile(csvPath, config.viewingHistoryPath);
const profile = await buildTasteProfile(history);

console.log(`Imported ${history.items.length} viewing rows.`);
console.log(`Detected ${history.seriesStats.length} series.`);
console.log(`Saved to ${config.viewingHistoryPath}.`);
console.log(`Top genres: ${topProfileTerms(profile.genreWeights).join(", ") || "-"}`);
console.log(`Top tags: ${topProfileTerms(profile.tagWeights).join(", ") || "-"}`);
