# ShortCut

数学の問題を入力すると、解説のショート動画を自動で作るアプリです。
Claude が台本を書き、TTS がナレーションを吹き込み、Remotion が縦型 9:16 に組み立てます。

**clone した時点で 37 本の動画が入っています。** 視聴するだけなら API キーは要りません。

---

## 必要なもの

| | |
|---|---|
| **Node.js** | 22 / 24 / 26 で動作を確認しています |
| **Git** | リポジトリの取得に使います。入れたくない場合は下の「Git を使わない場合」へ |
| **Anthropic の API キー** | **動画を新しく作るときだけ** 必要です。視聴するだけなら不要 |

下の手順は、どちらも何も入っていない状態から順に実行できます。
すでに入っている場合は確認コマンドだけ通れば次へ進んでください。

---

## macOS

### 1. Node.js と Git を入れる

まず入っているか確認します。

```bash
node -v
git --version
```

`node -v` が `v22` 以上を返し、`git --version` も表示されれば **手順2へ進んでください。**

**Node.js が無い場合。** Homebrew で入れます。Homebrew 自体が無ければ先にこれを実行します
（途中でパスワードを聞かれます）。

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Apple シリコン（M1 以降）では、続けて次の2行も実行してください。これを忘れると
`brew` コマンドが見つかりません。Intel Mac では不要です。

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

Homebrew が使えるようになったら、Node.js を入れます。

```bash
brew install node
```

**Git が無い場合。** 次を実行すると、インストールを促すダイアログが出ます。

```bash
xcode-select --install
```

> Homebrew を使いたくない場合は、[nodejs.org/ja/download](https://nodejs.org/ja/download) から
> macOS 用のインストーラ（`.pkg`）を落として実行しても同じです。

### 2. 起動する

```bash
git clone https://github.com/Sumi-3/Short_Study.git
cd Short_Study
npm install
npm run dev
```

ブラウザで **http://localhost:5173/** を開きます。

---

## Windows

「ターミナル」を開いて実行します（コマンドプロンプトでも同じです）。

### 1. Node.js と Git を入れる

まず入っているか確認します。

```
node -v
git --version
```

`node -v` が `v22` 以上を返し、`git --version` も表示されれば **手順2へ進んでください。**

無い場合は、Windows 標準の `winget` で入ります。

```
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

**インストール後、ターミナルを一度閉じて開き直してください。** PATH が反映されず
`node` が見つからないままになります。開き直したら `node -v` で確認します。

> `winget` が見つからない場合（Windows 10 の古い版など）は、
> [nodejs.org/ja/download](https://nodejs.org/ja/download) と
> [git-scm.com/download/win](https://git-scm.com/download/win) から
> インストーラを落として実行してください。

### 2. 起動する

```
git clone https://github.com/Sumi-3/Short_Study.git
cd Short_Study
npm install
npm run dev
```

ブラウザで **http://localhost:5173/** を開きます。

> **PowerShell を使っていて**、`npm : このシステムではスクリプトの実行が無効になっているため…`
> と出た場合は、実行ポリシーが原因です。一度だけ次を実行してください（管理者権限は不要）。
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```
>
> コマンドプロンプトではこの問題は起きません。

---

## Git を使わない場合

GitHub のページ右上の緑の **Code** ボタン → **Download ZIP** で丸ごと落とせます。
展開したフォルダへ `cd` して、`npm install` から始めてください。

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

Anthropic の API キーが要ります。持っていない場合は
[console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) で
アカウントを作り、**Create Key** から発行してください（`sk-ant-` で始まる文字列です）。

**1. `.env` を用意する**

macOS:

```bash
cp .env.example .env
```

Windows:

```
copy .env.example .env
```

**2. `.env` を開いて、1行目のキーを書き換える**

`.env` は先頭がドットなので Finder やエクスプローラでは見えません。次で開けます。

macOS:

```bash
open -e .env
```

Windows:

```
notepad .env
```

1行目を、発行したキーに書き換えて保存します。

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
