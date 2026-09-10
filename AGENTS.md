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
| `npm run web:build` | Web を触ったら合わせて通す |

主要な場所: パイプラインは `src/pipeline/`、Remotion コンポーネントは `src/remotion/`、
プロンプトは `src/prompts/`、分類の正本は `src/curriculum.ts` の `MATH_UNITS`、
テーマ定義は `src/remotion/theme.ts`、音声は `src/voices.ts`、Web アプリは `web/src/`。

## Remotion のスキルを先に読む

`.agents/skills/` に Remotion 公式スキル（v4.0.518）が入っている。**Remotion に触れる作業は、
書き始める前に該当スキルを読むこと。** 自分の記憶より、この中の記述を優先する。

入口は `.agents/skills/remotion-best-practices/SKILL.md`（ルーター）。ただし
**ルーター内のリンクは壊れている**ので、そのまま辿らないこと。`./remotion-markup/REFERENCE.md`
のように書かれているが、`REFERENCE.md` は12スキル中1つも存在せず、入れ子でもない。
実際の入口は一律 `.agents/skills/<スキル名>/SKILL.md`。

このリポジトリで実際に効くもの:

| 作業 | 読むもの |
|---|---|
| コンポーネントの書き方、アニメーション、DOM 計測、複数シーン、テキスト装飾 | `remotion-markup/SKILL.md`（配下の `measuring-dom-nodes.md` `multi-scene-video.md` `text-highlights.md` `timing.md` などが個別トピック） |
| `<Player>`、Web アプリ側、Vercel でのレンダリング | `remotion-saas/SKILL.md` |
| 字幕（`@remotion/captions`）まわり | `remotion-captions/SKILL.md` |
| `npx remotion still`（検証用スクリーンショット）の詰まったところ | `remotion-render/SKILL.md` |
| API の仕様を確かめたい | `remotion-docs/SKILL.md` |

`remotion-create` / `remotion-upgrade` は既存プロジェクトには使わない。

## このリポジトリの流儀

- **コメントは「なぜそうしたか」を書く。** 何をしているかの言い換えは書かない。既存コードの
  コメント密度に合わせること（`src/remotion/math/Formula.tsx` や `web/src/Thumbnail.tsx` が見本）。
- 色をハードコードしない。whiteboard に統一しているので `themeOf()` から
  `theme.ink` / `theme.inkDim` / `theme.bgDeep` / `theme.accents[0]` を取る。
  Web の共通トークンは `web/src/styles.css` の `:root`。
- スタイルは `web/src/styles.css` に集約する。不要になった規則は消す。
- 構造化出力のスキーマには**シーンあたり19フィールドの上限**がある（20 を超えると
  `400 The compiled grammar is too large`）。経緯は `src/pipeline/generateOutline.ts` の
  冒頭コメント。フィールドを増やす方向で解こうとせず、既存フィールドの再利用か
  文字列マーカーで表現する（`src/formulaLines.ts` の `[text]` `[carry]` `[substitute: …]` など）。
- `narration` は字幕用文章と読み用文章を `<<<TTS_READING>>>` で区切る。
  `src/pipeline/captionAlignment.ts` が `$…$` を1原子として差分で対応付ける。
  区切りのない旧台本は読み用のみ。既存manifestの字幕は書き換えない。

## 触らないもの

- **`public/projects/` の既存ディレクトリを消さない。** 生成済みの動画が入っていて、
  git 管理外なので復元できない。削除まわりの動作確認は、自分で使い捨てを作ってから消すこと。
- `out/` は検証用の生成物置き場。MP4 書き出し機能は削除済みで、動画は
  `public/projects/` の manifest を Web アプリが `@remotion/player` で直接再生する。
