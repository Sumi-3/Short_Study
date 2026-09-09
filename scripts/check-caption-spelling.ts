import assert from "node:assert/strict";
import type { Caption } from "@remotion/captions";
import { applyDisplaySpelling } from "../src/pipeline/captionSpelling.js";
import { WHOLE_FRACTION } from "../src/remotion/Fraction.js";

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
// 小問番号も演算子と同じ split-token 経路を通って保たれなければならない。
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

const shown = (parts: string[]) => applyDisplaySpelling(captions(parts)).map((c) => c.text).join("");

const extendedFractions = [
  ["4分のπ", "π/4"], ["4ぶんのπ", "π/4"], ["4分のパイ", "π/4"],
  ["4分の3ルート19", "3√19/4"], ["4ぶんの3ルート19", "3√19/4"],
  ["4分の3√19", "3√19/4"], ["2分のルート3", "√3/2"],
  ["2分のx", "x/2"], ["n分のm", "m/n"],
  ["π分の2", "2/π"], ["パイ分の2", "2/π"], ["θ分のα", "α/θ"],
  ["シータ分のアルファ", "α/θ"], ["x分の3ルート19", "3√19/x"],
  ["2分の√x", "√x/2"], ["2分のA", "A/2"], ["Σ分の1", "1/Σ"],
  ["3分の0", "0/3"],
];

for (const [spoken, written] of [
  ...extendedFractions,
  ["2ぶんの1", "1/2"], ["2分の1", "1/2"],
  ["3分の2", "2/3"], ["3ぶんの2", "2/3"],
  ["12分の11", "11/12"], ["137ぶんの29", "29/137"],
  ["9999999999999999999分の2", "2/9999999999999999999"],
  ["3分の0", "0/3"], ["0分の1", "0分の1"],
  ["1.2分の1", "1.2分の1"], ["2分の1.5", "2分の1.5"],
  ["12分の1と2分の1", "1/12と1/2"],
  ["2分の1と1.2分の1", "1/2と1.2分の1"],
  ["2分の1と2分の1万", "1/2と2分の1万"],
  ["2分の1分の3", "2分の1分の3"], ["2ぶんの1ぶんの3", "2ぶんの1ぶんの3"],
  ["3分で2問を解く", "3分で2問を解く"], ["1/2", "1/2"],
  ["xのにじょうたす2x", "x²+2x"], ["ACのさんじょう", "AC³"],
  ["xのよんじょう", "x⁴"], ["xの二乗", "x²"], ["x2乗", "x²"],
  ["3の2乗", "3²"], ["12乗", "12乗"], ["xの12乗", "xの12乗"],
  ["(x+1)の2乗", "(x+1)²"], ["エーエヌのにじょう", "aₙ²"],
  ["アルファのにじょうたす1", "α²+1"], ["xの2乗とyの3乗", "x²とy³"],
  ["両辺を2乗すると", "両辺を2乗すると"],
  ["両辺を2乗するのが鍵です", "両辺を2乗するのが鍵です"],
  ["両辺をにじょうすると", "両辺を2乗すると"],
  ["両辺を二乗した", "両辺を2乗した"],
  ["2乗の項", "2乗の項"], ["xを2乗する", "xを2乗する"],
  ["xのにじょうすると", "xの2乗すると"],
  ["xイコール2乗", "x=2乗"],
  ["2のnたす1じょう", "2のn+1乗"],
  ["エーエヌプラスイチ", "aₙ₊₁"], ["エーエヌマイナスイチ", "aₙ₋₁"],
  ["パイプとアルファベット", "パイプとアルファベット"],
  ["シータとパイとガンマとデルタとラムダとオメガとシグマ", "θとπとγとδとλとωとΣ"],
  ["エヌがむげんだいのときのリミット", "エヌがむげんだいのときのlim"],
  ["対角線を引く", "対角線を引く"],
]) {
  assert.equal(shown([spoken]), written, spoken);
}

// 可能な全二 token 分割に加え、一文字ずつという最悪ケースも試す。これにより
// synthesiser が選んだ境界とは独立して、literal key を検証できる。
for (const [spoken, written] of [
  ...extendedFractions,
  ["2ぶんの1", "1/2"], ["3分の2", "2/3"], ["137ぶんの29", "29/137"],
  ["のにじょう", "の2乗"], ["エーエヌプラスイチ", "aₙ₊₁"],
  ["エーエヌマイナスイチ", "aₙ₋₁"], ["かっこ1", "(1)"],
  ["リミット", "lim"],
]) {
  const splits = [[...spoken], ...Array.from({ length: spoken.length - 1 }, (_, i) => [spoken.slice(0, i + 1), spoken.slice(i + 1)])];
  for (const parts of splits) {
    const input = captions(["答えは", ...parts, "です"]);
    const original = structuredClone(input);
    const result = applyDisplaySpelling(input);
    assert.equal(result.map((c) => c.text).join(""), `答えは${written}です`, JSON.stringify(parts));
    assert.equal(result.length, 3);
    assert.deepEqual(result[0], input[0]);
    assert.deepEqual(result[2], input.at(-1));
    assert.deepEqual(result[1], { ...input[1], text: written, endMs: input.at(-2)!.endMs, pageBreakAfter: false });
    assert.deepEqual(input, original, "input captions must not be mutated");
    if (written.includes("/")) {
      assert.deepEqual(WHOLE_FRACTION.exec(result[1].text)?.slice(1), written.split("/"));
    }
  }
}

// synthesiser が小数点や「分の」のちょうどそこで切っても、guard は隣を見なければならない。
// 別の場所の有効な出現が、それを有効化してはならない。
for (const [spoken, written] of [
  ["1.2分の1", "1.2分の1"], ["2分の1.5", "2分の1.5"],
  ["1.2分のπ", "1.2分のπ"], ["4分の3ルート19.5", "4分の3√19.5"],
  ["4分の1.3ルート19", "4分の1.3√19"],
  ["2分の1分の3", "2分の1分の3"], ["2ぶんの1ぶんの3", "2ぶんの1ぶんの3"],
  ["2分のπぶんの3", "2分のπぶんの3"], ["x分のy分のz", "x分のy分のz"],
  ["2分の1と1.2分の1", "1/2と1.2分の1"],
  ["2分の1と2分の1万", "1/2と2分の1万"],
  ["0分のπ", "0分のπ"], ["xy分の1", "xy分の1"], ["2分のxy", "2分のxy"],
  ["2分のπx", "2分のπx"], ["√2分の1", "√2分の1"],
  ["ルート2分の1", "√2分の1"],
]) {
  for (const parts of [[spoken], [...spoken], ...Array.from({ length: spoken.length - 1 }, (_, i) =>
    [spoken.slice(0, i + 1), spoken.slice(i + 1)])]) {
    assert.equal(shown(parts), written, JSON.stringify(parts));
  }
}

// slash の断片には読み上げ上の境界がなく、分数として結合してはならない。
for (const parts of [["π/", "4"], ["3", "√", "19/", "4"], ["1", "/", "2"]]) {
  assert.deepEqual(applyDisplaySpelling(captions(parts)), captions(parts));
}
for (const text of ["答えはπ/4", "π/4です", "π/", "19/", "1.2/3", "1/2.3", "1/2/3", "1/0", "xy/2", "3√19/4です"]) {
  assert.equal(WHOLE_FRACTION.test(text), false, text);
}

for (const parts of [
  ["x", "の", "に", "じょう"], ["xの", "2", "乗"],
  ["x", "の", "に", "じ", "ょ", "う"],
]) {
  assert.equal(shown(parts), "x²");
  for (const verb of ["する", "した", "して", "すると", "しない", "すれば", "される", "させる", "せず"]) {
    assert.equal(shown([...parts, ...verb]), `xの2乗${verb}`);
  }
}
for (const parts of [
  ["両辺を", "2", "乗", "すると"], ["両辺を", "に", "じょう", "するのが鍵です"],
]) {
  assert.ok(!shown(parts).includes("²"), JSON.stringify(parts));
}
assert.equal(shown(["2分の1と1.", "2分の1"]), "1/2と1.2分の1");
assert.equal(shown(["2分の1", ".5"]), "2分の1.5");
assert.equal(shown(["2のnたす1", "じょう"]), "2のn+1乗");
assert.equal(shown(["条件を満", "た", "す"]), "条件を満たす");

console.log("PASS: fractions, contextual superscripts, notation rules, split tokens and timing preservation");
