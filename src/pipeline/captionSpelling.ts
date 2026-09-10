import type { Caption } from "@remotion/captions";
import { GREEK, TERMS, TERM_LETTERS, SPOKEN_SYMBOLS } from "../mathVocabulary.js";
import { normalizeMathText, splitMathText } from "../mathText.js";
import { structuredSpeechMatches } from "../mathSpeech.js";

/**
 * 字幕トークンを読む人が期待する記法へ戻す。
 *
 * ナレーションは synthesiser が読める綴りにする必要がある。ja-JP-NanamiNeural で測ると
 * `=` は無音になり、`cos` はシーオーエスと読まれる。そのため台本ではイコールとコサインを使い、
 * 聞くのではなく読む同じ言葉である字幕だけを、ここで数学記法に戻す。タイミングは変えない。
 */

/**
 * 式に属するか判定する前に累乗表記を正規化する。
 *
 * 以前はこれを ² にしており、実際の字幕でのみ分かる誤りがあった。
 * 「両辺を2乗するのが鍵です」が「両辺を²するのが鍵です」になった。「2乗する」は動詞であり、
 * 累乗は何かの肩文字ではなく両辺に行う操作である。そのため旧来の無条件置換は両方で「2乗」を
 * 使わざるを得なかった。現在は全表記を正規化したあと applyPowers が token 境界をまたいで
 * 底と後続の動詞を確認するため、肩文字を復元できる。「2乗」で始まる token 単独は底の証拠ではない。
 *
 * ここで残る仕事は綴りの正規化である。ナレーションが「にじょう」と言うのは synthesiser が
 * 正しく読むためで、whisper は両方の形で書き、台本の他の部分では数字表記を使う。
 */
const POWERS: Record<string, string> = {
  にじょう: "2乗",
  さんじょう: "3乗",
  よんじょう: "4乗",
  二乗: "2乗",
  三乗: "3乗",
  四乗: "4乗",
  "2乗": "2乗",
  "3乗": "3乗",
  "4乗": "4乗",
};

/**
 * 「の」を累乗と一緒に保ち、除去後にタイミング付きの空 token を残さない。プラスマイナスや
 * かっこ1 と同様、これらはリテラルの結合キーである。
 */
const POWER_PHRASES = Object.fromEntries(
  Object.entries(POWERS).map(([spoken, written]) => [`の${spoken}`, `の${written}`]),
);

/** ギリシャ文字名の直後に続いてはならないカタカナと長音記号。 */
const KATAKANA = /[\u30a0-\u30ff]/;

/**
 * 「分の」は「4分の3ルート19」を含め、順序と範囲を確定する。スラッシュだけではこの境界を
 * 与えられない。実際の一致をリテラル結合キーのままにするので、根号やギリシャ文字が 1 文字ずつ
 * 分割されても 1 つの分数で保てる。小数の一部や連鎖分数は除き、大きな整数を丸めないよう数字は
 * 文字列のままにする。数値の分母は 0 であってはならない。
 */
const FRACTION_LETTER = `(?:[A-Za-zΑ-ΡΣ-ω]|(?:${Object.keys(GREEK).join("|")})(?![\\u30a0-\\u30ff]))`;
const FRACTION_ATOM = `(?:0|[1-9][0-9]*|${FRACTION_LETTER})`;
const FRACTION_NUMERATOR = `(?:${FRACTION_ATOM}?(?:ルート|√)${FRACTION_ATOM}|${FRACTION_ATOM})`;
const FRACTION_EDGE = "[0-9A-Za-zΑ-ΡΣ-ω０-９一二三四五六七八九十百千万億兆零〇./√]";
const FRACTION = new RegExp(
  `(?<!${FRACTION_EDGE})(?<!ルート)(?<!ぶんの)(?<!分の)([1-9][0-9]*|${FRACTION_LETTER})` +
  `(?:ぶんの|分の)(${FRACTION_NUMERATOR})(?!${FRACTION_EDGE}|ルート|ぶんの|分の)`,
  "g",
);

/** カナでは曖昧でない。数学台本の他の語はこの綴りにならない。 */
const ALWAYS: Record<string, string> = {
  無限大: SPOKEN_SYMBOLS.無限大,
  ノットイコール: SPOKEN_SYMBOLS.ノットイコール,
  矢印: SPOKEN_SYMBOLS.矢印,
  コサイン: "cos",
  サイン: "sin",
  タンジェント: "tan",
  リミット: "lim",
  イコール: "=",
  ルート: "√",
  // guard 付きのプラス/マイナスより先に処理し、分割された TTS token を 1 語として結合する。
  プラスマイナス: "±",
  /*
   * 小問番号。synthesiser は裸の「(1)」を数字でなく間として読むため、ナレーションは
   * 「かっこ1」と言う。字幕は聞くのでなく読む同じ言葉なので、記法へ戻す必要がある。
   *
   * パターン一致ではなく数字ごとに列挙する。上の `mergeSplitWords` は synthesiser が分割した
   * token をこの完全一致キーでつなぐため、正規表現だけの規則はこの経路に参加できない。9 は
   * 実際の試験問題で必要な範囲を超える。
   */
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [`かっこ${index + 1}`, `(${index + 1})`]),
  ),
  ...POWERS,
  ...POWER_PHRASES,
  ...TERMS,
};

/**
 * 読み上げ用に展開した算術記号のうち、同じ読みの動詞を持つもの。「6わる2」は演算子だが
 * 「4でわると」は動詞の割るである。token の先頭を根拠にはできない。TTS は動詞も
 * 「4|で|わる|と」と単独 token にするため、先頭という位置は演算子の証拠にならない。
 * 前が数や記法のときだけ演算子とみなし、判断は全文の文脈で行う。
 */
const VERB_OPERATORS: Record<string, string> = {
  たす: "+",
  ひく: "−",
  かける: "×",
  わる: "÷",
};

/**
 * カナで書いた記号。ナレーションではこの形を演算子用に予約しており、同じ読みの動詞がないので
 * 出現箇所すべてで変換できる。
 */
const KANA_OPERATORS: Record<string, string> = {
  マイナス: "−",
  プラス: "+",
};

const OPERATORS: Record<string, string> = { ...VERB_OPERATORS, ...KANA_OPERATORS };

/**
 * 上の表では名前を付けられない指数。
 *
 * 「にじょう」と「さんじょう」は表に列挙するが、式そのものが指数になる
 * 「2のnたす1じょう」には固定の綴りがなく、字幕では「2のn+1じょう」とカナが残っていた。
 *
 * じょうは普通の単語の先頭にもなるので、演算子と同様に guard する。数字・文字・別の累乗の後なら
 * 指数にしかなり得ない。
 */
const POWER_TAIL: Record<string, string> = {
  じょう: "乗",
};

/**
 * 前に記法があるときだけ本来の意味になり、かつ token 内の位置だけで判断できる語。
 * 動詞と同じ読みの演算子はここに入れない（token 先頭の抜け道で動詞を壊すため）。
 */
const AFTER_NOTATION_ONLY: Record<string, string> = {
  ...KANA_OPERATORS,
  ...POWER_TAIL,
};

/**
 * 1 token の中でも演算子と判断できる、演算子の直前要素。
 *
 * word boundary は演算子を前の語に付ける。`xのにじょうたす2x` は `にじょうたす` token として
 * 戻るため、token 先頭だけの規則では見落とす。カナを任意位置で置換すると、動詞の一部である
 * たすを含む 1 token「満たす」を壊してしまう。左に記法を要求すれば区別でき、`2乗たす` は変換し、
 * `満たす` は変換しない。
 */
// `$` と `}` は `$a_{n}$` のような LaTeX の項の末尾。その直後の「たす」は演算子である。
const AFTER_NOTATION =
  /[0-9A-Za-z乗√πθαβγδλωΣ°=+−×÷()/.²³⁴$}]/;

// 演算子と開き括弧は演算子の前に置けるが、累乗の底にはなれない。
const POWER_BASE = /[0-9A-Za-zπθαβγδλωΣ)）\]]/;
/**
 * 底が 1 文字や括弧の累乗は Unicode の上付きにする。`(x+1)2乗` の底が括弧全体だと分かっても、
 * `$…$` で囲む始点（どこから式か）は本文から決められないので、KaTeX に渡さず文字で足す。
 * 底が `$a_{n}$` のような LaTeX の項なら範囲は明らかで、閉じる `$` の内側に `^{2}` を入れる。
 */
const SUPERSCRIPTS: Record<string, string> = { "2": "²", "3": "³", "4": "⁴" };

// 「xの2乗する」は不自然でも動詞である。TTS が次 token に置く場合も含め、
// して・しない・すれば・されるなどの活用を対象にする。
const VERBAL = /^\s*(?:す[るれ]|し|さ[れせ]|せ[ずぬよ])/;

const applyPowers = (text: string, context: string, offset: number) =>
  text
    .replace(/\$([^$]+)\$(の)?([234])乗/g, (spoken, inner: string, _particle, power: string, at: number) =>
      VERBAL.test(context.slice(offset + at + spoken.length)) ? spoken : `$${inner}^{${power}}$`)
    .replace(/(の)?([234])乗/g, (spoken, particle: string | undefined, power: string, at: number) => {
      const before = context[offset + at - 1];
      const after = context.slice(offset + at + spoken.length);
      // 裸の「12乗」は 1² でなく 12 乗である。数字の底には「の」が必要で、ナレーションも
      // 既にこれを要求している。一方 x2乗 と (x+1)2乗 は曖昧でない。
      const ambiguousDigits = !particle && before !== undefined && /[0-9]/.test(before);
      return before && POWER_BASE.test(before) && !VERBAL.test(after) && !ambiguousDigits
        ? SUPERSCRIPTS[power]
        : spoken;
    });

/**
 * boundary が分割した 1 語を結合する。
 *
 * boundary は語境界に置かれない。数字直後のカタカナ語は `98コ` + `サイン` に分かれて戻り、
 * 「のにじょう」は `の` + `に` + `じょう` の 3 token になる。分割位置は予測不能なので、
 * 探している語を綴るまで window を伸ばす。
 *
 * 同じ開始位置なら最長語を優先する（エーエヌプラスイチをエーエヌで止めない）。それを完成する
 * token だけ取り込むので、「のにじょう」の後の「は」を含む隣接語とタイミングを保てる。
 * 1 token が 1 文字の場合が最悪なので、key の長さで window を上限付ける。
 */
const mergeSplitWords = (captions: Caption[], words: string[]): Caption[] => {
  const merged: Caption[] = [];
  const maxSpan = Math.max(0, ...words.map((word) => word.length));
  let index = 0;

  while (index < captions.length) {
    let span = 1;
    const lookahead = captions.slice(index, index + maxSpan);
    const joined = lookahead.map((caption) => caption.text).join("");
    const firstLength = captions[index].text.length;
    let bestStart = Infinity;
    let bestEnd = 0;
    for (const word of words) {
      let at = joined.indexOf(word);
      while (at !== -1 && at < firstLength) {
        const end = at + word.length;
        if (end > firstLength && (at < bestStart || (at === bestStart && end > bestEnd))) {
          bestStart = at;
          bestEnd = end;
        }
        at = joined.indexOf(word, at + 1);
      }
    }
    let covered = firstLength;
    while (covered < bestEnd) {
      covered += lookahead[span].text.length;
      span++;
    }

    if (span === 1) {
      merged.push(captions[index]);
      index += 1;
      continue;
    }

    const window = captions.slice(index, index + span);
    merged.push({
      ...window[0],
      text: window.map((caption) => caption.text).join(""),
      endMs: window[span - 1].endMs,
      pageBreakAfter: window[span - 1].pageBreakAfter,
    });
    index += span;
  }

  return merged;
};

/**
 * 分数の分子・分母を LaTeX にする。`3ルート19` は `3\sqrt{19}`。ギリシャ文字のカナはこの後の
 * applyGreek が `$…$` の中でも文字にし、KaTeX は Unicode の π や θ をそのまま組める。
 */
const latexAtom = (atom: string) =>
  atom.replace(/^(\d*)(?:ルート|√)(.+)$/, (_, coefficient: string, radicand: string) =>
    `${coefficient}\\sqrt{${radicand}}`);

/**
 * 分数の外に残った根号を `$\sqrt{7}$` にする。`√7` の文字だけでは上線がなく、根号の中がどこまでか
 * 読み手に分からない。範囲は数か 1 文字に限る。`√2分の1` のように分数にならなかった読みや
 * `√xy` は、どこまでが根号の中か本文から決められないので触らない。既に `$…$` の中にあるものは
 * 分数が済ませているので飛ばす。
 */
const applyRoots = (text: string, context: string, offset: number) =>
  text.replace(/\$[^$]*\$|√(\d+|[A-Za-zΑ-ω])/g, (spoken, radicand: string | undefined, at: number) => {
    if (radicand === undefined) return spoken;
    // 根号の中が次の token に続いていないかは、token でなく全体の文脈で見る。synthesiser は
    // `ルート1` | `9.5` のように数の途中でも切る。
    const next = context[offset + at + spoken.length];
    return next !== undefined && /[0-9A-Za-zΑ-ω.]/.test(next) ? spoken : `$\\sqrt{${radicand}}$`;
  });

/**
 * `ルート` と直後の数や文字を 1 token に結合する語。`$\sqrt{7}$` は token をまたげないので、
 * synthesiser が `ルート` | `7` と切っても 1 つに戻す。数は 3 桁まで、文字は 1 つ。
 * 同じ始点なら mergeSplitWords が最長を選ぶので、`ルート1` が `ルート19` を止めることはない。
 */
const ROOT_WORDS = [
  ...Array.from({ length: 999 }, (_, index) => String(index + 1)),
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
].map((radicand) => `ルート${radicand}`);

/** `のにじょう` の中の `にじょう` より先に選ぶため、長い順にする。 */
const byLengthDesc = (entries: [string, string][]) =>
  [...entries].sort(([a], [b]) => b.length - a.length);

const applyGuarded = (text: string) => {
  let out = text;

  for (const [spoken, symbol] of Object.entries(AFTER_NOTATION_ONLY)) {
    let at = out.indexOf(spoken);
    while (at !== -1) {
      const isHead = at === 0;
      const followsNotation = at > 0 && AFTER_NOTATION.test(out[at - 1]!);
      if (!isHead && !followsNotation) {
        at = out.indexOf(spoken, at + 1);
        continue;
      }
      out = out.slice(0, at) + symbol + out.slice(at + spoken.length);
      at = out.indexOf(spoken, at + symbol.length);
    }
  }

  return out;
};

/**
 * 動詞と同じ読みの演算子。前の文字が数か記法のときだけ記号にする。token 境界をまたいで
 * 判断するので、書き換え後の全文を文脈として受け取る。
 */
const VERB_OPERATOR = new RegExp(Object.keys(VERB_OPERATORS).join("|"), "g");

const applyVerbOperators = (text: string, context: string, offset: number) =>
  text.replace(VERB_OPERATOR, (spoken, at: number) => {
    const before = context[offset + at - 1];
    return before && AFTER_NOTATION.test(before) ? VERB_OPERATORS[spoken]! : spoken;
  });

const applyGreek = (text: string) => {
  let out = text;

  for (const [spoken, letter] of byLengthDesc(Object.entries(GREEK))) {
    let at = out.indexOf(spoken);
    while (at !== -1) {
      const next = out[at + spoken.length];
      const remainder = out.slice(at + spoken.length);
      if (next !== undefined && KATAKANA.test(next) &&
        ![...Object.keys(GREEK), ...Object.keys(OPERATORS)].some((word) => remainder.startsWith(word))) {
        at = out.indexOf(spoken, at + 1);
        continue;
      }
      out = out.slice(0, at) + letter + out.slice(at + spoken.length);
      at = out.indexOf(spoken, at + letter.length);
    }
  }

  return out;
};

/**
 * 裸の文字読みを、字幕では表記へ戻す。
 *
 * ナレーションでは文字をそのまま書く決まりだが（prompts/scriptFormat.ts）、添字付きの項だけは
 * カナで綴らせるため、モデルは点 P のような裸の文字までカナにすることがある。字幕は聞くもの
 * ではなく読むものなので、ここで表記へ戻す。音声とタイミングは変えない。
 *
 * カナは大文字と小文字を区別しない。「エー」は点 A でも係数 a でもありうる。どちらかを知って
 * いるのは画面に出ている表記なので、その scene の表記を根拠にし、無ければ `TERM_LETTERS` の
 * 綴りに従う。
 */
const otherCase = (letter: string) =>
  letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase();

/** LaTeX コマンドは変数ではない。`\frac` の f が根拠にならないよう先に落とす。 */
const variablesOf = (notation: string) => notation.replace(/\\[a-zA-Z]+/g, " ");

const letterFor = (kana: string, variables: string) => {
  const written = TERM_LETTERS[kana]!;
  const alternate = otherCase(written);
  return variables.includes(alternate) && !variables.includes(written) ? alternate : written;
};

const applyLetters = (text: string, variables: string) => {
  let out = text;

  // `applyGreek` と同じ歩き方と guard。後ろにカタカナが続けば長い語の一部とみなし、
  // 「ピーク」「ビーカー」を P や b にしない。既知の数学語が続くときだけ文字と認める。
  for (const kana of Object.keys(TERM_LETTERS).sort((a, b) => b.length - a.length)) {
    const letter = letterFor(kana, variables);
    let at = out.indexOf(kana);
    while (at !== -1) {
      const next = out[at + kana.length];
      const remainder = out.slice(at + kana.length);
      if (next !== undefined && KATAKANA.test(next) &&
        ![...Object.keys(TERM_LETTERS), ...Object.keys(GREEK), ...Object.keys(OPERATORS)]
          .some((word) => remainder.startsWith(word))) {
        at = out.indexOf(kana, at + 1);
        continue;
      }
      out = out.slice(0, at) + letter + out.slice(at + kana.length);
      at = out.indexOf(kana, at + letter.length);
    }
  }

  return out;
};

/**
 * 数式の隣に置ける文字。KaTeX がそのまま組める記号だけを並べる（`²` は指数へ直し、`√` は
 * 範囲を決められないので取り込まない）。ここに無い文字（日本語・空白・読点）で式は終わる。
 */
const MATH_NEIGHBOUR = /[0-9A-Za-zΑ-Ωα-ω=+\-−×÷±<>≤≥≠∞→∫∑().,²³⁴]/;

const SUPERSCRIPT_TEX: Record<string, string> = { "²": "^{2}", "³": "^{3}", "⁴": "^{4}" };

/** 小数点と桁区切りは両側が数字のときだけ式の一部。文末の「.」を式に飲み込ませない。 */
const absorbable = (text: string, at: number) => {
  const char = text[at]!;
  if (!MATH_NEIGHBOUR.test(char)) {
    return false;
  }
  return char === "." || char === ","
    ? /[0-9]/.test(text[at - 1] ?? "") && /[0-9]/.test(text[at + 1] ?? "")
    : true;
};

/**
 * 式の範囲。`$…$` から数式文字だけを左右へ取り込む。演算子を挟んで並ぶ `$a$+$b$` は 1 つの式
 * なので、重なった範囲はつなぐ。token ごとに数えると切れ目で結果が変わるため、常に全文で決める。
 */
const mathRegions = (text: string): [number, number][] => {
  const regions: [number, number][] = [];
  for (const span of text.matchAll(/\$[^$]+\$/g)) {
    let start = span.index;
    let end = span.index + span[0].length;
    while (start > 0 && absorbable(text, start - 1)) start--;
    while (end < text.length && absorbable(text, end)) end++;
    const last = regions.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else regions.push([start, end]);
  }
  return regions;
};

/** 取り込んだ素の文字を TeX にする。関数名は立体で組ませ、上付きは KaTeX の指数に直す。 */
const toTex = (span: string) =>
  span
    .replace(/\$/g, "")
    .replace(/[²³⁴]/g, (char) => SUPERSCRIPT_TEX[char]!)
    .replace(/(?<![\\A-Za-z])(sin|cos|tan|log|lim)(?![A-Za-z])/g, "\\$1");

/**
 * 式の断片ではなく式全体を KaTeX に組ませる。
 *
 * 綴り直しは分数・根号・項のような「戻せる部分」だけを `$…$` にするので、`x=1/2=1` は分数だけが
 * KaTeX、両端は本文フォントという継ぎ接ぎになる。同じ 1 つの式の中で書体・太さ・イタリックが
 * 変わって読みにくい。そこで式の範囲を 1 つの `$…$` にまとめる。地の文はここでも KaTeX に渡さない。
 */
const fuseMathText = (text: string): string => {
  let out = "";
  let cursor = 0;
  for (const [start, end] of mathRegions(text)) {
    out += text.slice(cursor, start) + `$${toTex(text.slice(start, end))}$`;
    cursor = end;
  }
  return out + text.slice(cursor);
};

/**
 * 式が token に割れていても 1 つの KaTeX にする。`sin`|`θ=`|`$\frac{1}{2}$` は 3 token だが
 * 画面では 1 つの式である。`$…$` は 1 つの token に収まっていなければならない。Captions は
 * token ごとに KaTeX へ渡すためである。
 */
const fuseMathTokens = (captions: Caption[]): Caption[] => {
  const regions = mathRegions(captions.map((caption) => caption.text).join(""));
  if (regions.length === 0) {
    return captions;
  }

  const merged: Caption[] = [];
  let index = 0;
  let offset = 0;
  while (index < captions.length) {
    const start = offset;
    let end = start + captions[index].text.length;
    let span = 1;
    // この token に掛かる式が次の token へ伸びている限り、まとめる範囲を広げる。
    while (index + span < captions.length) {
      const reach = Math.max(end, ...regions
        .filter(([from, to]) => from < end && to > start)
        .map(([, to]) => to));
      if (reach <= end) {
        break;
      }
      end += captions[index + span].text.length;
      span++;
    }

    const window = captions.slice(index, index + span);
    merged.push(span === 1 ? captions[index] : {
      ...window[0],
      text: window.map((caption) => caption.text).join(""),
      endMs: window[span - 1].endMs,
      pageBreakAfter: window[span - 1].pageBreakAfter,
    });
    index += span;
    offset = end;
  }
  return merged;
};

export const applyDisplaySpelling = (
  captions: Caption[],
  /** この scene が画面に出す文字列。裸の文字読みを大文字・小文字どちらに戻すかの根拠。 */
  notation = "",
): Caption[] => {
  const variables = variablesOf(notation);
  // 古い呼び出しや TTS の予想外の返答も、数式全体を結合してから直す。token ごとに囲むと
  // `\\sqrt` | `{7}` の引数や、開閉の $ が別々の MathText に入ってしまう。
  captions = normalizeCaptionMath(captions);
  const structured = structuredSpeechMatches(captions.map((caption) => caption.text).join(""));
  captions = mergeSplitWords(captions, structured.map(({ spoken }) => spoken)).map((caption) => ({
    ...caption,
    text: structured.reduce((text, { spoken, tex }) => text.split(spoken).join(`$${tex}$`), caption.text),
  }));
  const fractionMatches = Array.from(captions.map((caption) => caption.text).join("").matchAll(FRACTION));
  const fractions = [...new Set(fractionMatches.map((match) => match[0]))];
  const fractionStarts = new Set(fractionMatches.map((match) => match.index));
  // 分数を先に結合する。小さい語が分数の半分を消費してはならないためである。1 token が 1 文字の
  // 場合が最悪の分割なので、key 長で window を制限すれば多桁分数にも対応できる（旧 4 token
  // window ではできなかった）。
  const fractionMerged = mergeSplitWords(captions, fractions);
  const merged = mergeSplitWords(fractionMerged, [
    ...Object.keys(ALWAYS),
    ...Object.keys(GREEK),
    ...Object.keys(TERM_LETTERS),
    ...Object.keys(SPOKEN_SYMBOLS),
    ...ROOT_WORDS,
    ...Array.from(captions.map((caption) => caption.text).join("").matchAll(
      new RegExp(`ルート(?:[0-9]+|${Object.keys(GREEK).join("|")})`, "g")), (match) => match[0]),
  ]);
  const always = byLengthDesc(Object.entries(ALWAYS));

  let sourceOffset = 0;
  const normalised = merged.map((caption) => {
    // 小数の接頭辞が別 token にあっても、全体文脈の guard を維持する。
    let text = caption.text.replace(FRACTION, (spoken, denominator, numerator, at) =>
      fractionStarts.has(sourceOffset + at)
        ? `$\\frac{${latexAtom(numerator)}}{${latexAtom(denominator)}}$`
        : spoken);
    sourceOffset += caption.text.length;
    for (const [spoken, written] of always) {
      text = text.split(spoken).join(written);
    }
    text = applyGreek(text);
    // ギリシャ文字より後に置く。「シータ」の頭は「シー」なので、先に走らせると C になる。
    text = applyLetters(text, variables);
    text = applyGuarded(text);
    return text === caption.text ? caption : { ...caption, text };
  });
  // 累乗と根号は隣の token を見て決めるので、書き換え後の全文を文脈にして 1 段ずつ通す。
  // 前の段が文字数を変えると位置がずれるため、段ごとに文脈を取り直す。
  const pass = (
    captions: Caption[],
    apply: (text: string, context: string, offset: number) => string,
  ) => {
    const context = captions.map((caption) => caption.text).join("");
    let offset = 0;
    return captions.map((caption) => {
      const text = apply(caption.text, context, offset);
      offset += caption.text.length;
      return text === caption.text ? caption : { ...caption, text };
    });
  };
  const spelled = pass(pass(pass(pass(normalised, applyVerbOperators), applyPowers), applyRoots),
    (text, context, offset) =>
      text.replace(/以下|以上|小なり|大なり/g, (spoken, at: number) => {
        const before = context[offset + at - 1];
        return before && AFTER_NOTATION.test(before) ? SPOKEN_SYMBOLS[spoken] : spoken;
      }));
  // 綴り直しがすべて済んでから式をまとめる。先にまとめると、後段が見る文脈が TeX になる。
  return fuseMathTokens(spelled).map((caption) => {
    const text = fuseMathText(caption.text);
    return text === caption.text ? caption : { ...caption, text };
  });
};

/** 教科によらず生 TeX は修復する。数学用のカナ置換まで他教科に広げる必要はない。 */
export const normalizeCaptionMath = (captions: Caption[]): Caption[] => {
  const source = captions.map((caption) => caption.text).join("");
  const words = splitMathText(source).filter((part) => part.math)
    .map((part) => source.slice(part.start, part.end));
  return mergeSplitWords(captions, words).map((caption) => {
    const text = normalizeMathText(caption.text);
    return text === caption.text ? caption : { ...caption, text };
  });
};
