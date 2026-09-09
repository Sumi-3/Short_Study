/**
 * 300s の Vercel function 用の予算。台本生成に 170s、outline/captions/manifest/upload に 20s、
 * 変動に 30s を確保する。残る 80s で、各 8s と仮定した TTS request を 10 回直列に実行できる。
 * これは保守的な運用予算であり遅延保証ではない。既存 manifest が記録するのは合成の実時間ではなく、
 * 再生時間（16 project、4–6 scene、25–70s）である。特に Whisper は production の計時結果で
 * この仮定を見直す。推定音声 120s と scene あたり 20s も request size を制限するが、どちらも
 * 埋めるべき目標ではない。実際の再生時間は TTS と scene padding で決まる。
 */
const MAX_SCRIPT_SCENES = 10;
const MAX_NARRATION_SECONDS = 120;
const MAX_SCENE_SECONDS = 20;

/**
 * 数学は文章より 1 文字あたり遅い。"AC" は 2 文字だが 4 モーラ、"98" は 2 文字だが 7 モーラで
 * ある。数学以外の台本は残っていないため、選択可能な速度を設けても app が使えない設定を示すだけになる。
 */
const CHARS_PER_SECOND = 4.6;

export type ScriptBudget = {
  seconds: number;
  maxScenes: number;
  /** hook 1 個と summary 1 個を除いた point の最大数。ノルマではない。 */
  points: number;
  totalChars: number;
  perScene: number;
};

export const budgetFor = (): ScriptBudget => ({
  seconds: MAX_NARRATION_SECONDS,
  maxScenes: MAX_SCRIPT_SCENES,
  points: MAX_SCRIPT_SCENES - 2,
  totalChars: Math.floor(MAX_NARRATION_SECONDS * CHARS_PER_SECOND),
  perScene: Math.floor(MAX_SCENE_SECONDS * CHARS_PER_SECOND),
});

/** TTS より前に検証する。scene を黙って切ると要求された答えを落とし得る。 */
export const assertScriptBudget = (
  scenes: readonly { narration: string }[],
  budget: ScriptBudget,
) => {
  if (scenes.length > budget.maxScenes ||
      scenes.some((scene) => scene.narration.length > budget.perScene) ||
      scenes.reduce((sum, scene) => sum + scene.narration.length, 0) > budget.totalChars) {
    throw new Error(`解説が生成上限（${budget.maxScenes}シーン・合計${budget.totalChars}文字・1シーン${budget.perScene}文字）を超えました。問題を設問ごとに分けてください。`);
  }
};

export const scriptMaxTokens = (budget: ScriptBudget) =>
  12_000 + budget.maxScenes * 1_500;
