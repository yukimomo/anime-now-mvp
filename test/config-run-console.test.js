import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import test from "node:test";
import {
  buildAppConfig,
  maskWebhook,
  readStoredConfig,
  validateConfig,
  writeStoredConfig
} from "../dist/appConfig.js";
import { getRunHistory, isAllowedCommand, startRun } from "../dist/runConsole.js";

test("saves and loads app-config.json style settings", async () => {
  const path = "app-config-test.json";
  await rm(path, { force: true });
  await writeStoredConfig({
    region: "US",
    season: "SUMMER",
    year: 2026,
    rankingLimit: 20,
    personalizeWeight: 0.35,
    scoreWeights: {
      averageScore: 0.5,
      popularity: 0.3,
      favourites: 0.2
    },
    tasteWeights: {
      genreMatch: 0.4,
      tagMatch: 0.4,
      titleSimilarity: 0.2
    }
  }, path);

  const loaded = await readStoredConfig(path);
  assert.equal(loaded.region, "US");
  assert.equal(loaded.personalizeWeight, 0.35);
  await rm(path, { force: true });
});

test("reads initial values from env and changes PERSONALIZE_WEIGHT", () => {
  const config = buildAppConfig({}, {
    REGION: "KR",
    SEASON: "SPRING",
    YEAR: "2026",
    PERSONALIZE_WEIGHT: "0.25"
  });
  const changed = buildAppConfig({ personalizeWeight: 0.5 }, {});

  assert.equal(config.region, "KR");
  assert.equal(config.personalizeWeight, 0.25);
  assert.equal(changed.personalizeWeight, 0.5);
});

test("detects invalid weight totals", () => {
  const errors = validateConfig({
    scoreWeights: {
      averageScore: 0.6,
      popularity: 0.3,
      favourites: 0.3
    }
  });
  assert.ok(errors.some((error) => error.includes("base score weights")));
});

test("masks Discord webhook configuration", () => {
  assert.equal(maskWebhook("https://discord.com/api/webhooks/secret"), "configured");
  assert.equal(maskWebhook(undefined), "not configured");
});

test("allows only whitelisted Run Console commands", () => {
  assert.equal(isAllowedCommand("fetch"), true);
  assert.equal(isAllowedCommand("notify"), true);
  assert.equal(isAllowedCommand("rm -rf ."), false);
});

test("prevents double execution and saves run history", async () => {
  await rm("run-history.json", { force: true });
  await rm("logs", { recursive: true, force: true });
  process.env.RUN_CONSOLE_TEST_DELAY_MS = "100";
  const config = buildAppConfig();
  await startRun("health-check", config);
  await assert.rejects(() => startRun("health-check", config), /already running/);
  let history = [];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    history = await getRunHistory();
    if (history[0]) break;
  }
  delete process.env.RUN_CONSOLE_TEST_DELAY_MS;
  assert.equal(history[0].command, "health-check");
  assert.equal(history[0].status, "success");
});

test("ranking UI includes score breakdown labels", async () => {
  const server = await readFile("src/server.ts", "utf-8");
  assert.match(server, /ベーススコア/);
  assert.match(server, /好みスコア/);
  assert.match(server, /人気度補正/);
});

test("primary screen labels are localized in Japanese", async () => {
  const server = await readFile("src/server.ts", "utf-8");
  assert.match(server, /ランキング/);
  assert.match(server, /設定/);
  assert.match(server, /実行/);
  assert.match(server, /視聴履歴と好み/);
  assert.doesNotMatch(server, />Settings</);
  assert.doesNotMatch(server, />Run Console</);
  assert.doesNotMatch(server, />Import History/);
  assert.doesNotMatch(server, />Loading/);
});
