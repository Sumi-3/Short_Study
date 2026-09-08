import assert from "node:assert/strict";
import type { Caption } from "@remotion/captions";
import { applyDisplaySpelling } from "../src/pipeline/captionSpelling.js";

const captions = (parts: string[]): Caption[] => parts.map((text, index) => ({
  text, startMs: index * 100, endMs: (index + 1) * 100,
  timestampMs: index * 100, confidence: null, pageBreakAfter: index === parts.length - 1,
}));
for (const parts of [
  ["プラスマイナス"], ["プラス", "マイナス"],
  ["プ", "ラス", "マイ", "ナス"],
]) {
  const result = applyDisplaySpelling(captions(parts));
  assert.equal(result.map((c) => c.text).join(""), "±");
  assert.equal(result.length, 1);
  assert.equal(result[0].startMs, 0);
  assert.equal(result[0].endMs, parts.length * 100);
  assert.equal(result[0].pageBreakAfter, true);
}
for (const [spoken, written] of [
  ["xイコールプラスマイナスルート7", "x=±√7"],
  ["プラスマイナス2プラス3マイナス4", "±2+3−4"],
  ["プラス3", "+3"], ["マイナス4", "−4"],
  ["条件を満たす", "条件を満たす"],
]) {
  const result = applyDisplaySpelling(captions([spoken])).map((c) => c.text).join("");
  assert.equal(result, written);
  assert.ok(!result.includes("+−"));
}
// Sub-question numbers survive the same split-token path as the operators.
{
  const spoken = [
    { text: "まずは", startMs: 0, endMs: 300, timestampMs: 0, confidence: 1 },
    { text: "かっこ", startMs: 300, endMs: 600, timestampMs: 300, confidence: 1 },
    { text: "1", startMs: 600, endMs: 800, timestampMs: 600, confidence: 1 },
    { text: "から", startMs: 800, endMs: 1000, timestampMs: 800, confidence: 1 },
  ];
  const shown = applyDisplaySpelling(spoken).map((c) => c.text).join("");
  assert.ok(shown.includes("(1)"), `かっこ1 should render as (1), got ${shown}`);
  assert.ok(!shown.includes("かっこ"), `かっこ should not survive, got ${shown}`);
}

console.log("PASS: プラスマイナス → ± before partial operators, including split tokens and timing preservation");
