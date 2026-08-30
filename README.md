# short_study

勉強したいトピックを1文で渡すと、Claude が台本を書き、TTS がナレーションを吹き込み、
Remotion が縦型 9:16 の MP4 に仕上げるパイプラインです。

```bash
npm install
cp .env.example .env      # ANTHROPIC_API_KEY を入れる
npm run generate -- "微分積分の基本を教えて"
# → out/<slug>.mp4
```

## Web アプリ

スマホ前提のモバイルファーストUIです。トピックを入力すると進捗が出て、そのまま再生できます。
**MP4 のレンダリングは経由しません** — `@remotion/player` が同じ React コンポーネントを
ブラウザで直接再生するので、manifest ができた瞬間に見られます。

スマホ向けに効いている3点:

- **フォントを読まない** — `loadFont()` は japanese サブセットの全 unicode range を先読みし、
  121ファイル 5.1MB になります。レンダラーには必要（全グリフが揃う前にフレームを撮ると
  文字が欠ける）ですが、端末には日本語フォントが元から入っています。
  `web/vite.config.ts` の `define: {__STUDY_WEB__}` でビルド時に分岐し、**ブラウザ側は 0 バイト**です
- **タップして再生** — iOS Safari / Android Chrome はユーザー操作なしの音声再生を拒否するので、
  `autoPlay` は使いません。ポスターは冒頭1.2秒地点（0フレーム目は全要素が透明なため）
- **`100dvh` とセーフエリア** — iOS のURLバー開閉で9:16が切れないように

```bash
npm run dev       # → http://localhost:5173/ を開く。Ctrl-C で両方止まる
```

開くURLは **:5173 だけ**です。`npm run dev` のとき :3001 は API 専用になります
（`web/dist` が残っていると :3001 もアプリとして開けてしまい、両方開くと
ナレーションが二重に聞こえるため）。

縦スワイプで切り替わるショート風フィードです。**同時にマウントする Player は常に1つ**で、
画面外の動画はトピックだけのカードに差し替えています（複数の合成を同時に走らせることが
この再生方式の唯一のコストなので）。

最初の1本はタップで再生し、以降はスワイプするだけで自動再生に切り替わります
（ブラウザの自動再生制限は最初のユーザー操作で解除されるため）。

本番相当で動かすなら、ビルドしてサーバー単体で:

```bash
npm run web:build
npm run server    # http://localhost:3001 で web/dist を配信
```

生成が終わると、その動画までフィードが自動でスクロールして再生を始めます
（`.feed-scroll` の `overflow-anchor: none` が要ります。既定のスクロールアンカリングが
新着を先頭に足したときに元の位置へ引き戻してしまうため）。

### API

| | |
|---|---|
| `POST /api/generate` | `{topic, course?, mock?}` → 進捗を NDJSON で流しながら1本作る |
| `GET /api/shorts` | 生成済み一覧 |
| `GET /projects/…` | manifest とナレーション音声（ローカルのみ。デプロイ時は Blob の URL） |

進捗はジョブ表をポーリングさせるのではなく、**接続を開いたまま1行ずつ流します**
（[src/pipeline/run.ts](src/pipeline/run.ts) が各段階を yield し、サーバーと
Vercel Functions が同じものを読む）。デプロイ先にはリクエストより長生きする
プロセスが無いので、ジョブ表を置ける場所がそもそもありません。

引き換えに、生成中にリロードすると進捗の表示を見失います。生成そのものは
完走し、動画はフィードに出ます。

ローカルでは生成を1件ずつ逐次実行します。遅い工程はどちらも外部サービス待ちなので、
並列にしてもレート制限に当たるだけです。**これはデプロイ先では保証できません** —
別々のリクエストが別々のインスタンスに落ちるので、ロックを取る相手がいません。

## デプロイ（Vercel）

```bash
# 1. GitHub に push して Vercel でインポートする（設定は vercel.json が持つ）
# 2. Vercel の Storage タブで Blob ストアを作る
#    → BLOB_READ_WRITE_TOKEN が自動で入る
# 3. 環境変数を入れる
#      ANTHROPIC_API_KEY
#      SHORT_STUDY_DATA_DIR=/tmp
#      EDGE_VOICE / EDGE_RATE / TARGET_SECONDS …（任意）
# 4. Settings → Deployment Protection → Vercel Authentication を有効化
```

**4 は省かないでください。** `/api/generate` にはアプリ側の認証がありません。
URL を知られた時点で他人が `ANTHROPIC_API_KEY` を消費できます。

ローカルとデプロイ先の違いは、動くコードではなく**環境変数2つだけ**です:

| | ローカル | Vercel |
|---|---|---|
| 生成物の書き込み先 | `public/projects/` | `/tmp`（`SHORT_STUDY_DATA_DIR`） |
| 完成品の置き場 | 同じ場所に残る | Vercel Blob に上げる（`BLOB_READ_WRITE_TOKEN` の有無で分岐） |
| manifest の `audioSrc` | `projects/…/scene-01.mp3` | `https://….public.blob.vercel-storage.com/…` |

分岐は [src/storage.ts](src/storage.ts) の1ファイルに閉じています。
`staticFile()` は先頭に `/` を足すだけなので絶対URLを渡すと壊れます。
両方を通すために [assetSrc.ts](src/remotion/assetSrc.ts) を挟んでいます。

### 関数はバンドルしてからデプロイする

`npm run build` は web と**関数の両方**をビルドします（`web:build` + `api:build`）。

Vercel は TypeScript を**ファイル単位でトランスパイルするだけでバンドルしません**。
このパッケージは `"type": "module"` なので、`import { runPipeline } from "../pipeline/run"`
がそのまま残った `.js` を Node が ESM として読み、**ESM は相対 import の拡張子省略を
許さない**ため `ERR_MODULE_NOT_FOUND` で落ちます。ローカルで動くのは tsx と Vite が
拡張子を補完するからで、素の Node だけが厳格です。

そこで [scripts/build-api.mjs](scripts/build-api.mjs) が実装を1ファイルに束ね、
相対 import を消してから配ります:

```
src/functions/generate.ts   実装（typecheck 対象）
  ↓ esbuild --bundle --packages=external
api-build/generate.js       相対 import ゼロ。node_modules は bare のまま
  ↑ export { default } from "../api-build/generate.js"
api/generate.ts             Vercel がルートとして拾う薄い入口（拡張子つき）
```

入口を `api/` にコミットしてあるのは、生成物を `api/` に直接吐くと、
ルート検出がビルドより先に走った場合に 404 になるためです。

バンドル時に whisper 経路はスタブへ差し替えています。デプロイ先では実行され得ないのに、
`import("ffmpeg-static")` がファイルトレースに拾われて 78MB のバイナリを連れてくるからです。

### Vercel でできなくなること

- **MP4 の書き出し**（`npm run render`）— Remotion は Chromium に依存し、関数の
  サイズ枠に収まりません。手元では従来どおり動きます
- **`CAPTION_SOURCE=whisper`** — whisper.cpp のビルドとモデル 1.5GB が乗りません。
  連鎖して `TTS_PROVIDER=elevenlabs` も使えません（README 上部のとおり、
  ElevenLabs は whisper が前提）

そのため whisper と ffmpeg は [whisperCaptions.ts](src/pipeline/whisperCaptions.ts)
に隔離し、動的 import にしてあります。`ffmpeg-static` は 78MB のバイナリを同梱するので、
トップレベル import のままだと使わないのにバンドルへ入ってしまいます。

なお **Blob の URL 自体は公開**です。Vercel Authentication はアプリを保護しますが、
音声と manifest の URL を知っている人は直接取得できます。

## パイプライン

| # | 段階 | 実装 | 出力 |
|---|------|------|------|
| 1 | 台本生成 | [src/pipeline/generateScript.ts](src/pipeline/generateScript.ts) — Claude の structured outputs | `script.json` |
| 2 | ナレーション | [src/pipeline/generateAudio.ts](src/pipeline/generateAudio.ts) — EdgeTTS / ElevenLabs | `scene-NN.mp3` |
| 3 | 字幕タイミング | [src/pipeline/generateCaptions.ts](src/pipeline/generateCaptions.ts) — TTS word boundary / Whisper | `captions.json` |
| 4 | まとめ | [src/pipeline/buildManifest.ts](src/pipeline/buildManifest.ts) | `manifest.json` |
| 5 | 再生 | [src/remotion/](src/remotion/) + [web/](web/) — `@remotion/player` | ブラウザで即再生 |
| 5' | 書き出し（任意） | [src/render.ts](src/render.ts) | `out/<slug>.mp4` |

中間生成物はすべて `public/projects/<slug>/` に残るので、途中から作り直せます。

シーンごとに独立した音声ファイルを持たせ、その実尺から `durationInFrames` を決めています。
Remotion 側は `manifest.json` を1回 fetch するだけで、非同期のメディア調査をしません。

## コマンド

```bash
npm run generate -- "トピック"                # 台本→音声→字幕→MP4 まで一括
npm run generate -- "トピック" --course math  # 科目専用のプロンプトを使う
                                              # japanese-history | math | general
npm run generate -- "トピック" --mock         # Claude を呼ばず組み込み台本を使う（APIキー不要）
npm run generate -- "トピック" --skip-render  # manifest まで作って止める
npm run generate -- "トピック" --slug demo    # 出力フォルダ名を固定
npm run render -- <slug>                      # 既存の manifest から書き出しだけやり直す
npm run generate -- "トピック" --script f.json # 手書きの台本JSONから作る
npm run studio                                # Remotion Studio でプレビュー
npm run typecheck
```

Studio で特定の動画を開くときは props を渡します:

```bash
npm run studio -- --props=public/projects/mock/props.json
```

## 環境変数

`.env.example` を参照。要点だけ:

- `ANTHROPIC_API_KEY` — 台本生成に必須（`--mock` なら不要）
- `TTS_PROVIDER` — `edge`（無料・デフォルト）/ `elevenlabs`
- `CAPTION_SOURCE` — `tts`（デフォルト）/ `whisper`
- `EDGE_VOICE` / `EDGE_RATE` / `EDGE_PITCH` — 声質（後述）
- `TARGET_SECONDS` — 動画の目安の長さ。台本のシーン数に反映（デフォルト 50）

### 声を変える

EdgeTTS の日本語ボイスは2種類だけです。

| `EDGE_VOICE` | |
|---|---|
| `ja-JP-NanamiNeural` | 女性・デフォルト |
| `ja-JP-KeitaNeural` | 男性 |

選択肢が少ないぶん、`EDGE_RATE` / `EDGE_PITCH` / `EDGE_VOLUME`（いずれも相対指定。
`"+10%"` `"-2st"` `"+20Hz"`）で印象を振れます。

```bash
EDGE_VOICE=ja-JP-KeitaNeural EDGE_PITCH=-8% npm run generate -- "トピック"
```

もっと自由に選びたい場合は ElevenLabs に切り替えます（`ELEVENLABS_VOICE_ID` は
ElevenLabs の Voice Library から取得）:

```bash
TTS_PROVIDER=elevenlabs ELEVENLABS_VOICE_ID=xxxx npm run generate -- "トピック"
```

ただし `CAPTION_SOURCE=tts` は EdgeTTS の word boundary に依存しているため、
ElevenLabs と併用するときは `CAPTION_SOURCE=whisper` が必要です。

### Player に渡す props は memo 化する

`<Player>` の `inputProps` / `style` にインラインのオブジェクトを渡すと、
再レンダーのたびに別物と判定され、Remotion が**音声チャンクのスケジュールをやり直します**。
同じ 24ms チャンクが同じ時刻に二重投入され、単語の頭が二度読まれて聞こえます
（「一発」→「い一発」）。

進捗バーのために `frameupdate` で毎フレーム state を更新していたのが引き金でした。
いまは進捗バーを子コンポーネントに切り出し、`inputProps` は `useMemo` で固定しています。

| 6秒間 | 修正前 | 修正後 |
|---|---|---|
| `AudioBufferSourceNode.start()` | 1146回 | 242回（理論値 約250） |
| 同一時刻・同一位置の重複 | 35件 | 0件 |

### CAPTION_SOURCE について

日本語では `tts` を既定にしています。EdgeTTS が単語ごとの発話位置を返すので、
**台本の文字がそのまま、正確なタイミングで**字幕になります。

`whisper`（`@remotion/install-whisper-cpp`）も実装済みで、`TTS_PROVIDER=elevenlabs`
のときはこちらが必要です。ただし日本語では2点注意があります:

1. 音声からの書き起こしなので、固有名詞や専門用語を取り違えることがあります。
2. whisper.cpp が単語単位タイムスタンプ（`--max-len 1 --dtw`）を出すとき、日本語の
   1文字が複数トークンに割れて UTF-8 が壊れます。`generateCaptions.ts` の
   `repairBrokenTokens()` で文字化けは表示されないようにしていますが、その部分の
   文字は復元できません。

初回の `whisper` 実行では whisper.cpp のビルドとモデルのダウンロード（`medium` で約1.5GB）が走ります。

## 教科テーマ

台本の `subject` で、配色・書体・動き・角の形が丸ごと切り替わります。
Claude がトピックから判定します。

| `subject` | 配色 | 書体 | 動き |
|---|---|---|---|
| `history` | セピア・金・赤茶 | 明朝（Noto Serif JP / ヒラギノ明朝） | ゆっくり・角ばった枠 |
| `math` | 藍・シアン | ゴシック | 速め・直線的 |
| `science` | 深緑・ティール | 丸ゴシック（Zen Maru / ヒラギノ丸ゴ） | わずかに跳ねる |
| `language` | 紫・ピンク | ゴシック | やわらかい |
| `general` | 高彩度ポップ（既定） | ゴシック | やわらかい |

実装は [theme.ts](src/remotion/theme.ts) の1ファイルに集約され、各コンポーネントは
`useTheme()` で受け取ります。テーマを増やすときは `themes` に1エントリ足すだけです。

ブラウザ再生では端末の書体（ヒラギノ等）にフォールバックするので、
**教科を増やしてもダウンロード量は増えません**。ウェブフォントを読むのは
`remotion render` のときだけです。

## 台本のスキーマ

```jsonc
{
  "topic": "string",
  "subject": "history | math | science | language | general",
  "scenes": [
    {
      "scene_id": 1,
      "narration": "ナレーション用の話し言葉",
      "visual_type": "hook | point | summary",
      "visual_content": "画面に出す短いテキスト",

      // 任意。図解を出すときだけ付く（下記いずれか）
      "visual": { "kind": "bullets", "items": ["…"] }
      // { "kind": "flow",    "steps": ["…"] }
      // { "kind": "bars",    "unit": "%", "data": [{ "label": "…", "value": 1 }] }
      // { "kind": "formula", "formula": "…", "caption": "…" }
    }
  ]
}
```

`visual_type` は構成上の役割（掴み／要点／まとめ）を表すもので、図解の種類ではありません。
グラフやフローチャートを出し分けるために、任意フィールド `visual` を足しています。
`visual` が無いシーンは見出しのアニメーションだけになります。

- `bullets` / なし → [SceneText.tsx](src/remotion/SceneText.tsx)
- `flow` / `bars` / `formula` / `plot` → [SceneDiagram.tsx](src/remotion/SceneDiagram.tsx)
- 字幕は全シーン共通で [Captions.tsx](src/remotion/Captions.tsx)

### 数学の図解

`formula` は LaTeX を KaTeX で組版します。`visual.lines` に複数行を入れると、
上から順に導出として表示され、最後の行が手描き風の枠で囲まれます
（[@remotion/rough-notation](src/remotion/math/Formula.tsx)）。

`plot` は座標平面と関数グラフを SVG で描きます。`shade` を渡すと曲線の下が
塗られるので、積分の説明に使えます。曲線の式はモデルが生成した文字列なので、
`eval` は使わず [expression.ts](src/remotion/math/expression.ts) の
小さなパーサで評価します。解釈できない式は曲線が出ないだけで、
任意コードは実行されません。

追加コストは **JS +59KB (gzip)**、フォントは実際に使う2ファイル **42KB** だけです。

## 性能

Apple M5 / 10コア、65.5秒（1964フレーム）の動画での実測値です。

| 段階 | 実測 |
|---|---|
| 台本生成（Claude） | 未実測 |
| ナレーション（EdgeTTS） | 2秒 |
| 字幕タイミング | 0.1秒未満 |
| manifest | 0.1秒未満 |
| MP4 レンダリング | 38秒 |

Web アプリの体感待ち時間は「台本生成 + 2秒」です。レンダリングを経由しないため、
動画の長さは待ち時間にほぼ影響しません。

### 背景のレンダリングコスト

[Background.tsx](src/remotion/Background.tsx) の色ムラは当初 `filter: blur(160px)` で
描いていましたが、これが**レンダリング時間の74%**を占めていました（168秒 → 38秒）。
現在は `radial-gradient` で同じ見た目を出しています。フルスクリーンのブラーを
毎フレーム走らせるのは、このプロジェクトで一番高くつく描画です。
