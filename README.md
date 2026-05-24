# Anime Now MVP

無料で作れる範囲を優先した、個人用のアニメ推薦・配信確認・Discord通知アプリです。

AniList API から今期アニメを取得し、平均スコア、人気度、お気に入り数、放送中かどうかを使ってランキングを作ります。Netflix 視聴履歴 CSV を手動でインポートすると、ローカルに保存した視聴傾向を使って「自分が好きそうな今期アニメ」を上位に出せます。

## 機能

- AniList GraphQL API から今期アニメを取得
- TOP10 ランキングを Web UI / CLI で表示
- JustWatch 検索 URL と Google 検索 URL を表示
- Discord Webhook に TOP10 を通知
- SQLite に通知履歴とランキングスナップショットを保存
- Netflix 視聴履歴 CSV をローカルインポート
- genres / tags / 視聴回数 / 最近見た作品から personalTasteScore を計算

## セットアップ

Node.js 24 以上と npm をインストールしてから実行します。

```bash
npm install
cp .env.example .env
```

PowerShell の場合は `Copy-Item .env.example .env` でも作成できます。

`.env` を編集します。

```env
DISCORD_WEBHOOK_URL=
REGION=JP
SEASON=SPRING
YEAR=2026
PORT=3000
PERSONALIZE_ENABLED=true
PERSONALIZE_WEIGHT=0.25
VIEWING_HISTORY_PATH=./data/viewing-history.json
```

`SEASON` は `WINTER`, `SPRING`, `SUMMER`, `FALL` のいずれかです。未指定の場合は現在月から推定します。

## 使い方

Web UI を起動します。

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

PowerShell で `npm` や `node` が見つからない場合は、一時的に PATH を補正してから実行します。

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npm run dev
```

同梱の起動スクリプトでも起動できます。


```powershell
.\start-dev.ps1
```

ランキングを取得して SQLite にスナップショット保存します。

```bash
npm run fetch
```

Discord に TOP10 を通知します。

```bash
npm run notify
```

## Netflix 視聴履歴 CSV

Netflix に自動ログインしません。ID、パスワード、Cookie は扱いません。スクレイピングもしません。

Netflix の公式画面から手動で CSV をダウンロードしてください。

1. Netflix の Account を開く
2. Profile を選ぶ
3. Viewing activity を開く
4. Download all で CSV を保存

CLI でインポートします。

```bash
npm run import:netflix -- ./data/netflix-viewing-history.csv
```

Web UI からも CSV を選んで取り込めます。取り込んだ結果は `VIEWING_HISTORY_PATH` に保存されます。デフォルトは `./data/viewing-history.json` です。

CSV の列名は `Title, Date` と `タイトル, 日付` の両方に対応します。エピソード表記はできるだけシリーズ名に正規化します。

```text
鬼滅の刃: シーズン1: 第1話 -> 鬼滅の刃
```

## ランキング計算

まず従来式で `baseScore` を計算します。

```text
baseScore =
  averageScore * 0.5
  + normalizedPopularity * 0.3
  + normalizedFavourites * 0.2
  + airingBonus
```

`averageScore` が `null` の場合は 60 点として扱います。`popularity` と `favourites` は取得対象内の最大値を 100 として正規化します。`airingBonus` は放送中の作品に 5 点を加算します。

Netflix 視聴履歴があり、`PERSONALIZE_ENABLED=true` の場合は `personalTasteScore` を加味します。

```text
recommendationScore =
  baseScore * (1 - PERSONALIZE_WEIGHT)
  + personalTasteScore * PERSONALIZE_WEIGHT
```

デフォルトでは `PERSONALIZE_WEIGHT=0.25` なので、`baseScore * 0.75 + personalTasteScore * 0.25` です。

`PERSONALIZE_ENABLED=false`、または視聴履歴がない場合は従来式の `baseScore` がそのまま `recommendationScore` になります。

## personalTasteScore

視聴履歴から好みプロファイルを作ります。

- 同一シリーズの視聴回数を集計
- 最近見た作品ほど強めに評価
- 3話以上は好き寄り、10話以上は強い好みとして扱う
- AniList で視聴済み作品を検索し、genres / tags の重みを作る

今期アニメには以下で 0〜100 点の `personalTasteScore` を付けます。

```text
personalTasteScore =
  genreMatchScore * 0.4
  + tagMatchScore * 0.4
  + titleSimilarityScore * 0.2
```

ランキングには `baseScore`、`personalTasteScore`、`recommendationScore`、`tasteReasons`、視聴済み表示が出ます。Discord 通知にも短い理由を追加します。

## プライバシー

- Netflix 視聴履歴 CSV はユーザーが手動で取得します
- Netflix の ID / パスワード / Cookie は保存しません
- スクレイピングしません
- 視聴履歴はローカルの `data/viewing-history.json` にだけ保存します
- `data/viewing-history.json` と CSV は `.gitignore` 対象です
- Discord 通知には視聴履歴の具体的なタイトルを出しすぎないよう、理由は短くしています

## よくあるエラー

`npm` が見つからない:

新しいターミナルを開き直すか、PowerShell で `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` を実行してください。

CSV の列が見つからない:

`Title` / `Date` または `タイトル` / `日付` の列があるか確認してください。

好みスコアが 0 のまま:

`PERSONALIZE_ENABLED=true` になっているか、`VIEWING_HISTORY_PATH` に `viewing-history.json` が作成されているか確認してください。

AniList 取得に失敗する:

ネットワーク状態を確認してください。エラー時も視聴履歴データは外部送信されません。

## テスト

```bash
npm test
```

確認していること:

- Netflix CSV を読み込める
- 日本語列名 / 英語列名の CSV を読める
- シリーズ名正規化ができる
- 視聴回数を集計できる
- personalTasteScore が計算できる
- `PERSONALIZE_ENABLED=false` 相当なら従来式になる
