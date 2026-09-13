# short_study

勉強したいトピックを1文で渡すと、Claude が台本を書き、TTS がナレーションを吹き込み、
Remotion が縦型 9:16 の 動画 に仕上げるパイプラインです。

```bash
npm install
cp .env.example .env      # ANTHROPIC_API_KEY を入れる
npm run generate -- "微分積分の基本を教えて"
# → out/<slug>.mp4
```

## Web アプリ

スマホ前提のモバイルファーストUIです。**数学専用**で、画面下のタブが3つ:

| タブ | |
|---|---|
| **ホーム** | 学年・分野・単元の3段フィルターと、2段組の一覧。カードを開くと全画面で再生され、**その絞り込みの中で**スワイプできます |
| **ショート** | 全動画をシャッフルして順に流します。タブに入り直すたびに引き直します |
| **生成** | 問題を入力して作る。**声とデザインを選べます**。できた瞬間その動画が全画面で開きます |

フィルターの3階層は [curriculum.ts](src/curriculum.ts) の `MATH_UNITS` そのものです。
単元名が `課程 中分類`、`topics` が小分類。**動画が1本もない分類はチップを出しません** —
9課程・91項目あり、大半は当分空だからです。

**MP4 のレンダリングは経由しません** — `@remotion/player` が同じ React コンポーネントを
ブラウザで直接再生するので、manifest ができた瞬間に見られます。

スマホ向けに効いている3点:

- **フォントを読まない** — `loadFont()` は japanese サブセットの全 unicode range を先読みし、
  121ファイル 5.1MB になります。レンダラーには必要（全グリフが揃う前にフレームを撮ると
  文字が欠ける）ですが、端末には日本語フォントが元から入っています。
  `web/vite.config.ts` の `define: {__STUDY_WEB__}` でビルド時に分岐し、**ブラウザ側は 0 バイト**です
- **タップして再生し、操作イベントを渡す** — Player は無音の `<audio>` タグを先に用意しておき、
  **`play()` にイベントが渡されたときだけ**まとめて解禁します（`playAllAudios()`）。
  渡さないとスマホでは映像だけ再生されて無音になります。スワイプ後の自動再生では、
  そのスワイプのイベントを持ち回って渡しています。デスクトップは制限が無いので表面化しません
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
| `POST /api/generate` | `{topic, voice?, design?}` → 進捗を NDJSON で流しながら1本作る |
| `GET /api/shorts` | 生成済み一覧 |
| `GET /projects/…` | manifest とナレーション音声（ローカルと Railway Volume で配信） |

進捗はジョブ表をポーリングさせるのではなく、**接続を開いたまま1行ずつ流します**
（[src/pipeline/run.ts](src/pipeline/run.ts) が各段階を yield し、サーバーが
そのまま読む）。旧 Vercel 構成にはリクエストより長生きするプロセスが無いので、
ジョブ表を置ける場所がそもそもありません。

引き換えに、生成中にリロードすると進捗の表示を見失います。生成そのものは
完走し、動画はフィードに出ます。

ローカルと Railway の単一インスタンスでは生成を1件ずつ逐次実行します。遅い工程はどちらも
外部サービス待ちなので、並列にしてもレート制限に当たるだけです。

## デプロイ（Railway）

```bash
# 1. GitHub リポジトリから Railway service を Import する（railway.json が Nixpacks を設定する）
# 2. Volume を作成し、この service の /data にマウントする
# 3. service variables を設定する
#      SHORT_STUDY_DATA_DIR=/data
#      ANTHROPIC_API_KEY=...  ← 必須
#      BASIC_AUTH_PASSWORD=...  ← 必須（アプリ全体を保護）
#      BASIC_AUTH_USER=admin  ← 任意
#      EDGE_VOICE / EDGE_RATE …（任意）
# 4. 既存の Vercel Blob を初回だけ取り込む場合は、下記の BLOB_READ_WRITE_TOKEN も一時設定する
#    railway ssh
#    npm run import:blob -- --dry-run
#    npm run import:blob
```

`import:blob` には Vercel Blob の長期 token `BLOB_READ_WRITE_TOKEN` が必要です。既に
`/data/public/projects/<slug>/manifest.json` がある project は飛ばすため、実行をやり直しても
安全です。取り込み後は token を Railway の variables から外せます。

Railway では Blob を通常の保存先に使いません。`/data/public/projects/` に音声と manifest を
残し、manifest の `audioSrc` もローカルと同じ `projects/<slug>/scene-01.mp3` の相対パスのままです。
単体サーバーが `/projects/*` を Volume から配信します。

**Railway service は 1 インスタンスで運用してください。** replica を増やすと Volume は各 replica
に共有で付かず、プロセス内の `serialize()` による生成の直列化も別インスタンス間では効きません。

`BASIC_AUTH_PASSWORD` を設定すると、閲覧・音声配信・生成・削除を含むアプリ全体が HTTP Basic
認証で保護されます。未設定では認証が無効になるため、Railway へのデプロイ時は必ず設定してください。
Railway の healthcheck path を設定している場合は、そのリクエストも 401 になるため、認証に対応した
監視へ切り替えるか healthcheck path を外してください。

### ローカル生成物を push 時に同期する

`public/projects/` は Git 管理しないため、ローカルで作った動画は pre-push で Railway Volume の
`/data/public/projects/` へ送る。最初に一度だけフックを有効化し、ローカルの SSH config に Railway
コンテナを指す alias を作る。既定の alias は `short-study` で、別名は `.env` の `RAILWAY_SSH_HOST` で指定する。

```bash
railway ssh config --alias short-study --identity-file <key>
npm run hooks:install
npm run sync:railway                         # 手動同期
npm run sync:railway -- --dry-run            # 送信対象だけ確認
npm run sync:railway -- --force <slug>       # 意図して削除済み動画を戻す
```

アプリ上で削除した動画はローカルに残る。そのため「Volume に無いものをすべて送る」差分同期では、削除した
動画が次の push で復活してしまう。`.railway-synced.json`（Git 管理外）に一度送った slug と既に Volume
にある slug を記録し、台帳にある slug は Volume から消えていても自動では再送しない。意図して戻す場合だけ
`--force <slug>` を使う。`mock` は同梱サンプルなので対象外である。

project ごとに `tar | ssh` で独立して送信し、送信後は全ファイルの実バイト数を照合する。接続・転送・照合の
失敗は目立つ警告と手動再実行コマンドを出すが、pre-push によって Git push を止めない。

### 旧構成: Vercel + Blob

`vercel.json` と Blob の同期コードは、既存の完成品を Railway へ移すためにも残しています。
Vercel を継続利用する場合の構成は次のとおりです。

ローカルとデプロイ先で動くコードは同じです。分かれるのは置き場所だけで、
それも設定ではなく実行環境から決まります:

| | ローカル | Vercel |
|---|---|---|
| 生成物の書き込み先 | `public/projects/` | `/tmp`（`VERCEL` を見て自動） |
| 完成品の置き場 | 同じ場所に残る | Vercel Blob に上げる（`BLOB_READ_WRITE_TOKEN` の有無で分岐） |
| manifest の `audioSrc` | `projects/…/scene-01.mp3` | `https://….public.blob.vercel-storage.com/…` |

分岐は [src/storage.ts](src/storage.ts) の1ファイルに閉じています。
`staticFile()` は先頭に `/` を足すだけなので絶対URLを渡すと壊れます。
両方を通すために [assetSrc.ts](src/remotion/assetSrc.ts) を挟んでいます。

#### 相対 import には拡張子が要る

Vercel は TypeScript を**ファイル単位でトランスパイルするだけでバンドルしません**。
このパッケージは `"type": "module"` なので、`import { runPipeline } from "../src/pipeline/run"`
がそのまま残った `.js` を Node が ESM として読み、**ESM は相対 import の拡張子省略を
許さない**ため `ERR_MODULE_NOT_FOUND` で落ちます。

そのため `api/` と `src/`（`src/remotion/` を除く）の相対 import はすべて
`.js` 付きで書きます — 参照先が `.ts` でも `.js` と書くのが TypeScript の作法です:

```ts
import { runPipeline } from "../src/pipeline/run.js";   // ← 実体は run.ts
import { coursePrompts } from "./prompts/math.js";      // ← ESM にディレクトリ解決は無い
```

ローカルで拡張子なしでも動くのは tsx と Vite が補完するからで、素の Node だけが厳格です。
つまり**ローカルで動いてもデプロイで落ちる**種類の間違いなので、疑わしいときは
バンドルせずに変換して素の node で読ませると再現できます:

```bash
npx tsc --outDir /tmp/probe --module esnext --moduleResolution bundler \
  --target es2022 --skipLibCheck --noEmit false api/generate.ts
node -e "import('/tmp/probe/api/generate.js')"
```

`src/remotion/` だけ拡張子なしのままなのは、そこが Vite と Remotion からしか
読まれず、`.js` から `.tsx` への解決を新たに当てにしたくないからです。

#### Vercel でできなくなること

- **MP4 の書き出し**（`npm run render`）— Remotion は Chromium に依存し、関数の
  サイズ枠に収まりません。手元では従来どおり動きます
- **`CAPTION_SOURCE=whisper`** — whisper.cpp のビルドとモデル 1.5GB が乗りません。
  連鎖して `TTS_PROVIDER=elevenlabs` も使えません（README 上部のとおり、
  ElevenLabs は whisper が前提）

そのため whisper と ffmpeg は [whisperCaptions.ts](src/pipeline/whisperCaptions.ts)
に隔離し、動的 import にしたうえで、`vercel.json` の `excludeFiles` で
`ffmpeg-static` を関数から外しています。44MB のバイナリを、実行され得ない分岐のために
配ることになるからです。

なお **Blob の URL 自体は公開**です。Vercel Authentication はアプリを保護しますが、
音声と manifest の URL を知っている人は直接取得できます。

#### ローカル生成物を Blob へ同期する（旧構成）

Blob が利用可能だった時期の `sync:blob` と `import:blob` は、移行や復活時のために残している。
Vercel Storage で発行した長期 token をローカル `.env` の `BLOB_READ_WRITE_TOKEN` に設定する
（`BLOB_STORE_ID` の OIDC は Vercel 内だけで使える）。

```bash
npm run sync:blob                 # 手動同期
npm run sync:blob -- --dry-run    # token がなくても初回 upload 対象を確認
```

Blob に既にある `manifest.json` と scene mp3 は pathname ごとに飛ばし、未アップロード分だけを送る。
`mock` も Blob の feed がローカルの一覧と一致するよう同期対象に含める。失敗した project があっても
他を続けるが、最後に非ゼロで終了して push は止める。現在の pre-push はこの旧同期を呼ばない。

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

- `ANTHROPIC_API_KEY` — 台本生成に必須
- `BASIC_AUTH_PASSWORD` — デプロイ時に必須。未設定では HTTP Basic 認証が無効
- `BASIC_AUTH_USER` — HTTP Basic 認証のユーザー名（既定: `admin`）
- `TTS_PROVIDER` — `edge`（無料・デフォルト）/ `elevenlabs`
- `CAPTION_SOURCE` — `tts`（デフォルト）/ `whisper`
- `EDGE_VOICE` / `EDGE_RATE` / `EDGE_PITCH` — 声質（後述）
- 複数設問は「問題文 → (1)の番号付き方針 → 各項目の解説・答え → (2)の方針 → 解説・答え → … → まとめ」で構成する。解説タイトルには直前の方針の番号と文言をそのまま使う。
- シーン数・ナレーション文字数・動画長の上限は設けない。再生時間は全シーンのTTS実長と余白の合計で決まる。旧 `TARGET_SECONDS` は参照しない。API応答は64,000 tokensまで確保し、途中終了した台本は採用しない。Vercelの関数実行期限300秒は動画長とは別の実行環境の制約として残る。

### 声を変える

**使えるのは14種類**です。一覧は [voices.ts](src/voices.ts)、生成画面から選べます。

| | |
|---|---|
| `ja-JP-NanamiNeural` / `ja-JP-KeitaNeural` | 日本語ネイティブ。EdgeTTS の `getVoices()` が返す日本語はこの2件だけ |
| 多言語ボイス12種 | 別ロケール（en-US, de-DE, fr-FR, it-IT, ko-KR, pt-BR, en-AU）だが**日本語を喋る**。全件で語境界が返ることを実測済み |

Azure のカタログには Aoi・Daichi・Mayu・Naoki・Shiori・DragonHD・MAI-Voice などの
日本語ボイスが並んでいますが、**Edge の無料エンドポイントは全部拒否します**
（`Stream closed before the synthesis completed`）。使うには Azure Speech の
APIキーと別クライアントが要ります。

多言語ボイスは日本語向けに作られたものではないので、訛りの有無は好みで判断してください。

**生成画面には名前ではなく印象を出します**（「明るい女性」「低く落ち着いた男性」）。
`ナナミ` や `セラフィナ` という名前は、どれを選べばいいかを何も教えてくれないからです。
文言は [`web/src/samples/`](web/src/samples) のサンプルを実測して付けています —
基本周波数の中央値、抑揚の幅（F0 の 10–90 パーセンタイル）、同じ文を読み切る秒数の3つ。

サンプルは全ボイスが同じ挨拶（`SAMPLE_TEXT`）を読んだもので、選ぶと再生され、▶ で聞き直せます。
`VOICES` や `EDGE_RATE` などの既定値を変えたときは作り直してください:

```bash
npx tsx scripts/voice-samples.ts
```

選択肢が少ないぶん、`EDGE_RATE` / `EDGE_PITCH` / `EDGE_VOLUME`（いずれも相対指定。
`"+10%"` `"-2st"` `"+20Hz"`）で印象を振れます。

```bash
EDGE_VOICE=ja-JP-KeitaNeural EDGE_PITCH=-8% npm run generate -- "トピック"
```

生成画面で選んだ声はリクエストごとに渡され、`EDGE_VOICE` は既定値として残ります。

### 動画の見た目

動画・サムネイル・Web のカードは、[theme.ts](src/remotion/theme.ts) の
`themeOf()` が返す whiteboard に統一しています。デザイン選択はありません。
既存 manifest の `design` や `subject` に関係なく同じテーマで描画し、
保存済みデータの書き換え・再生成は不要です。

字幕には明るい `plate` と薄い `textShadow`、背景には濃さを抑えた `wash` を使います。
`subject` はナレーション・字幕の表記処理に引き続き使います。

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

日本語では `tts` を既定にしています。新しい `narration` は字幕用文章と読み用文章を
`<<<TTS_READING>>>` の行で区切ります。TTSには読み用だけを渡し、字幕用の `$…$` を
1原子として差分で対応付け、EdgeTTSのword boundaryから時刻を付けます。
数式全体は1トークンとして強調され、一致した散文は元のトークン時刻を保ちます。

読み用の指数は実測で次のように振る舞いました（ja-JP-NanamiNeural、`[]` は語の区切り）:

| ナレーションの書き方 | 語の区切り | |
|---|---|---|
| `xの2乗` | `x \| の \| 2 \| 乗` | ✗ 単独の「乗」が「の」と読まれる |
| `x二乗` | `x \| 二 \| 乗` | ✗ 同上 |
| `xにじょう` | `x \| に \| じょう` | ✗ 「の」を省くと割れる |
| `xのにじょう` | `x \| の \| にじょう` | ○ ひらがなは読みが一意 |

[math.ts](src/prompts/math.ts) は読み用の実測上の注意を指示します。
[captionAlignment.ts](src/pipeline/captionAlignment.ts) はカナの復元辞書を使いません。
字幕と読みの対応が取れなかった発話は、却下せず字幕から落とします。時刻の裏付けが
ない字幕を出すより、その語を表示しないほうが破綻が小さいためです。
字幕側にだけ文章が増える場合は、この3検査で必ず検出できるわけではありません。

区切りのない旧台本は読み用だけとして扱い、保存済みmanifestの字幕はそのまま再生します。
新形式にはEdgeTTSが必要です。旧形式では `whisper`（`@remotion/install-whisper-cpp`）も
使え、`TTS_PROVIDER=elevenlabs` のときはこちらが必要です。ただし日本語では2点注意があります:

1. 音声からの書き起こしなので、固有名詞や専門用語を取り違えることがあります。
2. whisper.cpp が単語単位タイムスタンプ（`--max-len 1 --dtw`）を出すとき、日本語の
   1文字が複数トークンに割れて UTF-8 が壊れます。`generateCaptions.ts` の
   `repairBrokenTokens()` で文字化けは表示されないようにしていますが、その部分の
   文字は復元できません。

初回の `whisper` 実行では whisper.cpp のビルドとモデルのダウンロード（`medium` で約1.5GB）が走ります。

## 教科テーマ

台本の `subject` で、配色・書体・動き・角の形が丸ごと切り替わります。
**いまは数学専用なので `math` に固定**です。他の科目のプロンプトは一旦外してあり
（git 履歴に残っています）、テーマ自体は過去に生成した動画のために残しています。

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

### 単元は1つの文字列に2階層を載せている

`unit` は `中分類｜小分類` の形でモデルに書かせ、[generateScript.ts](src/pipeline/generateScript.ts)
が分割します。フィールドを分けたかったのですが、**1つ足しただけで structured outputs の
「compiled grammar is too large」に当たりました** — この schema は既に限界ぎりぎりで、
`unit` が enum をやめて自由記述になっているのも同じ理由です。

表示されるのは縦棒の左だけ。右はホームの絞り込みにしか使わず、
カリキュラムに無い名前は表示せず捨てます。

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
