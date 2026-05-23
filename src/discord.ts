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
    const title = anime.displayTitleJa;
    const justWatchUrl = anime.justWatchSearchUrl.split("?")[0]; // URL パラメータを削除
    return `${anime.rank}. ${title} - ${score}点\n${justWatchUrl}`;
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
    const responseText = await response.text();
    console.error(`Discord webhook failed: ${response.status} ${response.statusText}`);
    console.error(`Response: ${responseText}`);
    console.error(`Payload length: ${payload.length}`);
    throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
  }
}
