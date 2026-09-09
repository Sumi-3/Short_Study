import assert from "node:assert/strict";
import { assertScriptBudget, budgetFor, scriptMaxTokens } from "../src/scriptBudget.js";
import { mathPrompt } from "../src/prompts/math.js";

const budget = budgetFor();
assert.equal(budget.maxScenes, 10);
assert.equal(budget.points + 2, budget.maxScenes);
assert.equal(budget.totalChars, 552);
assert.equal(scriptMaxTokens(budget), 27_000);
assert.equal(scriptMaxTokens({ ...budget, maxScenes: 8 }), 24_000);
// 易しい script は上限を大きく下回って終わり得る。境界ケースで scene の増加、個別 request
// の長さ、合計 narration 過多をそれぞれ独立して捕捉する。
assert.doesNotThrow(() => assertScriptBudget(Array(3).fill({ narration: "説明です。" }), budget));
assert.doesNotThrow(() => assertScriptBudget([
  ...Array(6).fill({ narration: "あ".repeat(92) }), ...Array(4).fill({ narration: "" }),
], budget));
assert.throws(() => assertScriptBudget(Array(11).fill({ narration: "説明" }), budget));
assert.throws(() => assertScriptBudget([{ narration: "あ".repeat(93) }], budget));
assert.throws(() => assertScriptBudget(Array(7).fill({ narration: "あ".repeat(79) }), budget));
const prompt = mathPrompt();
assert.match(prompt, /総3〜4シーン/);
assert.match(prompt, /場合分け/);
assert.doesNotMatch(prompt, /大きく下回ると|文字前後/);
console.log("PASS: short scripts accepted; 10 scenes / 552 total / 92 per scene enforced; adaptive 27,000-token budget");
