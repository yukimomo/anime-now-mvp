import { createHash } from "node:crypto";
import type { AppConfig, RankedAnime } from "./types.js";

export function createTop10Hash(ranked: RankedAnime[]): string {
  const source = ranked
    .map((anime) => `${anime.rank}:${anime.id}:${anime.recommendationScore.toFixed(2)}`)
    .join("|");
  return createHash("sha256").update(source).digest("hex");
}

export function formatDiscordMessage(config: AppConfig, ranked: RankedAnime[]): string {
  const lines = ranked.map((anime) => {
    const score = anime.recommendationScore.toFixed(1);
    const tasteScore = anime.personalTasteScore.toFixed(1);
    const reason = anime.tasteReasons[0] ? `\n理由: ${anime.tasteReasons[0]}` : "";
    return `${anime.rank}. ${anime.displayTitleJa}\n総合 ${score} / 好み ${tasteScore}${reason}\n${anime.siteUrl}`;
  });

  return [
    `**今見るべきアニメ TOP10 (${config.year} ${config.season})**`,
    "",
    ...lines
  ].join("\n");
}

export async function sendDiscordWebhook(webhookUrl: string, content: string): Promise<void> {
  const payload = JSON.stringify({
    content
  });

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: payload
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
  }
}
