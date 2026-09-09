import type { Caption } from "@remotion/captions";

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

/**
 * ナレーションで読める綴りにした数列の項。
 *
 * synthesiser は `a_n` をアンダースコアまで含めて「a アンダーライン n」と読み、`an` に
 * 詰めると「案」と聞こえる。どちらも実測済みである。そのためナレーションでは項をカナで綴り、
 * 字幕で Unicode の下付き文字へ戻す。これは字幕で可能な限り組版に近い形である。
 */
const TERM_LETTERS: Record<string, string> = {
  エー: "a",
  ビー: "b",
  シー: "c",
  ディー: "d",
  エス: "S",
  ティー: "T",
  ピー: "P",
};

const TERM_INDICES: Record<string, string> = {
  エヌ: "\u2099",
  ケー: "\u2096",
  エム: "\u2098",
  イチ: "\u2081",
  ニ: "\u2082",
  サン: "\u2083",
  ヨン: "\u2084",
  // 漸化式の半分を成す a_{n+1} では添字を丸ごと取る必要がある。手前の `エーエヌ` を先に
  // 変換すると、「プラスイチ」が下付き文字の外に取り残される。
  エヌプラスイチ: "\u2099\u208a\u2081",
  エヌマイナスイチ: "\u2099\u208b\u2081",
};

const TERMS: Record<string, string> = Object.fromEntries(
  Object.entries(TERM_LETTERS).flatMap(([letterKana, letter]) =>
    Object.entries(TERM_INDICES).map(([indexKana, index]) => [
      letterKana + indexKana,
      letter + index,
    ]),
  ),
);

/**
 * ナレーションが読めるようカナで綴るギリシャ文字。
 *
 * 演算子と違って、これらを裸の部分文字列として置換するのは安全ではない。「アルファベット」と
 * 「パイプ」は文字名で始まるからである。判別には後続文字を使う。ギリシャ文字名の直後にさらに
 * カタカナが続けば長い単語の一部であり、ひらがな、漢字、記号、または末尾なら文字そのものである。
 */
const GREEK: Record<string, string> = {
  シータ: "θ",
  パイ: "π",
  アルファ: "α",
  ベータ: "β",
  ガンマ: "γ",
  デルタ: "δ",
  ラムダ: "λ",
  オメガ: "ω",
  // Σ を保つ。「シグマ」は統計の σ も指し、字幕には和だけを ∑ にする信頼できる文脈がない。
  // MathText はどちらの大文字 sigma code point も表示サイズの演算子にするため、統計の
  // 誤判定を増やさず一貫して見える。
  シグマ: "Σ",
};

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
 * 読み上げ用に展開した算術記号。ナレーションではこれらのカナ形を演算子用に予約し、普通の動詞は
 * 漢字で書く（"対角線を引く"）ので別 token になる。したがって出現箇所すべてで変換できる。
 */
const OPERATORS: Record<string, string> = {
  たす: "+",
  ひく: "−",
  かける: "×",
  わる: "÷",
  マイナス: "−",
  プラス: "+",
};

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

/** 前に記法があるときだけ本来の意味になるすべての語。 */
const AFTER_NOTATION_ONLY: Record<string, string> = {
  ...OPERATORS,
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
const AFTER_NOTATION =
  /[0-9A-Za-z乗√πθαβγδλωΣ°=+−×÷()/.₁₂₃₄ₖₘₙ²³⁴]/;

// 演算子と開き括弧は演算子の前に置けるが、累乗の底にはなれない。
const POWER_BASE = /[0-9A-Za-zπθαβγδλωΣ)）\]₁₂₃₄ₖₘₙ]/;
const SUPERSCRIPTS: Record<string, string> = { "2": "²", "3": "³", "4": "⁴" };

const applyPowers = (text: string, context: string, offset: number) =>
  text.replace(/(の)?([234])乗/g, (spoken, particle: string | undefined, power: string, at: number) => {
    const before = context[offset + at - 1];
    const after = context.slice(offset + at + spoken.length);
    // 「xの2乗する」は不自然でも動詞である。TTS が次 token に置く場合も含め、
    // して・しない・すれば・されるなどの活用を対象にする。
    const verbal = /^\s*(?:す[るれ]|し|さ[れせ]|せ[ずぬよ])/.test(after);
    // 裸の「12乗」は 1² でなく 12 乗である。数字の底には「の」が必要で、ナレーションも
    // 既にこれを要求している。一方 x2乗 と (x+1)2乗 は曖昧でない。
    const ambiguousDigits = !particle && before !== undefined && /[0-9]/.test(before);
    return before && POWER_BASE.test(before) && !verbal && !ambiguousDigits
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

const applyGreek = (text: string) => {
  let out = text;

  for (const [spoken, letter] of byLengthDesc(Object.entries(GREEK))) {
    let at = out.indexOf(spoken);
    while (at !== -1) {
      const next = out[at + spoken.length];
      if (next !== undefined && KATAKANA.test(next)) {
        at = out.indexOf(spoken, at + 1);
        continue;
      }
      out = out.slice(0, at) + letter + out.slice(at + spoken.length);
      at = out.indexOf(spoken, at + letter.length);
    }
  }

  return out;
};

export const applyDisplaySpelling = (captions: Caption[]): Caption[] => {
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
  ]);
  const always = byLengthDesc(Object.entries(ALWAYS));

  let sourceOffset = 0;
  const normalised = merged.map((caption) => {
    // 小数の接頭辞が別 token にあっても、全体文脈の guard を維持する。
    let text = caption.text.replace(FRACTION, (spoken, denominator, numerator, at) =>
      fractionStarts.has(sourceOffset + at) ? `${numerator}/${denominator}` : spoken);
    sourceOffset += caption.text.length;
    for (const [spoken, written] of always) {
      text = text.split(spoken).join(written);
    }
    text = applyGreek(text);
    text = applyGuarded(text);
    return text === caption.text ? caption : { ...caption, text };
  });
  const context = normalised.map((caption) => caption.text).join("");
  let offset = 0;
  return normalised.map((caption) => {
    const text = applyPowers(caption.text, context, offset);
    offset += caption.text.length;
    return text === caption.text ? caption : { ...caption, text };
  });
};
