import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SeriesStat, ViewingHistory, ViewingHistoryItem } from "../types.js";
import { normalizeSeriesTitle } from "../taste/titleMatcher.js";

const titleColumns = ["title", "タイトル", "作品名", "番組名"];
const dateColumns = ["date", "watched date", "view date", "日付", "視聴日"];

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell.trim());
  return cells;
}

function parseCsv(csv: string): string[][] {
  const rows: string[] = [];
  let row = "";
  let inQuotes = false;
  const text = csv.replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && next === '"') {
      row += char + next;
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
      row += char;
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (row.trim()) rows.push(row);
      row = "";
      if (char === "\r" && next === "\n") index += 1;
    } else {
      row += char;
    }
  }
  if (row.trim()) rows.push(row);

  return rows.map(parseCsvLine);
}

function findColumn(headers: string[], candidates: string[]): number {
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());
  return normalizedHeaders.findIndex((header) => candidates.some((candidate) => header === candidate));
}

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  const match = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return value.trim();
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function compareDate(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b);
}

export function parseNetflixViewingHistory(csv: string): ViewingHistory {
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    throw new Error("CSV has no viewing history rows.");
  }

  const headers = rows[0];
  const titleIndex = findColumn(headers, titleColumns);
  const dateIndex = findColumn(headers, dateColumns);
  if (titleIndex < 0) {
    throw new Error(`CSV title column was not found. Supported examples: ${titleColumns.join(", ")}`);
  }

  const items: ViewingHistoryItem[] = rows.slice(1)
    .map((row): ViewingHistoryItem | null => {
      const rawTitle = row[titleIndex]?.trim();
      if (!rawTitle) return null;
      const item: ViewingHistoryItem = {
        rawTitle,
        normalizedTitle: normalizeSeriesTitle(rawTitle)
      };
      const watchedAt = normalizeDate(dateIndex >= 0 ? row[dateIndex] : undefined);
      if (watchedAt) item.watchedAt = watchedAt;
      return item;
    })
    .filter((item): item is ViewingHistoryItem => Boolean(item));

  const stats = new Map<string, SeriesStat>();
  for (const item of items) {
    const current = stats.get(item.normalizedTitle) ?? {
      title: item.normalizedTitle,
      watchCount: 0,
      lastWatchedAt: undefined
    };
    current.watchCount += 1;
    if (compareDate(item.watchedAt, current.lastWatchedAt) > 0) {
      current.lastWatchedAt = item.watchedAt;
    }
    stats.set(item.normalizedTitle, current);
  }

  return {
    items,
    seriesStats: [...stats.values()].sort((a, b) => b.watchCount - a.watchCount),
    importedAt: new Date().toISOString()
  };
}

export async function importNetflixCsvFile(csvPath: string, outputPath: string): Promise<ViewingHistory> {
  const csv = await readFile(csvPath, "utf-8");
  const history = parseNetflixViewingHistory(csv);
  await saveViewingHistory(outputPath, history);
  return history;
}

export async function saveViewingHistory(outputPath: string, history: ViewingHistory): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(history, null, 2)}\n`, "utf-8");
}
