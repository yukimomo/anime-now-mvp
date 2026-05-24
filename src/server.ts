import express from "express";
import {
  buildAnalyticsSummary,
  buildRankingImpact,
  buildSeriesAnalytics,
  buildTasteProfileForAnalytics,
  buildTimelineAnalytics,
  filterSeriesAnalytics,
  profileWeightsForDisplay
} from "./analytics.js";
import { configForClient, loadAppConfig, readStoredConfig, validateConfig, writeStoredConfig } from "./appConfig.js";
import { parseNetflixViewingHistory, saveViewingHistory } from "./imports/netflix.js";
import { getTopAnime } from "./service.js";
import { clearTopAnimeCache } from "./service.js";
import { buildTasteProfile, loadViewingHistory, topProfileTerms } from "./taste/profile.js";
import { getRunHistory, getRunningStatus, startRun } from "./runConsole.js";
import {
  fetchAndSaveSeasonSource,
  listSavedSeasons,
  loadSeasonRanking,
  loadSeasonSource,
  notifySeasonRanking,
  parseSeason,
  parseYear,
  rankAndSaveSeason,
  seasonPaths
} from "./seasonSource.js";

const bootConfig = await loadAppConfig();
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: ["text/*", "application/csv"], limit: "5mb" }));

async function currentConfig() {
  return loadAppConfig();
}

function maskWebhookInMessage(message: string): string {
  return message.replace(/https:\/\/discord(?:app)?\.com\/api\/webhooks\/\S+/g, "[masked webhook]");
}

app.get("/api/config", async (_req, res, next) => {
  try {
    const config = await currentConfig();
    const stored = await readStoredConfig();
    res.json({
      config: configForClient(config),
      stored,
      validationErrors: validateConfig(stored)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/config", async (req, res, next) => {
  try {
    const existing = await readStoredConfig();
    const nextConfig = {
      ...existing,
      ...req.body,
      discordWebhookUrl: req.body.discordWebhookUrl || existing.discordWebhookUrl
    };
    const errors = validateConfig(nextConfig);
    if (errors.length) {
      res.status(400).json({ errors });
      return;
    }
    await writeStoredConfig(nextConfig);
    clearTopAnimeCache();
    res.json({ config: configForClient(await currentConfig()) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/ranking", async (_req, res, next) => {
  try {
    const config = await currentConfig();
    res.json({
      season: config.season,
      year: config.year,
      region: config.region,
      personalizeEnabled: config.personalizeEnabled,
      personalizeWeight: config.personalizeWeight,
      ranking: await getTopAnime(config)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/taste-profile", async (_req, res, next) => {
  try {
    const config = await currentConfig();
    const history = await loadViewingHistory(config.viewingHistoryPath);
    if (!history) {
      res.json({
        imported: false,
        itemCount: 0,
        seriesCount: 0,
        importedAt: null,
        topGenres: [],
        topTags: []
      });
      return;
    }

    const profile = await buildTasteProfile(history, config.recencyWeight);
    res.json({
      imported: true,
      itemCount: history.items.length,
      seriesCount: history.seriesStats.length,
      importedAt: history.importedAt,
      topGenres: topProfileTerms(profile.genreWeights),
      topTags: topProfileTerms(profile.tagWeights)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/import/netflix", async (req, res, next) => {
  try {
    const config = await currentConfig();
    if (typeof req.body !== "string" || !req.body.trim()) {
      res.status(400).json({ error: "CSVファイルの内容が空です。" });
      return;
    }

    const history = parseNetflixViewingHistory(req.body);
    await saveViewingHistory(config.viewingHistoryPath, history);
    clearTopAnimeCache();
    const profile = await buildTasteProfile(history, config.recencyWeight);
    res.json({
      imported: true,
      itemCount: history.items.length,
      seriesCount: history.seriesStats.length,
      importedAt: history.importedAt,
      topGenres: topProfileTerms(profile.genreWeights),
      topTags: topProfileTerms(profile.tagWeights)
    });
  } catch (error) {
    next(error);
  }
});

async function analyticsContext() {
  const config = await currentConfig();
  const history = await loadViewingHistory(config.viewingHistoryPath);
  const profile = await buildTasteProfileForAnalytics(history, config);
  return { config, history, profile };
}

app.get("/api/analytics/summary", async (_req, res, next) => {
  try {
    const { history, profile } = await analyticsContext();
    res.json(buildAnalyticsSummary(history, profile));
  } catch (error) {
    next(error);
  }
});

app.get("/api/analytics/timeline", async (_req, res, next) => {
  try {
    const { history, profile } = await analyticsContext();
    res.json(buildTimelineAnalytics(history, profile));
  } catch (error) {
    next(error);
  }
});

app.get("/api/analytics/series", async (req, res, next) => {
  try {
    const { history, profile } = await analyticsContext();
    const items = history ? buildSeriesAnalytics(history, profile) : [];
    res.json({
      items: filterSeriesAnalytics(items, {
        q: String(req.query.q ?? ""),
        sort: String(req.query.sort ?? "watchCount"),
        range: String(req.query.range ?? "all")
      }).slice(0, 200)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/analytics/taste-profile", async (_req, res, next) => {
  try {
    const { config, history, profile } = await analyticsContext();
    res.json({
      imported: Boolean(history),
      personalizeWeight: config.personalizeWeight,
      explanation: `好みスコアは総合点の${Math.round(config.personalizeWeight * 100)}%に影響します。`,
      genreWeights: profileWeightsForDisplay(profile?.genreWeights ?? {}, 20),
      tagWeights: profileWeightsForDisplay(profile?.tagWeights ?? {}, 20),
      likedTitles: profile?.likedTitles.slice(0, 50) ?? [],
      topFactors: [
        ...profileWeightsForDisplay(profile?.genreWeights ?? {}, 5).map((item) => ({ type: "ジャンル", ...item })),
        ...profileWeightsForDisplay(profile?.tagWeights ?? {}, 5).map((item) => ({ type: "タグ", ...item }))
      ].sort((a, b) => b.weight - a.weight).slice(0, 10)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/analytics/ranking-impact", async (_req, res, next) => {
  try {
    const config = await currentConfig();
    res.json({
      items: buildRankingImpact(await getTopAnime(config))
    });
  } catch (error) {
    res.json({
      items: [],
      error: maskWebhookInMessage((error as Error).message)
    });
  }
});

async function startNamedRun(name: string, req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const config = await currentConfig();
    const args = Array.isArray(req.body?.args) ? req.body.args.map(String) : [];
    res.json(await startRun(name, config, args));
  } catch (error) {
    next(error);
  }
}

app.post("/api/run/fetch", (req, res, next) => startNamedRun("fetch", req, res, next));
app.post("/api/run/ranking", (req, res, next) => startNamedRun("ranking", req, res, next));
app.post("/api/run/import-netflix", (req, res, next) => startNamedRun("import-netflix", req, res, next));
app.post("/api/run/rebuild-profile", (req, res, next) => startNamedRun("rebuild-profile", req, res, next));
app.post("/api/run/notify", (req, res, next) => startNamedRun("notify", req, res, next));
app.post("/api/run/all", (req, res, next) => startNamedRun("all", req, res, next));
app.post("/api/run/clear-cache", (req, res, next) => startNamedRun("clear-cache", req, res, next));
app.post("/api/run/config-check", (req, res, next) => startNamedRun("config-check", req, res, next));
app.post("/api/run/health-check", (req, res, next) => startNamedRun("health-check", req, res, next));

app.get("/api/run/status", (_req, res) => {
  res.json({ running: getRunningStatus() });
});

app.get("/api/run/history", async (_req, res, next) => {
  try {
    res.json({ history: await getRunHistory() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/discord/test", (req, res, next) => startNamedRun("notify", req, res, next));

function seasonRequest(req: express.Request) {
  const body = req.body ?? {};
  return {
    year: parseYear(body.year ?? req.params.year ?? req.query.year),
    season: parseSeason(body.season ?? req.params.season ?? req.query.season),
    region: String(body.region ?? req.query.region ?? ""),
    personalize: body.personalize === undefined ? undefined : Boolean(body.personalize),
    personalizeWeight: body.personalizeWeight === undefined ? undefined : Number(body.personalizeWeight)
  };
}

app.get("/api/seasons", async (_req, res, next) => {
  try {
    const config = await currentConfig();
    res.json({
      defaults: {
        year: config.year,
        season: config.season,
        region: config.region,
        personalize: config.personalizeEnabled,
        personalizeWeight: config.personalizeWeight
      },
      seasons: await listSavedSeasons()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/seasons/fetch", async (req, res, next) => {
  try {
    const request = seasonRequest(req);
    const result = await fetchAndSaveSeasonSource(request);
    res.json({ savedTo: result.path, count: result.items.length, items: result.items });
  } catch (error) {
    next(error);
  }
});

app.post("/api/seasons/rank", async (req, res, next) => {
  try {
    const config = await currentConfig();
    const request = seasonRequest(req);
    const result = await rankAndSaveSeason(config, {
      ...request,
      region: request.region || config.region
    });
    res.json({ ranking: result.ranking, jsonPath: result.jsonPath, csvPath: result.csvPath });
  } catch (error) {
    next(error);
  }
});

app.get("/api/seasons/:year/:season/source", async (req, res, next) => {
  try {
    res.json({ items: await loadSeasonSource(parseYear(req.params.year), parseSeason(req.params.season)) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/seasons/:year/:season/ranking", async (req, res, next) => {
  try {
    res.json({ ranking: await loadSeasonRanking(parseYear(req.params.year), parseSeason(req.params.season)) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/seasons/:year/:season/export.csv", async (req, res, next) => {
  try {
    const { readFile } = await import("node:fs/promises");
    const path = seasonPaths(parseYear(req.params.year), parseSeason(req.params.season)).csv;
    res.type("text/csv").send(await readFile(path, "utf-8"));
  } catch (error) {
    next(error);
  }
});

app.get("/api/seasons/:year/:season/export.json", async (req, res, next) => {
  try {
    res.json({ ranking: await loadSeasonRanking(parseYear(req.params.year), parseSeason(req.params.season)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/seasons/:year/:season/notify", async (req, res, next) => {
  try {
    const config = await currentConfig();
    const hash = await notifySeasonRanking(config, parseYear(req.params.year), parseSeason(req.params.season));
    res.json({ notified: true, hash });
  } catch (error) {
    next(error);
  }
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Anime Now MVP</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #18202a; }
    header { padding: 20px 24px; background: #18202a; color: white; }
    main { max-width: 1220px; margin: 0 auto; padding: 20px; }
    h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 20px; }
    h3 { margin: 0 0 12px; font-size: 16px; }
    .meta { margin-top: 6px; color: #cbd5e1; font-size: 14px; }
    nav { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    nav button { background: #263241; color: white; border-color: #405166; }
    nav button.active { background: #0f766e; border-color: #0f766e; }
    section.view { display: none; }
    section.view.active { display: block; }
    .panel { background: white; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; margin-bottom: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 14px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    label { display: grid; gap: 5px; font-size: 14px; color: #334155; }
    input, select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; font: inherit; }
    input[type="checkbox"] { width: 18px; height: 18px; }
    input[type="range"] { padding: 0; }
    article { background: white; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; }
    .rank { color: #0f766e; font-weight: 800; font-size: 14px; }
    .en, .muted { color: #687386; font-size: 13px; }
    dl { display: grid; grid-template-columns: 140px 1fr; gap: 6px 10px; margin: 14px 0; font-size: 14px; }
    dt { color: #687386; }
    dd { margin: 0; }
    button, .button { border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 9px; background: #f8fafc; font-size: 14px; color: #0f172a; cursor: pointer; }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .ok { color: #075e54; background: #edfdf8; border: 1px solid #a7f3d0; padding: 10px; border-radius: 8px; }
    .error { color: #b42318; background: #fff1f0; border: 1px solid #ffccc7; padding: 10px; border-radius: 8px; }
    pre { white-space: pre-wrap; background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 12px; overflow: auto; max-height: 280px; }
    .reasons { padding-left: 18px; margin: 8px 0 0; color: #314155; font-size: 14px; }
    a { color: #0f5f9f; text-decoration: none; }
    .toast { position: fixed; right: 16px; bottom: 16px; max-width: 360px; z-index: 10; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: left; vertical-align: top; }
    th { color: #475569; background: #f8fafc; position: sticky; top: 0; }
    .wide-table { overflow: auto; max-height: 520px; border: 1px solid #e2e8f0; border-radius: 8px; }
  </style>
</head>
<body>
  <header>
    <h1>Anime Now MVP</h1>
    <div id="headerMeta" class="meta">読み込み中...</div>
    <nav>
      <button data-view="ranking" class="active">ランキング</button>
      <button data-view="settings">設定</button>
      <button data-view="run">実行</button>
      <button data-view="profile">視聴履歴と好み</button>
      <button data-view="analytics">視聴分析</button>
    </nav>
  </header>
  <main>
    <section id="ranking" class="view active">
      <div class="panel row">
        <button id="refreshRanking">ランキングを更新</button>
        <span class="muted">好み反映の比較: 0.25 / 0.35 / 0.5</span>
      </div>
      <div class="panel">
        <h2>シーズン別ランキング元データ</h2>
        <div class="form-grid">
          <label>年<input id="seasonYear" type="number" min="1900" max="2100" /></label>
          <label>シーズン<select id="seasonName"><option>WINTER</option><option>SPRING</option><option>SUMMER</option><option>FALL</option></select></label>
          <label>地域<select id="seasonRegion"><option>JP</option><option>US</option><option>KR</option><option>GB</option></select></label>
          <label class="row"><input id="seasonPersonalize" type="checkbox" /> 好み反映</label>
          <label>好み反映の強さ <span id="seasonWeightValue"></span><input id="seasonWeight" type="range" min="0" max="0.6" step="0.01" /></label>
        </div>
        <div class="row" style="margin-top: 12px;">
          <button id="seasonFetch" type="button">取得</button>
          <button id="seasonRank" type="button">ランキング計算</button>
          <button id="seasonCsv" type="button">CSV出力</button>
          <button id="seasonJson" type="button">JSON出力</button>
          <button id="seasonNotify" type="button">Discord通知</button>
        </div>
        <div class="row" style="margin-top: 12px;">
          <select id="seasonSort"><option value="recommendationScore">総合スコア</option><option value="baseScore">ベーススコア</option><option value="personalTasteScore">好みスコア</option><option value="averageScore">平均スコア</option><option value="popularity">人気度</option><option value="favourites">お気に入り</option><option value="trending">トレンド</option><option value="startDate">開始日</option></select>
          <input id="seasonFormatFilter" placeholder="形式で絞り込み" />
          <input id="seasonStatusFilter" placeholder="状態で絞り込み" />
          <input id="seasonGenreFilter" placeholder="ジャンルで絞り込み" />
          <input id="seasonTagFilter" placeholder="タグで絞り込み" />
          <input id="seasonStudioFilter" placeholder="スタジオで絞り込み" />
          <select id="seasonWatchedFilter"><option value="all">視聴済み/未視聴すべて</option><option value="watched">視聴済み</option><option value="unwatched">未視聴</option><option value="sequel">続編っぽい作品</option></select>
          <button id="seasonApplyFilter" type="button">絞り込み</button>
        </div>
        <div id="seasonResult" style="margin-top: 12px;"></div>
      </div>
      <div id="rankingContent">読み込み中...</div>
    </section>

    <section id="settings" class="view">
      <div class="panel">
        <h2>設定</h2>
        <form id="settingsForm">
          <h3>基本設定</h3>
          <div class="form-grid">
            <label>配信地域<select name="region"><option>JP</option><option>US</option><option>KR</option><option>GB</option></select></label>
            <label>シーズン<select name="season"><option value="AUTO">自動</option><option value="SPRING">春</option><option value="SUMMER">夏</option><option value="FALL">秋</option><option value="WINTER">冬</option></select></label>
            <label>年<input name="year" placeholder="AUTO または 2026" /></label>
            <label>表示件数<select name="rankingLimit"><option>10</option><option>20</option><option>30</option><option>50</option></select></label>
          </div>
          <h3>好み反映設定</h3>
          <div class="form-grid">
            <label class="row"><input type="checkbox" name="personalizeEnabled" /> 好みをランキングに反映</label>
            <label>好み反映の強さ <span id="personalizeWeightValue"></span><input type="range" name="personalizeWeight" min="0" max="0.6" step="0.01" /></label>
            <label class="row"><input type="checkbox" name="includeWatched" /> 視聴済み作品を含める</label>
            <label class="row"><input type="checkbox" name="sequelBoostEnabled" /> 続編候補を優先</label>
            <label>最近見た作品の重視度<input type="range" name="recencyWeight" min="0" max="1" step="0.05" /></label>
          </div>
          <h3>スコア重み設定</h3>
          <div class="form-grid">
            <label>平均スコアの重み<input name="score.averageScore" type="number" step="0.05" min="0" max="1" /></label>
            <label>人気度の重み<input name="score.popularity" type="number" step="0.05" min="0" max="1" /></label>
            <label>お気に入り数の重み<input name="score.favourites" type="number" step="0.05" min="0" max="1" /></label>
            <label>放送中ボーナス<input name="score.airingBonus" type="number" step="0.5" min="0" max="20" /></label>
            <label>ジャンル一致の重み<input name="taste.genreMatch" type="number" step="0.05" min="0" max="1" /></label>
            <label>タグ一致の重み<input name="taste.tagMatch" type="number" step="0.05" min="0" max="1" /></label>
            <label>タイトル類似の重み<input name="taste.titleSimilarity" type="number" step="0.05" min="0" max="1" /></label>
          </div>
          <h3>Discord通知設定</h3>
          <div class="form-grid">
            <label class="row"><input type="checkbox" name="discordNotifyEnabled" /> Discord通知を有効にする</label>
            <label>通知先URL<input name="discordWebhookUrl" type="password" autocomplete="off" placeholder="未入力なら既存値を維持" /></label>
            <label>通知先の設定状態<input id="webhookStatus" readonly /></label>
          </div>
          <div class="row" style="margin-top: 14px;">
            <button type="submit">保存</button>
            <button type="button" id="testDiscord">テスト通知</button>
          </div>
        </form>
        <div id="settingsResult"></div>
      </div>
    </section>

    <section id="run" class="view">
      <div class="panel">
        <h2>実行</h2>
        <div class="row" id="runButtons"></div>
        <div id="runStatus" style="margin-top: 12px;"></div>
      </div>
      <div class="panel">
        <h3>直近の実行履歴</h3>
        <div id="runHistory">読み込み中...</div>
      </div>
    </section>

    <section id="profile" class="view">
      <div class="panel">
        <h2>視聴履歴と好み</h2>
        <div class="row">
          <input id="csvFile" type="file" accept=".csv,text/csv" />
          <button id="uploadButton" type="button">CSVを取り込む</button>
          <button id="rebuildProfile" type="button">好みプロファイルを再生成</button>
        </div>
        <p class="muted">Netflixから手動でダウンロードした視聴履歴CSVだけをローカル保存します。ログイン情報やCookieは扱いません。</p>
        <div id="importResult"></div>
      </div>
      <div class="panel">
        <h3>好みプロファイル</h3>
        <div id="profileContent">読み込み中...</div>
      </div>
    </section>

    <section id="analytics" class="view">
      <div class="panel">
        <h2>視聴分析</h2>
        <p class="muted">Netflix視聴履歴CSVから、視聴量・シリーズ傾向・ジャンルやタグの好み・ランキングへの影響を確認します。</p>
      </div>
      <div class="grid" id="analyticsSummary"></div>
      <div class="grid">
        <div class="panel"><h3>月別視聴件数</h3><div id="monthlyChart"></div></div>
        <div class="panel"><h3>曜日別視聴件数</h3><div id="weekdayChart"></div></div>
        <div class="panel"><h3>ジャンル分布</h3><div id="genreChart"></div></div>
        <div class="panel"><h3>タグ分布</h3><div id="tagChart"></div></div>
      </div>
      <div class="panel">
        <h3>シリーズ分析</h3>
        <div class="row">
          <input id="seriesSearch" placeholder="シリーズ名で検索" />
          <select id="seriesSort"><option value="watchCount">視聴回数が多い順</option><option value="lastWatchedAt">最近見た順</option><option value="title">タイトル順</option></select>
          <select id="seriesFilter"><option value="all">すべて</option><option value="recent">最近見たもの</option><option value="one">1話だけで止まったもの</option><option value="ten">10話以上見たもの</option></select>
          <button id="applySeriesFilter">絞り込み</button>
        </div>
        <div id="seriesTable"></div>
      </div>
      <div class="panel">
        <h3>好みプロファイル分析</h3>
        <div id="tasteProfileAnalytics"></div>
      </div>
      <div class="panel">
        <h3>ランキングへの影響</h3>
        <div id="rankingImpact"></div>
      </div>
    </section>
  </main>
  <div id="toast" class="toast"></div>
  <script>
    let appConfig = null;
    let running = false;
    const runCommands = [
      ["fetch", "今期アニメ取得"],
      ["ranking", "ランキング再計算"],
      ["rebuild-profile", "好みプロファイル再生成"],
      ["notify", "Discord通知"],
      ["all", "全体実行"],
      ["season-fetch", "指定シーズン取得"],
      ["season-ranking", "指定シーズンランキング計算"],
      ["season-export", "指定シーズンCSV出力"],
      ["season-notify", "指定シーズンDiscord通知"],
      ["clear-cache", "キャッシュ削除"],
      ["config-check", "設定確認"],
      ["health-check", "ヘルスチェック"]
    ];
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
    function toast(message, ok = true) {
      document.getElementById("toast").innerHTML = '<div class="' + (ok ? "ok" : "error") + '">' + escapeHtml(message) + '</div>';
      setTimeout(() => document.getElementById("toast").innerHTML = "", 4000);
    }
    function show(view) {
      document.querySelectorAll(".view").forEach((item) => item.classList.toggle("active", item.id === view));
      document.querySelectorAll("nav button").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
    }
    document.querySelectorAll("nav button").forEach((button) => button.addEventListener("click", () => show(button.dataset.view)));

    async function api(path, options) {
      const response = await fetch(path, options);
      const data = await response.json();
      if (!response.ok) throw new Error((data.errors || [data.error || "APIエラー"]).join(" "));
      return data;
    }
    function webhookStatusText(status) {
      return status === "configured" ? "設定済み" : "未設定";
    }
    async function loadConfig() {
      const data = await api("/api/config");
      appConfig = data.config;
      document.getElementById("headerMeta").textContent =
        appConfig.year + "年 " + appConfig.season +
        " / 地域: " + appConfig.region +
        " / 好み反映: " + (appConfig.personalizeEnabled ? "ON" : "OFF") +
        " (" + appConfig.personalizeWeight + ")";
      const form = document.getElementById("settingsForm");
      form.region.value = appConfig.region;
      form.season.value = data.stored.season || "AUTO";
      form.year.value = data.stored.year || "AUTO";
      form.rankingLimit.value = appConfig.rankingLimit;
      form.personalizeEnabled.checked = appConfig.personalizeEnabled;
      form.personalizeWeight.value = appConfig.personalizeWeight;
      document.getElementById("personalizeWeightValue").textContent = appConfig.personalizeWeight;
      form.includeWatched.checked = appConfig.includeWatched;
      form.sequelBoostEnabled.checked = appConfig.sequelBoostEnabled;
      form.recencyWeight.value = appConfig.recencyWeight;
      form["score.averageScore"].value = appConfig.scoreWeights.averageScore;
      form["score.popularity"].value = appConfig.scoreWeights.popularity;
      form["score.favourites"].value = appConfig.scoreWeights.favourites;
      form["score.airingBonus"].value = appConfig.scoreWeights.airingBonus;
      form["taste.genreMatch"].value = appConfig.tasteWeights.genreMatch;
      form["taste.tagMatch"].value = appConfig.tasteWeights.tagMatch;
      form["taste.titleSimilarity"].value = appConfig.tasteWeights.titleSimilarity;
      form.discordNotifyEnabled.checked = appConfig.discordNotifyEnabled;
      document.getElementById("webhookStatus").value = webhookStatusText(data.config.discordWebhookStatus);
      document.getElementById("seasonYear").value = appConfig.year;
      document.getElementById("seasonName").value = appConfig.season;
      document.getElementById("seasonRegion").value = appConfig.region;
      document.getElementById("seasonPersonalize").checked = appConfig.personalizeEnabled;
      document.getElementById("seasonWeight").value = appConfig.personalizeWeight;
      document.getElementById("seasonWeightValue").textContent = appConfig.personalizeWeight;
    }
    function configFromForm() {
      const form = document.getElementById("settingsForm");
      const yearValue = form.year.value.trim();
      return {
        region: form.region.value,
        season: form.season.value,
        year: yearValue === "AUTO" || !yearValue ? "AUTO" : Number(yearValue),
        rankingLimit: Number(form.rankingLimit.value),
        personalizeEnabled: form.personalizeEnabled.checked,
        personalizeWeight: Number(form.personalizeWeight.value),
        includeWatched: form.includeWatched.checked,
        sequelBoostEnabled: form.sequelBoostEnabled.checked,
        recencyWeight: Number(form.recencyWeight.value),
        discordNotifyEnabled: form.discordNotifyEnabled.checked,
        discordWebhookUrl: form.discordWebhookUrl.value || undefined,
        scoreWeights: {
          averageScore: Number(form["score.averageScore"].value),
          popularity: Number(form["score.popularity"].value),
          favourites: Number(form["score.favourites"].value),
          airingBonus: Number(form["score.airingBonus"].value)
        },
        tasteWeights: {
          genreMatch: Number(form["taste.genreMatch"].value),
          tagMatch: Number(form["taste.tagMatch"].value),
          titleSimilarity: Number(form["taste.titleSimilarity"].value)
        }
      };
    }
    document.getElementById("settingsForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(configFromForm())
        });
        document.getElementById("settingsResult").innerHTML = '<div class="ok">設定を保存しました。</div>';
        toast("設定を保存しました");
        await loadConfig();
        await loadRanking();
      } catch (error) {
        document.getElementById("settingsResult").innerHTML = '<div class="error">' + escapeHtml(error.message) + '</div>';
      }
    });
    document.querySelector('[name="personalizeWeight"]').addEventListener("input", (event) => {
      document.getElementById("personalizeWeightValue").textContent = event.target.value;
    });

    function renderProfile(data) {
      const html = data.imported
        ? '<dl><dt>最終取り込み</dt><dd>' + escapeHtml(data.importedAt || "-") + '</dd><dt>読み込み件数</dt><dd>' + escapeHtml(data.itemCount) + '</dd><dt>シリーズ数</dt><dd>' + escapeHtml(data.seriesCount) + '</dd><dt>上位ジャンル</dt><dd>' + escapeHtml((data.topGenres || []).join(", ") || "-") + '</dd><dt>上位タグ</dt><dd>' + escapeHtml((data.topTags || []).join(", ") || "-") + '</dd></dl>'
        : '<div class="muted">視聴履歴はまだ取り込まれていません。</div>';
      document.getElementById("profileContent").innerHTML = html;
    }
    async function loadProfile() {
      renderProfile(await api("/api/taste-profile"));
    }
    function renderBars(items, labelKey, valueKey = "count") {
      const max = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);
      return items.slice(-12).map((item) => {
        const value = Number(item[valueKey] || 0);
        const width = Math.max(3, Math.round((value / max) * 100));
        return '<div style="margin:6px 0;"><div class="row" style="justify-content:space-between;"><span>' + escapeHtml(item[labelKey] || item.name) + '</span><strong>' + escapeHtml(value.toFixed ? Number(value.toFixed(2)) : value) + '</strong></div><div style="height:10px;background:#e2e8f0;border-radius:6px;"><div style="width:' + width + '%;height:10px;background:#0f766e;border-radius:6px;"></div></div></div>';
      }).join("");
    }
    function renderSeries(items) {
      document.getElementById("seriesTable").innerHTML = '<div class="grid">' + items.slice(0, 50).map((item) => '<article><h3>' + escapeHtml(item.title) + '</h3><dl><dt>視聴回数</dt><dd>' + item.watchCount + '</dd><dt>初回視聴日</dt><dd>' + escapeHtml(item.firstWatchedAt || "-") + '</dd><dt>最終視聴日</dt><dd>' + escapeHtml(item.lastWatchedAt || "-") + '</dd><dt>推定ジャンル</dt><dd>' + escapeHtml(item.estimatedGenres.join(" / ") || "-") + '</dd><dt>推定タグ</dt><dd>' + escapeHtml(item.estimatedTags.join(" / ") || "-") + '</dd><dt>視聴頻度</dt><dd>' + item.frequency + '/日</dd><dt>3話以上</dt><dd>' + (item.watchedThreePlus ? "はい" : "いいえ") + '</dd><dt>10話以上</dt><dd>' + (item.watchedTenPlus ? "はい" : "いいえ") + '</dd></dl></article>').join("") + '</div>';
    }
    async function safeApi(path, fallback) {
      try {
        return await api(path);
      } catch (error) {
        return { ...fallback, error: error.message };
      }
    }
    async function loadAnalytics() {
      const [summary, timeline, taste, impact] = await Promise.all([
        safeApi("/api/analytics/summary", { imported: false, totalItems: 0, seriesCount: 0, estimatedSeriesCount: 0, estimatedMovieCount: 0, topGenres: [], topTags: [] }),
        safeApi("/api/analytics/timeline", { byMonth: [], byWeekday: [], recentCounts: { last30Days: 0, last90Days: 0, lastYear: 0 } }),
        safeApi("/api/analytics/taste-profile", { imported: false, personalizeWeight: appConfig?.personalizeWeight ?? 0.25, explanation: "好みプロファイルはまだ作成されていません。", genreWeights: [], tagWeights: [], likedTitles: [], topFactors: [] }),
        safeApi("/api/analytics/ranking-impact", { items: [] })
      ]);
      document.getElementById("analyticsSummary").innerHTML = [
        ["読み込み", summary.totalItems + "件"],
        ["シリーズ", summary.seriesCount + "件"],
        ["シリーズ推定", summary.estimatedSeriesCount + "件"],
        ["映画推定", summary.estimatedMovieCount + "件"],
        ["初回視聴日", summary.firstWatchedAt || "-"],
        ["最終視聴日", summary.lastWatchedAt || "-"],
        ["直近30日", timeline.recentCounts.last30Days + "件"],
        ["直近90日", timeline.recentCounts.last90Days + "件"],
        ["直近1年", timeline.recentCounts.lastYear + "件"],
        ["よく見るジャンル", summary.topGenres.slice(0, 3).map((item) => item.name).join(" / ") || "-"],
        ["よく見るタグ", summary.topTags.slice(0, 3).map((item) => item.name).join(" / ") || "-"]
      ].map(([label, value]) => '<article><div class="muted">' + escapeHtml(label) + '</div><h3>' + escapeHtml(value) + '</h3></article>').join("");
      document.getElementById("monthlyChart").innerHTML = renderBars(timeline.byMonth, "month");
      document.getElementById("weekdayChart").innerHTML = renderBars(timeline.byWeekday, "weekday");
      document.getElementById("genreChart").innerHTML = renderBars(taste.genreWeights, "name", "weight");
      document.getElementById("tagChart").innerHTML = renderBars(taste.tagWeights, "name", "weight");
      document.getElementById("tasteProfileAnalytics").innerHTML = '<p>' + escapeHtml(taste.explanation) + '</p><dl><dt>上位ジャンル</dt><dd>' + escapeHtml(taste.genreWeights.slice(0, 8).map((item) => item.name + " " + item.weight).join(" / ") || "-") + '</dd><dt>上位タグ</dt><dd>' + escapeHtml(taste.tagWeights.slice(0, 8).map((item) => item.name + " " + item.weight).join(" / ") || "-") + '</dd><dt>好き寄り作品</dt><dd>' + escapeHtml(taste.likedTitles.slice(0, 10).join(" / ") || "-") + '</dd><dt>効いている要素</dt><dd>' + escapeHtml(taste.topFactors.map((item) => item.type + ":" + item.name).join(" / ") || "-") + '</dd></dl>';
      document.getElementById("rankingImpact").innerHTML = '<div class="grid">' + impact.items.map((item) => '<article><h3>#' + item.baseRank + ' → #' + item.personalizedRank + ' ' + escapeHtml(item.title) + '</h3><dl><dt>順位変動</dt><dd>' + (item.rankDelta >= 0 ? "+" : "") + item.rankDelta + '</dd><dt>ベース</dt><dd>' + item.baseScore.toFixed(1) + '</dd><dt>好み</dt><dd>' + item.personalTasteScore.toFixed(1) + '</dd><dt>総合</dt><dd>' + item.recommendationScore.toFixed(1) + '</dd><dt>理由</dt><dd>' + escapeHtml(item.tasteReasons.join(" / ") || "-") + '</dd></dl></article>').join("") + '</div>';
      if (impact.error) {
        document.getElementById("rankingImpact").innerHTML = '<div class="error">ランキングへの影響は一時的に取得できませんでした: ' + escapeHtml(impact.error) + '</div>';
      } else if (!impact.items.length) {
        document.getElementById("rankingImpact").innerHTML = '<div class="muted">ランキングへの影響データはまだありません。</div>';
      }
      await loadSeriesAnalytics();
    }
    async function loadSeriesAnalytics() {
      const params = new URLSearchParams({
        q: document.getElementById("seriesSearch")?.value || "",
        sort: document.getElementById("seriesSort")?.value || "watchCount",
        range: document.getElementById("seriesFilter")?.value || "all"
      });
      const data = await api("/api/analytics/series?" + params.toString());
      renderSeries(data.items || []);
    }
    function seasonPayload() {
      return {
        year: Number(document.getElementById("seasonYear").value),
        season: document.getElementById("seasonName").value,
        region: document.getElementById("seasonRegion").value,
        personalize: document.getElementById("seasonPersonalize").checked,
        personalizeWeight: Number(document.getElementById("seasonWeight").value)
      };
    }
    function fuzzyDate(date) {
      if (!date || !date.year) return "";
      return [date.year, String(date.month || 1).padStart(2, "0"), String(date.day || 1).padStart(2, "0")].join("-");
    }
    function isSequelLike(anime) {
      const title = [anime.title?.native, anime.title?.romaji, anime.title?.english].join(" ");
      return /2|3|4|II|III|IV|Season|シーズン|第.*期|続編/i.test(title);
    }
    function applySeasonFilters(items) {
      const format = document.getElementById("seasonFormatFilter").value.trim().toLowerCase();
      const status = document.getElementById("seasonStatusFilter").value.trim().toLowerCase();
      const genre = document.getElementById("seasonGenreFilter").value.trim().toLowerCase();
      const tag = document.getElementById("seasonTagFilter").value.trim().toLowerCase();
      const studio = document.getElementById("seasonStudioFilter").value.trim().toLowerCase();
      const watched = document.getElementById("seasonWatchedFilter").value;
      const sort = document.getElementById("seasonSort").value;
      return [...items]
        .filter((anime) => !format || String(anime.format || "").toLowerCase().includes(format))
        .filter((anime) => !status || String(anime.status || "").toLowerCase().includes(status))
        .filter((anime) => !genre || (anime.genres || []).some((item) => item.toLowerCase().includes(genre)))
        .filter((anime) => !tag || (anime.tags || []).some((item) => item.name.toLowerCase().includes(tag)))
        .filter((anime) => !studio || (anime.studios || []).some((item) => item.toLowerCase().includes(studio)))
        .filter((anime) => watched === "all" || (watched === "watched" ? anime.isPreviouslyWatched : watched === "unwatched" ? !anime.isPreviouslyWatched : isSequelLike(anime)))
        .sort((a, b) => {
          if (sort === "startDate") return fuzzyDate(b.startDate).localeCompare(fuzzyDate(a.startDate));
          return Number(b[sort] || 0) - Number(a[sort] || 0);
        });
    }
    let seasonRanking = [];
    function renderSeasonRanking(items) {
      const filtered = applySeasonFilters(items);
      document.getElementById("seasonResult").innerHTML = '<div class="muted">' + filtered.length + '件を表示</div><div class="wide-table"><table><thead><tr><th>順位</th><th>タイトル</th><th>シーズン</th><th>状態</th><th>形式</th><th>平均</th><th>人気</th><th>お気に入り</th><th>トレンド</th><th>ベース</th><th>好み</th><th>総合</th><th>ジャンル</th><th>タグ</th><th>スタジオ</th><th>理由</th></tr></thead><tbody>' + filtered.map((anime, index) => '<tr><td>' + (index + 1) + '</td><td><a href="' + anime.siteUrl + '" target="_blank" rel="noreferrer">' + escapeHtml(anime.title.native || anime.title.romaji || anime.title.english || "-") + '</a><div class="muted">' + escapeHtml(anime.title.english || anime.title.romaji || "") + '</div></td><td>' + escapeHtml((anime.seasonYear || "") + " " + (anime.season || "")) + '</td><td>' + escapeHtml(anime.status || "-") + '</td><td>' + escapeHtml(anime.format || "-") + '</td><td>' + escapeHtml(anime.averageScore ?? 60) + '</td><td>' + escapeHtml(anime.popularity) + '</td><td>' + escapeHtml(anime.favourites) + '</td><td>' + escapeHtml(anime.trending ?? 0) + '</td><td>' + Number(anime.baseScore || 0).toFixed(1) + '</td><td>' + Number(anime.personalTasteScore || 0).toFixed(1) + '</td><td>' + Number(anime.recommendationScore || 0).toFixed(1) + '</td><td>' + escapeHtml((anime.genres || []).join(" / ")) + '</td><td>' + escapeHtml((anime.tags || []).slice(0, 5).map((tag) => tag.name).join(" / ")) + '</td><td>' + escapeHtml((anime.studios || []).join(" / ")) + '</td><td>' + escapeHtml((anime.tasteReasons || []).join(" / ")) + '</td></tr>').join("") + '</tbody></table></div>';
    }
    async function fetchSeasonSource() {
      try {
        document.getElementById("seasonResult").innerHTML = '<div class="muted">元データを取得中...</div>';
        const data = await api("/api/seasons/fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(seasonPayload()) });
        document.getElementById("seasonResult").innerHTML = '<div class="ok">元データを保存しました: ' + escapeHtml(data.count) + '件 / ' + escapeHtml(data.savedTo) + '</div>';
        toast("シーズン元データを取得しました");
      } catch (error) {
        document.getElementById("seasonResult").innerHTML = '<div class="error">' + escapeHtml(error.message) + '</div>';
        toast(error.message, false);
      }
    }
    async function rankSeasonSource() {
      try {
        document.getElementById("seasonResult").innerHTML = '<div class="muted">ランキングを計算中...</div>';
        const data = await api("/api/seasons/rank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(seasonPayload()) });
        seasonRanking = data.ranking || [];
        renderSeasonRanking(seasonRanking);
        toast("シーズンランキングを計算しました");
      } catch (error) {
        document.getElementById("seasonResult").innerHTML = '<div class="error">' + escapeHtml(error.message) + '</div>';
        toast(error.message, false);
      }
    }
    function seasonExportUrl(format) {
      const payload = seasonPayload();
      return "/api/seasons/" + payload.year + "/" + payload.season + "/export." + format;
    }
    async function downloadSeasonExport(format) {
      try {
        const response = await fetch(seasonExportUrl(format));
        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: "出力に失敗しました" }));
          throw new Error(data.error || "出力に失敗しました");
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const payload = seasonPayload();
        link.href = url;
        link.download = payload.year + "-" + payload.season + "-ranking." + format;
        link.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        document.getElementById("seasonResult").innerHTML = '<div class="error">' + escapeHtml(error.message) + '</div>';
        toast(error.message, false);
      }
    }
    async function loadRanking() {
      const data = await api("/api/ranking");
      const baseOrder = [...data.ranking].sort((a, b) => b.baseScore - a.baseScore).map((anime) => anime.id);
      document.getElementById("rankingContent").innerHTML = '<section class="grid">' + data.ranking.map((anime, index) => {
        const baseRank = baseOrder.indexOf(anime.id) + 1;
        const movement = baseRank ? baseRank - (index + 1) : 0;
        return '<article><div class="rank">#' + anime.rank + ' / 総合 ' + anime.recommendationScore.toFixed(1) + '</div><h2>' + escapeHtml(anime.displayTitleJa) + '</h2><div class="en">' + escapeHtml(anime.displayTitleEn) + '</div><dl><dt>ベーススコア</dt><dd>' + anime.baseScore.toFixed(1) + '</dd><dt>好みスコア</dt><dd>' + anime.personalTasteScore.toFixed(1) + '</dd><dt>好み反映の強さ</dt><dd>' + data.personalizeWeight + ' / 比較 0.25, 0.35, 0.5</dd><dt>平均スコア</dt><dd>' + escapeHtml(anime.averageScore ?? 60) + '</dd><dt>人気度補正</dt><dd>' + anime.normalizedPopularity.toFixed(1) + '</dd><dt>お気に入り補正</dt><dd>' + anime.normalizedFavourites.toFixed(1) + '</dd><dt>放送中ボーナス</dt><dd>' + anime.airingBonus + '</dd><dt>ベースのみ順位</dt><dd>#' + baseRank + ' (' + (movement >= 0 ? '+' : '') + movement + ')</dd><dt>視聴済み</dt><dd>' + (anime.isPreviouslyWatched ? "はい" : "いいえ") + '</dd></dl>' + (anime.tasteReasons.length ? '<ul class="reasons">' + anime.tasteReasons.map((reason) => '<li>' + escapeHtml(reason) + '</li>').join("") + '</ul>' : '') + '<div class="row"><a class="button" href="' + anime.siteUrl + '" target="_blank" rel="noreferrer">AniList</a><a class="button" href="' + anime.justWatchSearchUrl + '" target="_blank" rel="noreferrer">JustWatch</a><a class="button" href="' + anime.googleSearchUrl + '" target="_blank" rel="noreferrer">Google</a></div></article>';
      }).join("") + "</section>";
    }
    async function startRun(command, label) {
      if (running) return;
      const external = ["notify", "all", "season-notify"].includes(command);
      if (!confirm((external ? "外部送信を含みます。 " : "") + label + "を実行しますか？")) return;
      running = true;
      setRunButtons();
      try {
        await api("/api/run/" + command, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        toast(label + "を開始しました");
        await pollRun();
      } catch (error) {
        toast(error.message, false);
      } finally {
        running = false;
        setRunButtons();
        await loadHistory();
      }
    }
    function setRunButtons() {
      document.getElementById("runButtons").innerHTML = runCommands.map(([command, label]) => '<button ' + (running ? "disabled" : "") + ' data-command="' + command + '">' + label + '</button>').join("");
      document.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => startRun(button.dataset.command, button.textContent)));
    }
    async function pollRun() {
      for (let i = 0; i < 120; i++) {
        const data = await api("/api/run/status");
        if (!data.running) {
          document.getElementById("runStatus").innerHTML = '<div class="ok">完了しました。</div>';
          return;
        }
        document.getElementById("runStatus").innerHTML = '<div class="panel"><strong>実行中:</strong> ' + escapeHtml(data.running.command) + '<br><strong>開始:</strong> ' + escapeHtml(data.running.startedAt) + '</div>';
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    async function loadHistory() {
      const data = await api("/api/run/history");
      const commandLabels = Object.fromEntries(runCommands);
      const statusLabels = { running: "実行中", success: "成功", failed: "失敗" };
      document.getElementById("runHistory").innerHTML = (data.history || []).map((item) => '<article><strong>' + escapeHtml(commandLabels[item.command] || item.command) + '</strong> ' + escapeHtml(statusLabels[item.status] || item.status) + '<dl><dt>開始</dt><dd>' + escapeHtml(item.startedAt) + '</dd><dt>終了</dt><dd>' + escapeHtml(item.endedAt || "-") + '</dd><dt>終了コード</dt><dd>' + escapeHtml(item.exitCode ?? "-") + '</dd><dt>ログ</dt><dd>' + escapeHtml(item.logPath) + '</dd></dl><pre>' + escapeHtml((item.stdout || item.stderr || "").slice(0, 2000)) + '</pre></article>').join("") || '<div class="muted">実行履歴はまだありません。</div>';
    }
    document.getElementById("uploadButton").addEventListener("click", async () => {
      const file = document.getElementById("csvFile").files[0];
      if (!file) return toast("CSVファイルを選択してください", false);
      try {
        const response = await fetch("/api/import/netflix", { method: "POST", headers: { "Content-Type": "text/csv; charset=utf-8" }, body: await file.text() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "取り込みに失敗しました");
        document.getElementById("importResult").innerHTML = '<div class="ok">取り込みました: ' + escapeHtml(data.itemCount) + '件 / ' + escapeHtml(data.seriesCount) + 'シリーズ</div>';
        renderProfile(data);
        await loadRanking();
      } catch (error) {
        toast(error.message, false);
      }
    });
    document.getElementById("rebuildProfile").addEventListener("click", () => startRun("rebuild-profile", "好みプロファイル再生成"));
    document.getElementById("applySeriesFilter").addEventListener("click", loadSeriesAnalytics);
    document.getElementById("testDiscord").addEventListener("click", () => startRun("notify", "Discordテスト通知"));
    document.getElementById("refreshRanking").addEventListener("click", loadRanking);
    document.getElementById("seasonWeight").addEventListener("input", (event) => {
      document.getElementById("seasonWeightValue").textContent = event.target.value;
    });
    document.getElementById("seasonFetch").addEventListener("click", fetchSeasonSource);
    document.getElementById("seasonRank").addEventListener("click", rankSeasonSource);
    document.getElementById("seasonApplyFilter").addEventListener("click", () => renderSeasonRanking(seasonRanking));
    document.getElementById("seasonCsv").addEventListener("click", () => downloadSeasonExport("csv"));
    document.getElementById("seasonJson").addEventListener("click", () => downloadSeasonExport("json"));
    document.getElementById("seasonNotify").addEventListener("click", async () => {
      if (!confirm("Discordに指定シーズンのランキングを通知しますか？")) return;
      try {
        const payload = seasonPayload();
        await api("/api/seasons/" + payload.year + "/" + payload.season + "/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        toast("Discordに通知しました");
      } catch (error) {
        document.getElementById("seasonResult").innerHTML = '<div class="error">' + escapeHtml(error.message) + '</div>';
        toast(error.message, false);
      }
    });
    setRunButtons();
    loadConfig().then(() => Promise.all([loadRanking(), loadProfile(), loadHistory(), loadAnalytics()])).catch((error) => toast(error.message, false));
  </script>
</body>
</html>`);
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: maskWebhookInMessage(error.message) });
});

app.listen(bootConfig.port, () => {
  console.log(`Anime Now MVP is running at http://localhost:${bootConfig.port}`);
});
