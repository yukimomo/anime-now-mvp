import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTopAnime } from "./service.js";
import { clearTopAnimeCache } from "./service.js";
import { createTop10Hash, formatDiscordMessage, sendDiscordWebhook } from "./discord.js";
import { hasNotificationRun, openDb, recordNotificationRun, saveRankingSnapshot } from "./db.js";
import { loadViewingHistory, buildTasteProfile, topProfileTerms } from "./taste/profile.js";
import type { AppConfig } from "./types.js";

export type RunCommand =
  | "fetch"
  | "ranking"
  | "import-netflix"
  | "rebuild-profile"
  | "notify"
  | "all"
  | "clear-cache"
  | "config-check"
  | "health-check";

export interface RunRecord {
  id: string;
  command: RunCommand;
  status: "running" | "success" | "failed";
  startedAt: string;
  endedAt?: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
  logPath: string;
}

const historyPath = "run-history.json";
const running = new Map<string, RunRecord>();

export function isAllowedCommand(command: string): command is RunCommand {
  return [
    "fetch",
    "ranking",
    "import-netflix",
    "rebuild-profile",
    "notify",
    "all",
    "clear-cache",
    "config-check",
    "health-check"
  ].includes(command);
}

async function loadHistory(): Promise<RunRecord[]> {
  try {
    return JSON.parse(await readFile(historyPath, "utf-8")) as RunRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function saveHistory(records: RunRecord[]): Promise<void> {
  await writeFile(historyPath, `${JSON.stringify(records.slice(0, 30), null, 2)}\n`, "utf-8");
}

async function appendHistory(record: RunRecord): Promise<void> {
  const records = await loadHistory();
  const next = [record, ...records.filter((item) => item.id !== record.id)];
  await saveHistory(next);
}

async function writeRunLog(record: RunRecord): Promise<void> {
  await mkdir(dirname(record.logPath), { recursive: true });
  await writeFile(
    record.logPath,
    [
      `command: ${record.command}`,
      `status: ${record.status}`,
      `startedAt: ${record.startedAt}`,
      `endedAt: ${record.endedAt ?? ""}`,
      `exitCode: ${record.exitCode ?? ""}`,
      "",
      "[stdout]",
      record.stdout,
      "",
      "[stderr]",
      record.stderr
    ].join("\n"),
    "utf-8"
  );
}

function newRecord(command: RunCommand): RunRecord {
  const startedAt = new Date().toISOString();
  const id = createHash("sha1").update(`${command}:${startedAt}`).digest("hex").slice(0, 12);
  return {
    id,
    command,
    status: "running",
    startedAt,
    stdout: "",
    stderr: "",
    logPath: join("logs", `${startedAt.replace(/[:.]/g, "-")}-${command}.log`)
  };
}

export function getRunningStatus(): RunRecord | null {
  return [...running.values()][0] ?? null;
}

export async function getRunHistory(): Promise<RunRecord[]> {
  return loadHistory();
}

function runNodeScript(script: string, args: string[] = []): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const nodePath = process.execPath;
  const scriptPath = fileURLToPath(new URL(script, import.meta.url));
  return new Promise((resolve) => {
    const child = spawn(nodePath, [scriptPath, ...args], {
      shell: false,
      cwd: process.cwd(),
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1
      });
    });
  });
}

async function executeInternal(command: RunCommand, config: AppConfig, args: string[]): Promise<string> {
  if (command === "fetch" || command === "ranking") {
    const ranked = await getTopAnime(config);
    const db = openDb();
    saveRankingSnapshot(db, config, ranked);
    db.close();
    return `Generated ranking with ${ranked.length} items.`;
  }
  if (command === "import-netflix") {
    const csvPath = args[0];
    if (!csvPath) throw new Error("CSV path is required.");
    const result = await runNodeScript("./cli/import-netflix.js", [csvPath]);
    if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || "import-netflix failed");
    return result.stdout;
  }
  if (command === "rebuild-profile") {
    const history = await loadViewingHistory(config.viewingHistoryPath);
    if (!history) return "No viewing history found.";
    const profile = await buildTasteProfile(history, config.recencyWeight);
    return `Profile rebuilt. Top genres: ${topProfileTerms(profile.genreWeights).join(", ") || "-"}.`;
  }
  if (command === "notify") {
    if (!config.discordNotifyEnabled) return "Discord notification is disabled.";
    if (!config.discordWebhookUrl) throw new Error("Discord webhook is not configured.");
    const ranked = await getTopAnime(config);
    const hash = createTop10Hash(ranked);
    const db = openDb();
    saveRankingSnapshot(db, config, ranked);
    if (hasNotificationRun(db, config, hash)) {
      db.close();
      return "Same TOP10 content has already been notified.";
    }
    await sendDiscordWebhook(config.discordWebhookUrl, formatDiscordMessage(config, ranked));
    recordNotificationRun(db, config, hash, ranked);
    db.close();
    return "Discord notification sent.";
  }
  if (command === "all") {
    const fetchResult = await executeInternal("fetch", config, []);
    const notifyResult = await executeInternal("notify", config, []);
    return `${fetchResult}\n${notifyResult}`;
  }
  if (command === "clear-cache") {
    clearTopAnimeCache();
    return "Cleared ranking cache.";
  }
  if (command === "config-check") {
    return `Config OK: ${config.region} ${config.year} ${config.season}, personalize=${config.personalizeEnabled}, weight=${config.personalizeWeight}`;
  }
  if (command === "health-check") {
    const delay = Number(process.env.RUN_CONSOLE_TEST_DELAY_MS || 0);
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return "OK";
  }
  throw new Error("Command is not allowed.");
}

export async function startRun(command: string, config: AppConfig, args: string[] = []): Promise<RunRecord> {
  if (!isAllowedCommand(command)) {
    throw new Error("Command is not allowed.");
  }
  if (running.size > 0) {
    throw new Error("Another command is already running.");
  }

  const record = newRecord(command);
  running.set(record.id, record);

  void (async () => {
    try {
      record.stdout = await executeInternal(command, config, args);
      record.status = "success";
      record.exitCode = 0;
    } catch (error) {
      record.status = "failed";
      record.exitCode = 1;
      record.stderr = (error as Error).message.replace(/https:\/\/discord(?:app)?\.com\/api\/webhooks\/\S+/g, "[masked webhook]");
    } finally {
      record.endedAt = new Date().toISOString();
      running.delete(record.id);
      await writeRunLog(record);
      await appendHistory(record);
    }
  })();

  return record;
}
