/**
 * 作成画面で選べる台本モデル。
 *
 * 比較のために置く。同じ問題を同じ effort で書かせて、答えの正しさ・シーン構成・
 * 生成時間の差を見るためのもので、恒久的な設定ではない。
 *
 * どちらも `thinking: adaptive` と `output_config.effort`（low〜max）、
 * `max_tokens: 64,000` を受け付けることを実測で確認している。
 *
 * この module は作成画面からも読むので、`voices.ts` と同じく `config.ts` を含む node
 * 依存を持ち込まないこと。持ち込むと bundle が `node:path` を要求して画面が白くなる。
 * 選択が無いときの既定は、node 側の `runPipeline` が `ANTHROPIC_MODEL` から入れる。
 */
export type ScriptModel = {
  /** API に渡す model id。 */
  id: string;
  /** 作成画面に出す名前。 */
  label: string;
  /** 選ぶ基準。速さと深さのどちらを取るか。 */
  note: string;
};

export const SCRIPT_MODELS: readonly ScriptModel[] = [
  { id: "claude-opus-5", label: "Opus 5", note: "深く考える・遅い" },
  { id: "claude-sonnet-5", label: "Sonnet 5", note: "速い" },
];

/**
 * 作成画面が使う台本モデル。当面は Opus 5 に固定し、選択UIは出さない。
 *
 * `ANTHROPIC_MODEL` への fallback に任せず、client が明示して送る。env は deploy ごとに
 * 変わり得るのに対し、ここは「どの動画も同じモデルで書かれている」ことを保証する位置だからである。
 * 比較を再開するときは上の一覧を選択UIへ戻せばよいので、一覧自体は残す。
 */
export const FIXED_SCRIPT_MODEL = SCRIPT_MODELS[0];

export const isModelId = (value: unknown): value is string =>
  typeof value === "string" && SCRIPT_MODELS.some((model) => model.id === value);
