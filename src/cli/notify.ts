import { getConfig } from "../config.js";
import { createTop10Hash, formatDiscordMessage, sendDiscordWebhook } from "../discord.js";
import { hasNotificationRun, openDb, recordNotificationRun, saveRankingSnapshot } from "../db.js";
import { getTopAnime } from "../service.js";

const config = getConfig();

if (!config.discordWebhookUrl) {
  throw new Error("DISCORD_WEBHOOK_URL is required for npm run notify.");
}

const ranked = await getTopAnime(config);
const contentHash = createTop10Hash(ranked);
const db = openDb();

saveRankingSnapshot(db, config, ranked);

if (hasNotificationRun(db, config, contentHash)) {
  console.log("Same TOP10 content has already been notified. Skipping Discord post.");
  db.close();
  process.exit(0);
}

await sendDiscordWebhook(config.discordWebhookUrl, formatDiscordMessage(config, ranked));
recordNotificationRun(db, config, contentHash, ranked);
db.close();

console.log("Discord notification sent.");
