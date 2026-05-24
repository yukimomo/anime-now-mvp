import express from "express";
import { getConfig } from "./config.js";
import { parseNetflixViewingHistory, saveViewingHistory } from "./imports/netflix.js";
import { getTopAnime } from "./service.js";
import { buildTasteProfile, loadViewingHistory, topProfileTerms } from "./taste/profile.js";

const config = getConfig();
const app = express();

app.use(express.text({ type: ["text/*", "application/csv"], limit: "5mb" }));

app.get("/api/ranking", async (_req, res, next) => {
  try {
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
    const history = await loadViewingHistory(config.viewingHistoryPath);
    if (!history) {
      res.json({
        imported: false,
        itemCount: 0,
        seriesCount: 0,
        topGenres: [],
        topTags: []
      });
      return;
    }

    const profile = await buildTasteProfile(history);
    res.json({
      imported: true,
      itemCount: history.items.length,
      seriesCount: history.seriesStats.length,
      topGenres: topProfileTerms(profile.genreWeights),
      topTags: topProfileTerms(profile.tagWeights)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/import/netflix", async (req, res, next) => {
  try {
    if (typeof req.body !== "string" || !req.body.trim()) {
      res.status(400).json({ error: "CSV body is required." });
      return;
    }

    const history = parseNetflixViewingHistory(req.body);
    await saveViewingHistory(config.viewingHistoryPath, history);
    const profile = await buildTasteProfile(history);
    res.json({
      imported: true,
      itemCount: history.items.length,
      seriesCount: history.seriesStats.length,
      topGenres: topProfileTerms(profile.genreWeights),
      topTags: topProfileTerms(profile.tagWeights)
    });
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
    header { padding: 24px; background: #18202a; color: white; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0; font-size: 26px; letter-spacing: 0; }
    h2 { margin: 8px 0 4px; font-size: 18px; line-height: 1.3; }
    h3 { margin: 0 0 12px; font-size: 17px; }
    .meta { margin-top: 6px; color: #cbd5e1; }
    .toolbar { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(260px, 360px); gap: 16px; margin-bottom: 18px; }
    .panel { background: white; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
    article { background: white; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; }
    .rank { color: #0f766e; font-weight: 800; font-size: 14px; }
    .en { color: #586477; min-height: 22px; }
    dl { display: grid; grid-template-columns: 104px 1fr; gap: 6px 10px; margin: 14px 0; font-size: 14px; }
    dt { color: #687386; }
    dd { margin: 0; }
    .links, .upload-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    a { color: #0f5f9f; text-decoration: none; }
    a:hover { text-decoration: underline; }
    button, .button { border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 9px; background: #f8fafc; font-size: 14px; color: #0f172a; }
    button { cursor: pointer; }
    .error { color: #b42318; background: #fff1f0; border: 1px solid #ffccc7; padding: 12px; border-radius: 8px; }
    .ok { color: #075e54; background: #edfdf8; border: 1px solid #a7f3d0; padding: 12px; border-radius: 8px; }
    .muted { color: #687386; font-size: 13px; }
    .reasons { padding-left: 18px; margin: 8px 0 0; color: #314155; font-size: 14px; }
    input[type="file"] { max-width: 100%; }
    @media (max-width: 760px) { .toolbar { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>今見るべきアニメ TOP10</h1>
    <div class="meta">${config.year} ${config.season} / region: ${config.region} / personalize: ${config.personalizeEnabled ? "on" : "off"} (${config.personalizeWeight})</div>
  </header>
  <main>
    <section class="toolbar">
      <div class="panel">
        <h3>Netflix CSVインポート</h3>
        <div class="upload-row">
          <input id="csvFile" type="file" accept=".csv,text/csv" />
          <button id="uploadButton" type="button">取り込む</button>
        </div>
        <p class="muted">Netflixから手動ダウンロードした視聴履歴CSVだけをローカル保存します。ログイン情報やCookieは扱いません。</p>
        <div id="importResult"></div>
      </div>
      <div class="panel">
        <h3>好みプロファイル</h3>
        <div id="profile">Loading...</div>
      </div>
    </section>
    <div id="app">Loading...</div>
  </main>
  <script>
    const app = document.getElementById("app");
    const profile = document.getElementById("profile");
    const importResult = document.getElementById("importResult");
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);

    function renderProfile(data) {
      if (!data.imported) {
        profile.innerHTML = '<div class="muted">視聴履歴はまだ取り込まれていません。</div>';
        return;
      }
      profile.innerHTML = \`
        <dl>
          <dt>読み込み</dt><dd>\${escapeHtml(data.itemCount)}件</dd>
          <dt>シリーズ</dt><dd>\${escapeHtml(data.seriesCount)}件</dd>
          <dt>ジャンル</dt><dd>\${escapeHtml((data.topGenres || []).join(", ") || "-")}</dd>
          <dt>タグ</dt><dd>\${escapeHtml((data.topTags || []).join(", ") || "-")}</dd>
        </dl>
      \`;
    }

    function loadProfile() {
      return fetch("/api/taste-profile")
        .then((response) => response.json())
        .then(renderProfile)
        .catch((error) => {
          profile.innerHTML = '<div class="error">好みプロファイル取得に失敗しました: ' + escapeHtml(error.message) + '</div>';
        });
    }

    function loadRanking() {
      return fetch("/api/ranking")
        .then((response) => {
          if (!response.ok) throw new Error("API error");
          return response.json();
        })
        .then((data) => {
          app.innerHTML = '<section class="grid">' + data.ranking.map((anime) => \`
            <article>
              <div class="rank">#\${anime.rank} / 総合 \${anime.recommendationScore.toFixed(1)}</div>
              <h2>\${escapeHtml(anime.displayTitleJa)}</h2>
              <div class="en">\${escapeHtml(anime.displayTitleEn)}</div>
              <dl>
                <dt>base</dt><dd>\${anime.baseScore.toFixed(1)}</dd>
                <dt>好み</dt><dd>\${anime.personalTasteScore.toFixed(1)}</dd>
                <dt>シーズン</dt><dd>\${escapeHtml(anime.seasonYear)} \${escapeHtml(anime.season)}</dd>
                <dt>平均</dt><dd>\${escapeHtml(anime.averageScore ?? 60)}</dd>
                <dt>人気度</dt><dd>\${escapeHtml(anime.popularity)}</dd>
                <dt>話数</dt><dd>\${escapeHtml(anime.episodes ?? "-")}</dd>
                <dt>放送中</dt><dd>\${anime.isAiring ? "はい" : "いいえ"}</dd>
                <dt>視聴済み</dt><dd>\${anime.isPreviouslyWatched ? "はい" : "いいえ"}</dd>
                <dt>ジャンル</dt><dd>\${escapeHtml(anime.genres.join(", "))}</dd>
              </dl>
              \${anime.tasteReasons.length ? '<ul class="reasons">' + anime.tasteReasons.map((reason) => '<li>' + escapeHtml(reason) + '</li>').join("") + '</ul>' : ''}
              <div class="links">
                <a class="button" href="\${anime.siteUrl}" target="_blank" rel="noreferrer">AniList</a>
                <a class="button" href="\${anime.justWatchSearchUrl}" target="_blank" rel="noreferrer">JustWatch</a>
                <a class="button" href="\${anime.googleSearchUrl}" target="_blank" rel="noreferrer">Google</a>
              </div>
            </article>
          \`).join("") + "</section>";
        })
        .catch((error) => {
          app.innerHTML = '<div class="error">ランキング取得に失敗しました: ' + escapeHtml(error.message) + '</div>';
        });
    }

    document.getElementById("uploadButton").addEventListener("click", async () => {
      const file = document.getElementById("csvFile").files[0];
      if (!file) {
        importResult.innerHTML = '<div class="error">CSVファイルを選択してください。</div>';
        return;
      }
      try {
        const csv = await file.text();
        const response = await fetch("/api/import/netflix", {
          method: "POST",
          headers: { "Content-Type": "text/csv; charset=utf-8" },
          body: csv
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Import failed");
        importResult.innerHTML = '<div class="ok">取り込みました: ' + escapeHtml(data.itemCount) + '件 / ' + escapeHtml(data.seriesCount) + 'シリーズ</div>';
        renderProfile(data);
        await loadRanking();
      } catch (error) {
        importResult.innerHTML = '<div class="error">取り込みに失敗しました: ' + escapeHtml(error.message) + '</div>';
      }
    });

    loadProfile();
    loadRanking();
  </script>
</body>
</html>`);
});

app.listen(config.port, () => {
  console.log(`Anime Now MVP is running at http://localhost:${config.port}`);
});
