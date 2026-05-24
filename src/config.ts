import "dotenv/config";
import { buildAppConfig } from "./appConfig.js";
import type { AppConfig } from "./types.js";

export function getConfig(): AppConfig {
  return buildAppConfig();
}
