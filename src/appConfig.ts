import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AnimeSeason, AppConfig, ScoreWeights, StoredAppConfig, TasteWeights } from "./types.js";

const seasons: AnimeSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
const defaultScoreWeights: ScoreWeights = {
  averageScore: 0.5,
  popularity: 0.3,
  favourites: 0.2,
  airingBonus: 5
};
const defaultTasteWeights: TasteWeights = {
  genreMatch: 0.4,
  tagMatch: 0.4,
  titleSimilarity: 0.2
};

export const defaultConfigPath = "app-config.json";

export function currentAnimeSeason(date = new Date()): AnimeSeason {
  const month = date.getMonth() + 1;
  if (month <= 3) return "WINTER";
  if (month <= 6) return "SPRING";
  if (month <= 9) return "SUMMER";
  return "FALL";
}

function readEnvSeason(value?: string): AnimeSeason | "AUTO" {
  if (!value) return "AUTO";
  const normalized = value.toUpperCase();
  if (!seasons.includes(normalized as AnimeSeason)) {
    throw new Error(`SEASON must be one of AUTO, ${seasons.join(", ")}.`);
  }
  return normalized as AnimeSeason;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function validateConfig(input: StoredAppConfig): string[] {
  const errors: string[] = [];
  if (input.season && input.season !== "AUTO" && !seasons.includes(input.season)) {
    errors.push("season must be AUTO, SPRING, SUMMER, FALL, or WINTER.");
  }
  if (input.year !== undefined && input.year !== "AUTO" && (!Number.isInteger(input.year) || input.year < 1900)) {
    errors.push("year must be AUTO or a valid number.");
  }
  if (input.rankingLimit !== undefined && ![10, 20, 30, 50].includes(input.rankingLimit)) {
    errors.push("rankingLimit must be one of 10, 20, 30, 50.");
  }
  if (input.personalizeWeight !== undefined && (input.personalizeWeight < 0 || input.personalizeWeight > 0.6)) {
    errors.push("personalizeWeight must be between 0.0 and 0.6.");
  }
  if (input.recencyWeight !== undefined && (input.recencyWeight < 0 || input.recencyWeight > 1)) {
    errors.push("recencyWeight must be between 0.0 and 1.0.");
  }
  if (input.scoreWeights) {
    const weights = {
      ...defaultScoreWeights,
      ...input.scoreWeights
    };
    const total = sum([weights.averageScore, weights.popularity, weights.favourites]);
    if (Math.abs(total - 1) > 0.001) {
      errors.push("base score weights averageScore + popularity + favourites must equal 1.0.");
    }
  }
  if (input.tasteWeights) {
    const weights = {
      ...defaultTasteWeights,
      ...input.tasteWeights
    };
    const total = sum([weights.genreMatch, weights.tagMatch, weights.titleSimilarity]);
    if (Math.abs(total - 1) > 0.001) {
      errors.push("taste weights genreMatch + tagMatch + titleSimilarity must equal 1.0.");
    }
  }
  return errors;
}

export async function readStoredConfig(configPath = defaultConfigPath): Promise<StoredAppConfig> {
  try {
    return JSON.parse(await readFile(configPath, "utf-8")) as StoredAppConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function writeStoredConfig(config: StoredAppConfig, configPath = defaultConfigPath): Promise<void> {
  const errors = validateConfig(config);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export function maskWebhook(value?: string): "configured" | "not configured" {
  return value ? "configured" : "not configured";
}

export function configForClient(config: AppConfig): Omit<AppConfig, "discordWebhookUrl"> & {
  discordWebhookStatus: "configured" | "not configured";
} {
  const { discordWebhookUrl: _secret, ...safe } = config;
  return {
    ...safe,
    discordWebhookStatus: maskWebhook(config.discordWebhookUrl)
  };
}

export function buildAppConfig(stored: StoredAppConfig = {}, env = process.env): AppConfig {
  const now = new Date();
  const envSeason = readEnvSeason(env.SEASON);
  const storedSeason = stored.season ?? envSeason;
  const storedYear = stored.year ?? (env.YEAR ? Number(env.YEAR) : "AUTO");
  const season = storedSeason === "AUTO" ? currentAnimeSeason(now) : storedSeason;
  const year = storedYear === "AUTO" ? now.getFullYear() : Number(storedYear);
  const personalizeWeight = Number(stored.personalizeWeight ?? env.PERSONALIZE_WEIGHT ?? 0.25);
  const recencyWeight = Number(stored.recencyWeight ?? 0.6);

  return {
    discordWebhookUrl: stored.discordWebhookUrl ?? env.DISCORD_WEBHOOK_URL ?? undefined,
    region: stored.region ?? env.REGION ?? "JP",
    season,
    year,
    port: Number(env.PORT || 3000),
    personalizeEnabled: stored.personalizeEnabled ?? (env.PERSONALIZE_ENABLED ?? "true").toLowerCase() === "true",
    personalizeWeight: Number.isFinite(personalizeWeight) ? clamp(personalizeWeight, 0, 0.6) : 0.25,
    viewingHistoryPath: stored.viewingHistoryPath ?? env.VIEWING_HISTORY_PATH ?? join("data", "viewing-history.json"),
    rankingLimit: stored.rankingLimit ?? 10,
    includeWatched: stored.includeWatched ?? true,
    sequelBoostEnabled: stored.sequelBoostEnabled ?? true,
    recencyWeight: Number.isFinite(recencyWeight) ? clamp(recencyWeight, 0, 1) : 0.6,
    discordNotifyEnabled: stored.discordNotifyEnabled ?? true,
    scoreWeights: {
      ...defaultScoreWeights,
      ...stored.scoreWeights
    },
    tasteWeights: {
      ...defaultTasteWeights,
      ...stored.tasteWeights
    },
    configPath: defaultConfigPath
  };
}

export async function loadAppConfig(configPath = defaultConfigPath): Promise<AppConfig> {
  return buildAppConfig(await readStoredConfig(configPath));
}
