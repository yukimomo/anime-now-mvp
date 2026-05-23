import express from "express";
import { getConfig } from "./config.js";
import { getTopAnime } from "./service.js";

const config = getConfig();
const app = express();

app.get("/api/ranking", async (_req, res, next) => {
  try {
    res.json({
      season: config.season,
      year: config.year,
      region: config.region,
      ranking: await getTopAnime(config)
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
    main { max-width: 1120px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0; font-size: 26px; letter-spacing: 0; }
    .meta { margin-top: 6px; color: #cbd5e1; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
    article { background: white; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; }
    .rank { color: #0f766e; font-weight: 800; font-size: 14px; }
    h2 { margin: 8px 0 4px; font-size: 18px; line-height: 1.3; }
    .en { color: #586477; min-height: 22px; }
    dl { display: grid; grid-template-columns: 88px 1fr; gap: 6px 10px; margin: 14px 0; font-size: 14px; }
    dt { color: #687386; }
    dd { margin: 0; }
    .links { display: flex; flex-wrap: wrap; gap: 8px; }
    a { color: #0f5f9f; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .button { border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 9px; background: #f8fafc; font-size: 14px; }
    .error { color: #b42318; background: #fff1f0; border: 1px solid #ffccc7; padding: 12px; border-radius: 8px; }
  </style>
</head>
<body>
  <header>
    <h1>今見るべきアニメ TOP10</h1>
    <div class="meta">${config.year} ${config.season} / region: ${config.region}</div>
  </header>
  <main>
    <div id="app">Loading...</div>
  </main>
  <script>
    const app = document.getElementById("app");
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);

    fetch("/api/ranking")
      .then((response) => {
        if (!response.ok) throw new Error("API error");
        return response.json();
      })
      .then((data) => {
        app.innerHTML = '<section class="grid">' + data.ranking.map((anime) => \`
          <article>
            <div class="rank">#\${anime.rank} / \${anime.recommendationScore.toFixed(1)}点</div>
            <h2>\${escapeHtml(anime.displayTitleJa)}</h2>
            <div class="en">\${escapeHtml(anime.displayTitleEn)}</div>
            <dl>
              <dt>シーズン</dt><dd>\${escapeHtml(anime.seasonYear)} \${escapeHtml(anime.season)}</dd>
              <dt>平均</dt><dd>\${escapeHtml(anime.averageScore ?? 60)}</dd>
              <dt>人気度</dt><dd>\${escapeHtml(anime.popularity)}</dd>
              <dt>話数</dt><dd>\${escapeHtml(anime.episodes ?? "-")}</dd>
              <dt>放送中</dt><dd>\${anime.isAiring ? "はい" : "いいえ"}</dd>
              <dt>ジャンル</dt><dd>\${escapeHtml(anime.genres.join(", "))}</dd>
            </dl>
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
  </script>
</body>
</html>`);
});

app.listen(config.port, () => {
  console.log(`Anime Now MVP is running at http://localhost:${config.port}`);
});
