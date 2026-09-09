# short_study

トピックを1文渡すと、Claude が台本を書き、TTS がナレーションを吹き込み、Remotion が
縦型 9:16 に仕上げるパイプライン。Web アプリ（`web/`）は MP4 を経由せず
`@remotion/player` で同じ React コンポーネントを直接再生する。

| コマンド | |
|---|---|
| `npm run dev` | サーバ + Web を同時起動（`dev.mjs`） |
| `npm run generate -- "<topic>"` | CLI で1本生成 → `public/projects/<slug>/`（Web アプリで再生） |
| `npm run studio` | Remotion Studio |
| `npm run typecheck` | **唯一の検証手段**（テストスイートは無い）。変更後は必ず通す |

主要な場所: パイプラインは [src/pipeline/](src/pipeline/)、Remotion コンポーネントは
[src/remotion/](src/remotion/)、プロンプトは [src/prompts/](src/prompts/)、
分類の正本は [src/curriculum.ts](src/curriculum.ts) の `MATH_UNITS`、
テーマ定義は [src/remotion/theme.ts](src/remotion/theme.ts)、音声は [src/voices.ts](src/voices.ts)。
`.agents/skills/remotion-*/` に Remotion 公式スキルがあるので、Remotion の書き方で迷ったら先に読む。

## Codex への委譲

このリポジトリでは Codex（`codex@openai-codex` プラグイン）を**積極的に使う**。
実装・デバッグ系の重い仕事は原則 Codex に投げ、Claude 側はオーケストレーションと
結果提示に徹する。ユーザーが明示的に頼むのを待たないこと。

### 委譲する（ユーザーの指示を待たず、自分から投げる）

- 複数ファイルにまたがる実装・リファクタリング
- 原因が分かっていないバグ、再現条件が曖昧な不具合
- Claude 自身が2回試して直らなかったもの（3回目は自分でやらず必ず投げる）
- パイプライン／レンダリング／音声同期まわりの、腰を据えた調査
- セカンドオピニオンが欲しい設計判断、別解が見たい実装

### 委譲しない（自分でやる）

- 1ファイルの小さな編集、typo、命名変更、import 整理
- 単なる質問・コードリーディング・説明
- `npm run typecheck` を通すだけの機械的な修正
- ユーザーが「自分で書いて」と言った場合

### 呼び出し方

`Agent` ツールで `subagent_type: "codex:codex-rescue"` を指定し、ユーザーの要求を
そのまま prompt として渡す。`Skill(codex:rescue)` は呼ばないこと（セッションが固まる）。

- 小さく範囲の決まった依頼はフォアグラウンド、長引きそう・多段・オープンエンドなものは
  バックグラウンド（`--background`）。

### バックグラウンドに回ったら、自分で取りに行く

**`codex-rescue` は結果を取りに行くことを禁止された転送係**（エージェント定義に
"Do not ... monitor progress, poll status, fetch results" / "Do not call ... `status`, `result`"）。
バックグラウンドのジョブは**完了通知が来ない**。`Agent` ツールの `run_in_background: false` は
サブエージェント側の話で、Codex ジョブには効かない。`task` に `--wait` は無い
（あるのは `review` 系だけ）ので、ブロックする唯一の方法は `--background` を付けないこと。

依頼文が長く多段だと、エージェントは自分の判断でバックグラウンドを選ぶ。つまり**長い依頼は
ほぼ確実にバックグラウンドになる**。投げたら以下で自分で取りに行くこと。待っても何も来ない。

```
node "$HOME/.claude/plugins/cache/openai-codex/codex/<version>/scripts/codex-companion.mjs" status <task-id>
node "$HOME/.claude/plugins/cache/openai-codex/codex/<version>/scripts/codex-companion.mjs" result <task-id>
```
- **タスクに合わせて `--model` を必ず明示する**（下表）。
- 前回の Codex 作業の続き（「続けて」「さっきの直して」「もっと掘って」）は `--resume` を付ける。
- 調査・レビューだけで編集させたくない時はその旨を明記する（既定は書き込み可）。

### Remotion スキルを使わせる

Remotion に触れる依頼（`src/remotion/`、`@remotion/player` を使う `web/`、字幕、レンダリング）
では、**prompt に読むべきスキルを名指しで書く**。リポジトリ直下の [AGENTS.md](AGENTS.md) を
Codex は自動で読むので導線自体は通っているが、名指しした方が確実に読む。

```
着手前に .agents/skills/remotion-markup/SKILL.md を読むこと。
（DOM 計測が絡むなら .agents/skills/remotion-markup/measuring-dom-nodes.md も）
```

どのスキルかは AGENTS.md の対応表から選ぶ。ルーター
（`.agents/skills/remotion-best-practices/SKILL.md`）**内のリンクは壊れている**
（`REFERENCE.md` を指すが実体は `SKILL.md`）ので、ルーターを辿らせず直接指定する。

### モデルの選び方

タスクの重さで選ぶ。**指定を省くと `.codex/config.toml` の既定にフォールバックする**ので、
軽い作業に重いモデルを、難所に軽いモデルを当てないよう毎回明示すること。

| タスク | `--model` | `--effort` |
|---|---|---|
| 原因不明のバグ、設計判断、大規模リファクタ、**2回失敗した後の3回目** | `gpt-6-astra` | `high`、詰まったら `xhigh` |
| 通常の実装・複数ファイル改修・調査（**迷ったらこれ**） | `gpt-5.6-terra` | 省略（既定 medium） |
| 範囲が明確な定型作業、機械的な置換、軽い調べもの | `gpt-5.6-luna` | 省略、または `low` |

- 判断基準は「コード量」ではなく**不確実性**。300行の機械的な置換は luna、
  30行でも原因が分からないバグは astra。
- `--effort` に渡せるのは `none|minimal|low|medium|high|xhigh` まで。
  モデル側は `max`/`ultra` も持つが、プラグインが弾くので使わない。
- 選べるモデルの正本は `~/.codex/models_cache.json`。ラインナップが変わったらこの表を更新する。
  `gpt-5.4-mini` は非推奨（`gpt-5.6-luna` へ移行済み）なので指定しない。

### レビュー

`/codex:review` と `/codex:adversarial-review` は**モデルからは起動できない**仕様
（`disable-model-invocation: true`）。レビューが要るときは自分で走らせようとせず、
「`/codex:review` を叩いてください」とユーザーに促す。設計そのものを疑ってほしい時は
`/codex:adversarial-review`。

### 結果の扱い

- Codex の出力は**そのまま**返す。要約・言い換え・前後のコメント追加をしない。
- ファイルパスと行番号は Codex が出したとおりに保つ。
- Codex が編集を行った場合は、その旨と触ったファイルを明示する。
- **レビュー結果を受けて勝手に修正しない。** どれを直すかは必ずユーザーに確認してから。
- Codex の起動に失敗した／不完全に終わった場合、Claude 側で代替の実装を書かない。
  失敗をそのまま報告して止まる。
- セットアップ・認証エラーが出たら `/codex:setup` に誘導する。

その他のコマンド: `/codex:status`（進行中・完了ジョブ一覧）、`/codex:result <id>`（結果再表示）、
`/codex:cancel <id>`、`/codex:transfer`（このセッションを Codex スレッドへ移送）。
