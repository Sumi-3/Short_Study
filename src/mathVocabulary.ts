/** 読みと字幕で別々の表を持つと、TTS に直した語を字幕で復元できなくなるため共用する。 */
/**
 * ナレーションで読める綴りにした数列の項。
 *
 * synthesiser は `a_n` をアンダースコアまで含めて「a アンダーライン n」と読み、`an` に
 * 詰めると「案」と聞こえる。どちらも実測済みである。そのためナレーションでは項をカナで綴り、
 * 字幕で `$a_{n}$` の LaTeX へ戻して KaTeX に組ませる。以前は Unicode の下付き文字だったが、
 * 字体が本文と揃わず `n+1` のような添字も作れなかった。
 */
export const TERM_LETTERS: Record<string, string> = {
  エー: "a",
  ビー: "b",
  シー: "c",
  ディー: "d",
  エス: "S",
  ティー: "T",
  ピー: "P",
};

export const TERM_INDICES: Record<string, string> = {
  エヌ: "n",
  ケー: "k",
  エム: "m",
  イチ: "1",
  ニ: "2",
  サン: "3",
  ヨン: "4",
  // 漸化式の半分を成す a_{n+1} では添字を丸ごと取る必要がある。手前の `エーエヌ` を先に
  // 変換すると、「プラスイチ」が添字の外に取り残される。
  エヌプラスイチ: "n+1",
  エヌマイナスイチ: "n-1",
};

export const TERMS: Record<string, string> = Object.fromEntries(
  Object.entries(TERM_LETTERS).flatMap(([letterKana, letter]) =>
    Object.entries(TERM_INDICES).map(([indexKana, index]) => [
      letterKana + indexKana,
      `$${letter}_{${index}}$`,
    ]),
  ),
);

/**
 * ナレーションが読めるようカナで綴るギリシャ文字。
 *
 * 演算子と違って、これらを裸の部分文字列として置換するのは安全ではない。「アルファベット」と
 * 「パイプ」は文字名で始まるからである。判別には後続文字を使う。ギリシャ文字名の直後にさらに
 * カタカナが続けば長い単語の一部とみなす。ただし別の数学語の連続は、文字名の積や演算子である。
 */
export const GREEK: Record<string, string> = {
  シータ: "θ",
  パイ: "π",
  アルファ: "α",
  ベータ: "β",
  ガンマ: "γ",
  デルタ: "δ",
  ラムダ: "λ",
  オメガ: "ω",
  // Σ を保つ。「シグマ」は統計の σ も指し、字幕には和だけを ∑ にする信頼できる文脈がない。
  シグマ: "Σ",
};

export const COMMAND_READINGS: Record<string, string> = {
  theta: "シータ", pi: "パイ", alpha: "アルファ", beta: "ベータ", gamma: "ガンマ",
  delta: "デルタ", lambda: "ラムダ", omega: "オメガ", Sigma: "シグマ",
  sin: "サイン", cos: "コサイン", tan: "タンジェント", lim: "リミット",
  le: "以下", leq: "以下", ge: "以上", geq: "以上", ne: "ノットイコール", neq: "ノットイコール",
  to: "矢印", rightarrow: "矢印", infty: "無限大",
  times: "かける", cdot: "かける", div: "わる", pm: "プラスマイナス",
  lt: "小なり", gt: "大なり",
};

/** 普通の「以上」「以下」は文章にも現れるため、字幕では直前に式のある位置だけに使う。 */
export const SPOKEN_SYMBOLS: Record<string, string> = {
  ノットイコール: "≠", 矢印: "→", 無限大: "∞", 以下: "≤", 以上: "≥",
  小なり: "<", 大なり: ">",
};
