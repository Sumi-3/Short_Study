# ShortCut

数学の問題を入力すると、解説のショート動画を自動で作るアプリです。
Claude が台本を書き、TTS がナレーションを吹き込み、Remotion が縦型 9:16 に組み立てます。

**clone した時点で 37 本の動画が入っています。** 視聴するだけなら API キーは要りません。

---

## 必要なもの

| | |
|---|---|
| **Node.js 22 以上** | 24 でも動作を確認しています |
| **Anthropic の API キー** | **動画を新しく作るときだけ** 必要です。視聴するだけなら不要 |

Node.js が入っているかは、ターミナル（Windows なら PowerShell）で確認できます。

```
node -v
```

`v22.x.x` 以上が表示されれば大丈夫です。「コマンドが見つかりません」と出る場合は
[nodejs.org](https://nodejs.org/) から LTS 版を入れてください。

---

## macOS

```bash
git clone https://github.com/Sumi-3/Short_Study.git
cd Short_Study
npm install
npm run dev
```

ブラウザで **http://localhost:5173/** を開きます。

---

## Windows

PowerShell で実行します。コマンドは macOS と同じです。

```powershell
git clone https://github.com/Sumi-3/Short_Study.git
cd Short_Study
npm install
npm run dev
```

ブラウザで **http://localhost:5173/** を開きます。

> `npm install` のあとに `npm : このシステムではスクリプトの実行が無効になっているため…` と
> 出る場合は、PowerShell の実行ポリシーが原因です。管理者権限の PowerShell で一度だけ
> 次を実行してください。
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```

---

## 起動したあと

開く URL は **:5173 だけ**です。`npm run dev` は :3001 にも API サーバを立てますが、
そちらはブラウザで開く必要はありません。**Ctrl-C で両方止まります。**

スマホ向けの縦長 UI なので、ブラウザの開発者ツールでスマホ表示にすると本来の見え方になります。
画面下のタブは3つです。

| タブ | |
|---|---|
| **ホーム** | 学年・分野・単元で絞り込む一覧。カードを開くと全画面で再生されます |
| **ショート** | 全動画をシャッフルして順に流します |
| **生成** | 問題を入力して新しく作ります（API キーが必要） |

最初の1本はタップで再生してください。以降はスワイプするだけで自動再生に切り替わります
（ブラウザの自動再生制限が、最初のユーザー操作で解除されるためです）。

---

## 動画を新しく作る

Anthropic の API キーが要ります。

**1. `.env` を用意する**

macOS:

```bash
cp .env.example .env
```

Windows (PowerShell):

```powershell
Copy-Item .env.example .env
```

**2. `.env` を開いて、1行目のキーを書き換える**

```
ANTHROPIC_API_KEY=sk-ant-...
```

他の項目はすべて任意です。初期値のままで動きます。

**3. サーバを立て直す**（`.env` は起動時にしか読まれません）

Ctrl-C で止めて、もう一度 `npm run dev` を実行してください。

あとは「生成」タブから問題を入力します。1〜2分で完成し、その動画が自動で開きます。
コマンドラインから作ることもできます。

```bash
npm run generate -- "2次方程式 x^2-5x+6=0 を解け"
```

できた動画は `public/projects/<slug>/` に入り、アプリを再読み込みすると一覧に出ます。

---

## うまく動かないとき

**ポートが使われていると出る**

`npm run dev` は 5173 と 3001 を使います。前回の起動が残っている場合は、そのターミナルを
Ctrl-C で止めてから実行し直してください。

**動画は表示されるが音が出ない**

ブラウザの自動再生制限です。画面を一度タップ（クリック）してください。

**「生成」タブでエラーになる**

`ANTHROPIC_API_KEY is not set` と出る場合は、上の手順で `.env` を作ったあと、
サーバを立て直したか確認してください。

**`npm install` でエラーになる**

`node -v` が `v22` 以上か確認してください。古い Node では入りません。

---

## コマンド一覧

| | |
|---|---|
| `npm run dev` | アプリを起動する（**通常はこれだけ**）。→ http://localhost:5173/ |
| `npm run generate -- "<問題>"` | コマンドラインから1本作る |
| `npm run typecheck` | 型検査。このリポジトリ唯一の検証手段です |
| `npm run studio` | Remotion Studio を開き、動画の中身を1フレームずつ確認する |

---

## 構成

```
src/pipeline/    入力 → 台本 → 音声 → 字幕 → 組み立て
src/remotion/    動画の描画（グラフ・図形・表・ヒストグラムなど）
src/prompts/     Claude へ渡すプロンプト
src/curriculum.ts  学年・分野・単元の一覧。絞り込みの正本
web/             ブラウザ側のアプリ
public/projects/ 生成済みの動画（1本 = manifest.json + シーンごとの mp3）
```

**MP4 は作りません。**`@remotion/player` が、レンダリングに使うのと同じ React コンポーネントを
ブラウザで直接再生します。`public/projects/<slug>/` にあるのは台本と音声だけで、映像は
再生のたびに描画されます。
