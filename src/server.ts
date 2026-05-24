import express from "express";
import { configForClient, loadAppConfig, readStoredConfig, validateConfig, writeStoredConfig } from "./appConfig.js";
import { parseNetflixViewingHistory, saveViewingHistory } from "./imports/netflix.js";
import { getTopAnime } from "./service.js";
import { clearTopAnimeCache } from "./service.js";
import { buildTasteProfile, loadViewingHistory, topProfileTerms } from "./taste/profile.js";
import { getRunHistory, getRunningStatus, startRun } from "./runConsole.js";

const bootConfig = await loadAppConfig();
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: ["text/*", "application/csv"], limit: "5mb" }));

async function currentConfig() {
  return loadAppConfig();
}

app.get("/api/config", async (_req, res, next) => {
  try {
    const config = await currentConfig();
    res.json({
      config: configForClient(config),
      stored: await readStoredConfig(),
      validationErrors: validateConfig(await readStoredConfig())
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
      res.status(400).json({ error: "CSV body is required." });
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
  </style>
</head>
<body>
  <header>
    <h1>Anime Now MVP</h1>
    <div id="headerMeta" class="meta">Loading...</div>
    <nav>
      <button data-view="ranking" class="active">Ranking</button>
      <button data-view="settings">Settings</button>
      <button data-view="run">Run Console</button>
      <button data-view="profile">Import History / Taste Profile</button>
    </nav>
  </header>
  <main>
    <section id="ranking" class="view active">
      <div class="panel row">
        <button id="refreshRanking">ランキング更新</button>
        <span class="muted">weight比較: 0.25 / 0.35 / 0.5</span>
      </div>
      <div id="rankingContent">Loading...</div>
    </section>

    <section id="settings" class="view">
      <div class="panel">
        <h2>Settings</h2>
        <form id="settingsForm">
          <h3>基本設定</h3>
          <div class="form-grid">
            <label>region<select name="region"><option>JP</option><option>US</option><option>KR</option><option>GB</option></select></label>
            <label>season<select name="season"><option>AUTO</option><option>SPRING</option><option>SUMMER</option><option>FALL</option><option>WINTER</option></select></label>
            <label>year<input name="year" placeholder="AUTO or 2026" /></label>
            <label>ranking limit<select name="rankingLimit"><option>10</option><option>20</option><option>30</option><option>50</option></select></label>
          </div>
          <h3>好み反映設定</h3>
          <div class="form-grid">
            <label class="row"><input type="checkbox" name="personalizeEnabled" /> PERSONALIZE_ENABLED</label>
            <label>PERSONALIZE_WEIGHT <span id="personalizeWeightValue"></span><input type="range" name="personalizeWeight" min="0" max="0.6" step="0.01" /></label>
            <label class="row"><input type="checkbox" name="includeWatched" /> 視聴済み作品を含める</label>
            <label class="row"><input type="checkbox" name="sequelBoostEnabled" /> 続編を優先する</label>
            <label>最近度重視 <input type="range" name="recencyWeight" min="0" max="1" step="0.05" /></label>
          </div>
          <h3>スコア重み設定</h3>
          <div class="form-grid">
            <label>averageScore weight<input name="score.averageScore" type="number" step="0.05" min="0" max="1" /></label>
            <label>popularity weight<input name="score.popularity" type="number" step="0.05" min="0" max="1" /></label>
            <label>favourites weight<input name="score.favourites" type="number" step="0.05" min="0" max="1" /></label>
            <label>airingBonus<input name="score.airingBonus" type="number" step="0.5" min="0" max="20" /></label>
            <label>genreMatch weight<input name="taste.genreMatch" type="number" step="0.05" min="0" max="1" /></label>
            <label>tagMatch weight<input name="taste.tagMatch" type="number" step="0.05" min="0" max="1" /></label>
            <label>titleSimilarity weight<input name="taste.titleSimilarity" type="number" step="0.05" min="0" max="1" /></label>
          </div>
          <h3>Discord設定</h3>
          <div class="form-grid">
            <label class="row"><input type="checkbox" name="discordNotifyEnabled" /> Discord通知</label>
            <label>Webhook URL<input name="discordWebhookUrl" type="password" autocomplete="off" placeholder="未入力なら既存値を維持" /></label>
            <label>Webhook status<input id="webhookStatus" readonly /></label>
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
        <h2>Run Console</h2>
        <div class="row" id="runButtons"></div>
        <div id="runStatus" style="margin-top: 12px;"></div>
      </div>
      <div class="panel">
        <h3>直近の実行履歴</h3>
        <div id="runHistory">Loading...</div>
      </div>
    </section>

    <section id="profile" class="view">
      <div class="panel">
        <h2>Import History / Taste Profile</h2>
        <div class="row">
          <input id="csvFile" type="file" accept=".csv,text/csv" />
          <button id="uploadButton" type="button">CSV取り込み</button>
          <button id="rebuildProfile" type="button">好みプロファイル再生成</button>
        </div>
        <p class="muted">Netflixから手動ダウンロードした視聴履歴CSVだけをローカル保存します。ログイン情報やCookieは扱いません。</p>
        <div id="importResult"></div>
      </div>
      <div class="panel">
        <h3>好みプロファイル</h3>
        <div id="profileContent">Loading...</div>
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
      if (!response.ok) throw new Error((data.errors || [data.error || "API error"]).join(" "));
      return data;
    }
    async function loadConfig() {
      const data = await api("/api/config");
      appConfig = data.config;
      document.getElementById("headerMeta").textContent = appConfig.year + " " + appConfig.season + " / " + appConfig.region + " / personalize: " + (appConfig.personalizeEnabled ? "on" : "off") + " (" + appConfig.personalizeWeight + ")";
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
      document.getElementById("webhookStatus").value = data.config.discordWebhookStatus;
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
        document.getElementById("settingsResult").innerHTML = '<div class="ok">保存しました。</div>';
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
      const html = data.imported ? '<dl><dt>最終取り込み</dt><dd>' + escapeHtml(data.importedAt || "-") + '</dd><dt>読み込み件数</dt><dd>' + escapeHtml(data.itemCount) + '</dd><dt>シリーズ数</dt><dd>' + escapeHtml(data.seriesCount) + '</dd><dt>上位ジャンル</dt><dd>' + escapeHtml((data.topGenres || []).join(", ") || "-") + '</dd><dt>上位タグ</dt><dd>' + escapeHtml((data.topTags || []).join(", ") || "-") + '</dd></dl>' : '<div class="muted">視聴履歴はまだ取り込まれていません。</div>';
      document.getElementById("profileContent").innerHTML = html;
    }
    async function loadProfile() {
      renderProfile(await api("/api/taste-profile"));
    }
    async function loadRanking() {
      const data = await api("/api/ranking");
      const baseOrder = [...data.ranking].sort((a, b) => b.baseScore - a.baseScore).map((anime) => anime.id);
      document.getElementById("rankingContent").innerHTML = '<section class="grid">' + data.ranking.map((anime, index) => {
        const baseRank = baseOrder.indexOf(anime.id) + 1;
        const movement = baseRank ? baseRank - (index + 1) : 0;
        return '<article><div class="rank">#' + anime.rank + ' / 総合 ' + anime.recommendationScore.toFixed(1) + '</div><h2>' + escapeHtml(anime.displayTitleJa) + '</h2><div class="en">' + escapeHtml(anime.displayTitleEn) + '</div><dl><dt>baseScore</dt><dd>' + anime.baseScore.toFixed(1) + '</dd><dt>personalTaste</dt><dd>' + anime.personalTasteScore.toFixed(1) + '</dd><dt>personalize weight</dt><dd>' + data.personalizeWeight + ' / compare 0.25, 0.35, 0.5</dd><dt>averageScore</dt><dd>' + escapeHtml(anime.averageScore ?? 60) + '</dd><dt>normalizedPopularity</dt><dd>' + anime.normalizedPopularity.toFixed(1) + '</dd><dt>normalizedFavourites</dt><dd>' + anime.normalizedFavourites.toFixed(1) + '</dd><dt>airingBonus</dt><dd>' + anime.airingBonus + '</dd><dt>baseのみ順位</dt><dd>#' + baseRank + ' (' + (movement >= 0 ? '+' : '') + movement + ')</dd><dt>視聴済み</dt><dd>' + (anime.isPreviouslyWatched ? "はい" : "いいえ") + '</dd></dl>' + (anime.tasteReasons.length ? '<ul class="reasons">' + anime.tasteReasons.map((reason) => '<li>' + escapeHtml(reason) + '</li>').join("") + '</ul>' : '') + '<div class="row"><a class="button" href="' + anime.siteUrl + '" target="_blank" rel="noreferrer">AniList</a><a class="button" href="' + anime.justWatchSearchUrl + '" target="_blank" rel="noreferrer">JustWatch</a><a class="button" href="' + anime.googleSearchUrl + '" target="_blank" rel="noreferrer">Google</a></div></article>';
      }).join("") + "</section>";
    }
    async function startRun(command, label) {
      if (running) return;
      const external = ["notify", "all"].includes(command);
      if (!confirm((external ? "外部送信を含みます。 " : "") + label + " を実行しますか？")) return;
      running = true;
      setRunButtons();
      try {
        await api("/api/run/" + command, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        toast(label + " を開始しました");
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
      document.getElementById("runHistory").innerHTML = (data.history || []).map((item) => '<article><strong>' + escapeHtml(item.command) + '</strong> ' + escapeHtml(item.status) + '<dl><dt>開始</dt><dd>' + escapeHtml(item.startedAt) + '</dd><dt>終了</dt><dd>' + escapeHtml(item.endedAt || "-") + '</dd><dt>exit code</dt><dd>' + escapeHtml(item.exitCode ?? "-") + '</dd><dt>log</dt><dd>' + escapeHtml(item.logPath) + '</dd></dl><pre>' + escapeHtml((item.stdout || item.stderr || "").slice(0, 2000)) + '</pre></article>').join("") || '<div class="muted">実行履歴はまだありません。</div>';
    }
    document.getElementById("uploadButton").addEventListener("click", async () => {
      const file = document.getElementById("csvFile").files[0];
      if (!file) return toast("CSVファイルを選択してください", false);
      try {
        const response = await fetch("/api/import/netflix", { method: "POST", headers: { "Content-Type": "text/csv; charset=utf-8" }, body: await file.text() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Import failed");
        document.getElementById("importResult").innerHTML = '<div class="ok">取り込みました: ' + escapeHtml(data.itemCount) + '件 / ' + escapeHtml(data.seriesCount) + 'シリーズ</div>';
        renderProfile(data);
        await loadRanking();
      } catch (error) {
        toast(error.message, false);
      }
    });
    document.getElementById("rebuildProfile").addEventListener("click", () => startRun("rebuild-profile", "好みプロファイル再生成"));
    document.getElementById("testDiscord").addEventListener("click", () => startRun("notify", "Discordテスト通知"));
    document.getElementById("refreshRanking").addEventListener("click", loadRanking);
    setRunButtons();
    loadConfig().then(() => Promise.all([loadRanking(), loadProfile(), loadHistory()])).catch((error) => toast(error.message, false));
  </script>
</body>
</html>`);
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: error.message.replace(/https:\/\/discord(?:app)?\.com\/api\/webhooks\/\S+/g, "[masked webhook]") });
});

app.listen(bootConfig.port, () => {
  console.log(`Anime Now MVP is running at http://localhost:${bootConfig.port}`);
});
