import "dotenv/config";
import { join } from "node:path";
import type { AnimeSeason, AppConfig } from "./types.js";

const seasons: AnimeSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

function currentAnimeSeason(date = new Date()): AnimeSeason {
  const month = date.getMonth() + 1;
  if (month <= 3) return "WINTER";
  if (month <= 6) return "SPRING";
  if (month <= 9) return "SUMMER";
  return "FALL";
}

function readSeason(value?: string): AnimeSeason {
  if (!value) return currentAnimeSeason();
  const normalized = value.toUpperCase();
  if (!seasons.includes(normalized as AnimeSeason)) {
    throw new Error(`SEASON must be one of ${seasons.join(", ")}.`);
  }
  return normalized as AnimeSeason;
}

export function getConfig(): AppConfig {
  const now = new Date();
  const personalizeWeight = Number(process.env.PERSONALIZE_WEIGHT ?? 0.25);

  return {
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || undefined,
    region: process.env.REGION || "JP",
    season: readSeason(process.env.SEASON),
    year: Number(process.env.YEAR || now.getFullYear()),
    port: Number(process.env.PORT || 3000),
    personalizeEnabled: (process.env.PERSONALIZE_ENABLED ?? "true").toLowerCase() === "true",
    personalizeWeight: Number.isFinite(personalizeWeight)
      ? Math.min(1, Math.max(0, personalizeWeight))
      : 0.25,
    viewingHistoryPath: process.env.VIEWING_HISTORY_PATH || join("data", "viewing-history.json")
  };
}
