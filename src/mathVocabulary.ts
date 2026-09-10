/** 区切りのない旧台本の数式をTTSで読める形にするための語彙。 */
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

export const COMMAND_READINGS: Record<string, string> = {
  theta: "シータ", pi: "パイ", alpha: "アルファ", beta: "ベータ", gamma: "ガンマ",
  delta: "デルタ", lambda: "ラムダ", omega: "オメガ", Sigma: "シグマ",
  sin: "サイン", cos: "コサイン", tan: "タンジェント", lim: "リミット",
  le: "以下", leq: "以下", ge: "以上", geq: "以上", ne: "ノットイコール", neq: "ノットイコール",
  to: "矢印", rightarrow: "矢印", infty: "無限大",
  times: "かける", cdot: "かける", div: "わる", pm: "プラスマイナス",
  lt: "小なり", gt: "大なり",
};
