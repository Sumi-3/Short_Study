# ShortCut

数学の問題を入力すると、解説のショート動画を自動で作るアプリです。
Claude が台本を書き、TTS がナレーションを吹き込み、Remotion が縦型 9:16 に組み立てます。

**clone した時点で 37 本の動画が入っています。** 生成を試す前に、まずそれを再生して
どんな動画ができるのか確かめられます。

---

## 必要なもの

| | |
|---|---|
| **Node.js** | 22 / 24 / 26 で動作を確認しています |
| **Git** | リポジトリの取得に使います。入れたくない場合は下の「Git を使わない場合」へ |
| **Anthropic の API キー** | 動画を作るのに使います。取得方法は手順3に書いてあります |

下の手順は、どちらも何も入っていない状態から順に実行できます。
すでに入っているものは、確認コマンドが通れば次へ進んでください。

> 同梱の37本を見るだけなら API キーは不要です。その場合は**手順3を飛ばして**ください。

---

## macOS

### 1. Node.js と Git を入れる

ターミナルを開いて、入っているか確認します。

```bash
node -v
git --version
```

`node -v` が `v22` 以上を返し、`git --version` も表示されれば **手順2へ進んでください。**

**Node.js が無い場合。** [nodejs.org/ja/download](https://nodejs.org/ja/download) を開き、
**LTS** の **macOS Installer（`.pkg`）** を落とします。ダウンロードした `.pkg` を
ダブルクリックし、そのまま「続ける」を押していけば完了です。

**Git が無い場合。** 次を実行すると、インストールを促すダイアログが出ます。
「インストール」を押して待ってください。

```bash
xcode-select --install
```

**どちらも、入れ終えたらターミナルを一度閉じて開き直してください。**
開き直したら `node -v` と `git --version` をもう一度実行し、両方表示されることを確認します。

### 2. リポジトリを取得する

```bash
git clone https://github.com/Sumi-3/Short_Study.git
cd Short_Study
npm install
```

### 3. API キーを設定する

[console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) で
アカウントを作り、**Create Key** からキーを発行します（`sk-ant-` で始まる文字列です）。

設定ファイルの雛形を複製して開きます。`.env` は先頭がドットなので Finder には出ませんが、
次のコマンドで開けます。

```bash
cp .env.example .env
open -e .env
```

`ANTHROPIC_API_KEY=` の行を、発行したキーに書き換えて保存してください。

```
ANTHROPIC_API_KEY=sk-ant-...
```

設定はこれだけです。声やモデルなどは `src/config.ts` の既定値がそのまま使われます。

### 4. 起動する

```bash
npm run dev
```

ブラウザで **http://localhost:5173/** を開きます。

---

## Windows

### 1. Node.js と Git を入れる

「ターミナル」を開いて（コマンドプロンプトでも同じです）、入っているか確認します。

```
node -v
git --version
```

`node -v` が `v22` 以上を返し、`git --version` も表示されれば **手順2へ進んでください。**

**Node.js が無い場合。** [nodejs.org/ja/download](https://nodejs.org/ja/download) を開き、
**LTS** の **Windows Installer（`.msi`）** を落とします。ダウンロードした `.msi` を
ダブルクリックし、そのまま「Next」を押していけば完了です。

**Git が無い場合。** [git-scm.com/download/win](https://git-scm.com/download/win) を開くと
インストーラのダウンロードが始まります。実行したあとは設定項目が多く出ますが、
**すべて既定のまま「Next」で問題ありません。**

**どちらも、入れ終えたらターミナルを一度閉じて開き直してください。**
これを忘れると、入れたのに `node` が見つからないままになります。開き直したら
`node -v` と `git --version` をもう一度実行し、両方表示されることを確認します。

### 2. リポジトリを取得する

```
git clone https://github.com/Sumi-3/Short_Study.git
cd Short_Study
npm install
```

### 3. API キーを設定する

[console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) で
アカウントを作り、**Create Key** からキーを発行します（`sk-ant-` で始まる文字列です）。

設定ファイルの雛形を複製して開きます。`.env` は先頭がドットなのでエクスプローラには
出ませんが、次のコマンドで開けます。

```
copy .env.example .env
notepad .env
```

`ANTHROPIC_API_KEY=` の行を、発行したキーに書き換えて保存してください。

```
ANTHROPIC_API_KEY=sk-ant-...
```

設定はこれだけです。声やモデルなどは `src/config.ts` の既定値がそのまま使われます。

### 4. 起動する

```
npm run dev
```

ブラウザで **http://localhost:5173/** を開きます。

---

## Git を使わない場合

GitHub のページ右上の緑の **Code** ボタン → **Download ZIP** で丸ごと落とせます。
展開したフォルダへ移動して、`npm install` から始めてください。

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
| **生成** | 問題を入力して新しく作ります |

最初の1本はタップで再生してください。以降はスワイプするだけで自動再生に切り替わります
（ブラウザの自動再生制限が、最初のユーザー操作で解除されるためです）。

---

## 動画を作る

「生成」タブを開き、問題文を入力して **動画を生成** を押します。1〜2分で完成し、
できた動画がそのまま全画面で開きます。

問題は写真からでも入力できます。**写真を撮る** か **画像を選ぶ** を押すと
「問題の部分を囲む」画面になり、囲んだ範囲から問題文が読み取られます。
読み取った文は送信前に直せます。声は14種類から選べ、その場で試聴できます。

コマンドラインからも作れます。

```bash
npm run generate -- "2次方程式 x^2-5x+6=0 を解け"
```

できた動画は `public/projects/<slug>/` に入り、アプリを再読み込みすると一覧に出ます。

> `.env` を後から書き換えた場合は、サーバを立て直してください。
> **`.env` は起動時にしか読まれません。** Ctrl-C で止めて `npm run dev` をやり直します。

---

## うまく動かないとき

**ポートが使われていると出る**

`npm run dev` は 5173 と 3001 を使います。前回の起動が残っている場合は、そのターミナルを
Ctrl-C で止めてから実行し直してください。

**動画は表示されるが音が出ない**

ブラウザの自動再生制限です。画面を一度タップ（クリック）してください。

**「生成」タブでエラーになる**

`ANTHROPIC_API_KEY is not set` と出る場合は、手順3の `.env` を作ったあとに
サーバを立て直したか確認してください。`.env` は起動時にしか読まれません。

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
