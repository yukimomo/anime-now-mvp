# Anime Now MVP

無料で作れる範囲を優先した、個人用のアニメ推薦・配信確認・Discord通知アプリです。

AniList API から今期アニメを取得し、平均スコア、人気度、フォロワー相当の `favourites` を使って独自ランキングを作ります。配信サービス情報は初期実装ではスクレイピングせず、作品ごとの JustWatch 検索 URL と Google 検索 URL を表示します。

## 機能

- AniList GraphQL API から今期アニメを取得
- 独自スコアで TOP10 を作成
- Web UI でランキング、タイトル、スコア、人気度、話数、ジャンル、各種リンクを表示
- Discord Webhook に TOP10 を通知
- SQLite に通知履歴とランキングスナップショットを保存
- 同じ TOP10 内容は再通知しない

## セットアップ

Node.js と npm をインストールしてから実行します。

```bash
npm install
cp .env.example .env
```

PowerShell の場合は `Copy-Item .env.example .env` でも作成できます。
Node.js を入れた直後のターミナルで `npm` や `node` が見つからない場合は、新しいターミナルを開き直してください。PowerShell で一時的に直す場合は `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` を実行します。

`.env` を編集します。

```env
DISCORD_WEBHOOK_URL=
REGION=JP
SEASON=SPRING
YEAR=2026
PORT=3000
```

`SEASON` は `WINTER`, `SPRING`, `SUMMER`, `FALL` のいずれかです。未指定の場合は現在月から推定します。`YEAR` 未指定の場合は現在年を使います。

## 使い方

Web UI を起動します。

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

ランキングを取得して SQLite にスナップショット保存します。

```bash
npm run fetch
```

Discord に TOP10 を通知します。

```bash
npm run notify
```

`npm run notify` は `DISCORD_WEBHOOK_URL` が必要です。同じシーズン・年で TOP10 の内容が同一の場合、Discord 投稿はスキップされます。

## ランキング計算

```text
score =
  averageScore * 0.5
  + normalizedPopularity * 0.3
  + normalizedFavourites * 0.2
  + airingBonus
```

`averageScore` が `null` の場合は 60 点として扱います。`popularity` と `favourites` は取得対象内の最大値を 100 として正規化します。`airingBonus` は放送中を表す `RELEASING` の作品に 5 点を加算します。

## ディレクトリ構成

```text
.
├── src
│   ├── anilist.ts
│   ├── cli
│   │   ├── fetch.ts
│   │   └── notify.ts
│   ├── config.ts
│   ├── db.ts
│   ├── discord.ts
│   ├── links.ts
│   ├── ranking.ts
│   ├── server.ts
│   ├── service.ts
│   └── types.ts
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## API と安全方針

- AniList API は 1 回の GraphQL クエリで最大 50 件を取得します。
- JustWatch の非公式 API やスクレイピングは使っていません。
- API キーが必要なサービスは MVP の必須要件にしていません。
- Discord 通知は Webhook URL が設定されたときだけ実行します。
- SQLite は Node.js 組み込みの `node:sqlite` を使います。

## 次の拡張案

- TMDB API で watch provider 情報を補完
- ユーザーの好みを SQLite に保存してパーソナライズ
- LINE 通知対応
- GitHub Actions や cron で毎週自動実行
- 視聴済み/見たいリスト管理
