import type { AnimeSeason } from "../types.js";
import { parseSeason, parseYear } from "../seasonSource.js";

export interface ParsedSeasonArgs {
  year: number;
  season: AnimeSeason;
  region?: string;
  personalize?: boolean;
  weight?: number;
  format?: "csv" | "json";
}

export function parseSeasonArgs(argv = process.argv.slice(2)): ParsedSeasonArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      values.set(token.slice(2), argv[index + 1] ?? "");
      index += 1;
    }
  }
  const format = String(values.get("format") ?? "csv").toLowerCase();
  return {
    year: parseYear(values.get("year")),
    season: parseSeason(values.get("season")),
    region: values.get("region") || undefined,
    personalize: values.has("personalize") ? values.get("personalize") === "true" : undefined,
    weight: values.has("weight") ? Number(values.get("weight")) : undefined,
    format: format === "json" ? "json" : "csv"
  };
}
