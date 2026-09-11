import { createContext, useContext } from "react";
import { Easing } from "remotion";

/** 端末搭載フォントだけを使う。ここでダウンロードするものはない。 */
const stack = (...system: string[]) =>
  [...system.map((s) => `"${s}"`), "sans-serif"].join(", ");

/**
 * 字形よりウェイトを優先して選んだ端末搭載フォント。
 *
 * iPhone の丸ゴである Hiragino Maru Gothic ProN は以前この先頭だった。しかし収録される
 * master は1つだけで、どのウェイトも `HiraMaruProN-W4` に解決される。そのため下で要求する
 * 700 と900は、設計された書体ではなくエンジンが輪郭を太らせる *synthetic* bold で描かれ、
 * 字幕がにじんだ。Hiragino Sans は各要求に実在する master を返す（W2/W3/W4/W5/W6/W8 を
 * 実測）ので、ウェイトの階層を保てる。iOSでは複数ウェイトを持つ丸ゴがないため、丸みは
 * ウェイトとの引き換えになる。
 */
const ROUNDED = stack("Hiragino Sans", "Noto Sans CJK JP");

export type Theme = {
  bg: string;
  bgDeep: string;
  ink: string;
  inkDim: string;
  /** 隣接シーンで同じ accent にならないよう、シーンごとに循環させる。 */
  accents: readonly string[];
  /**
   * 難易度の星。accent の循環には入れない。
   *
   * 星は単元ではなく問題の重さを表すので、単元ごとに色が変わってはいけない。明るい
   * ボード上で金色として読め、かつ accent の青とも警告の赤とも混同しない濃さにする。
   */
  star: string;
  fontFamily: string;
  /** 背景のにじみをどの程度透かして見せるか。 */
  veil: string;
  /** chip と card の角丸。小さいほど硬く、フォーマルに読まれる。 */
  radius: number;
  /** 動きの性格。ゆっくり柔らかくするか、きびきび直接的にするか。 */
  easing: (input: number) => number;
  /** 明るい plate で、濃い字幕の ink を背景のにじみから分ける。 */
  plate: string;
  /** 薄い shadow にして、ボード上の濃い文字を濁らせない。 */
  textShadow: string;
  /** 背景のにじみがボードを支配しないよう、marker colour を抑える。 */
  wash: number;
};

/** marker colour は明るいボード上でも文字として読めなければならない。 */
const whiteboard: Theme = {
  bg: "#FBFBF9",
  bgDeep: "#E7E9EC",
  ink: "#16202E",
  inkDim: "rgba(22,32,46,0.56)",
  accents: ["#1F6FEB", "#D92D20", "#0E9F6E", "#7C3AED", "#B45309"],
  star: "#F5A524",
  fontFamily: ROUNDED,
  veil: "rgba(255,255,255,0.5)",
  radius: 12,
  easing: Easing.bezier(0.3, 0.9, 0.2, 1),
  plate: "rgba(255,255,255,0.78)",
  textShadow: "0 2px 10px rgba(22,32,46,0.14)",
  wash: 0.3,
};

const ThemeContext = createContext<Theme>(whiteboard);
export const ThemeProvider = ThemeContext.Provider;
export const useTheme = () => useContext(ThemeContext);

export const accentFor = (theme: Theme, index: number) =>
  theme.accents[index % theme.accents.length];

/** `#rrggbb` → `rgba(...)`。gradient には明示的な alpha stop が要る。hex から
 * `transparent` へ直補間すると、一部エンジンでは透明な *black* を経由して暗い輪が残る。 */
export const withAlpha = (hex: string, alpha: number) => {
  const int = parseInt(hex.slice(1), 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
};

/** 1080x1920。重要な内容はこの余白内に置く。 */
export const layout = {
  width: 1080,
  height: 1920,
  safeX: 88,
  safeTop: 120,
  /**
   * 字幕は固定の上端からではなく、フレームの *bottom* を基準にする。行数で高さが変わるため、
   * 下端から測れば端との距離を一定に保ち、stage があらかじめ空けた領域へ上方向に伸ばせる。
   *
   * 以前の190px insetを100pxにすると、diagram/working の stage に90pxを返せる。幅390pxの
   * 全画面スマホプレビューでは約36 CSS px（100 * 390 / 1080）となり、およそ34pxの
   * home-indicator inset を許容する。これは全画面視聴のための余白であり、各SNSアプリの
   * overlay を保証するものではない。端まで詰めず100pxを残すことで edge buffer を確保する。
   * band と gap は変えないため、字幕は引き続き完全な2行を使える。
   */
  captionBottom: 100,
  /**
   * 字幕は stage より横に広げる。
   *
   * `safeX` の 88px は stage 側の余白である。あちらは unit banner や見出しと同じ列に数式や図を
   * 並べるため、端から離すことで縦の通りをそろえている。字幕は下端に浮かぶ plate 1枚で、
   * 隣に並ぶものが無く、背景色の付いた角丸自身が境界として見える。したがって端に寄せても
   * 窮屈にならず、余白は edge buffer としてだけ要る。
   *
   * 48px は幅390pxの全画面スマホプレビューで約17 CSS px（48 * 390 / 1080）にあたり、角丸や
   * 縁の反射を避けるには足りる。内幅は 1080 − 2×48 − 2×32（plate padding）= 920px になり、
   * 88px のときの 840px から 1 行あたり約1文字ぶん広がる。
   */
  captionSafeX: 48,
  /** 66px/1.3 の2行に plate の20px padding を足し、切り上げた値。 */
  captionBandHeight: 212,
  /** stage と最大高の字幕の間に残す余白。 */
  captionGap: 44,
} as const;

/** 完全な2行字幕の上端。scene の stage はここで止める。 */
export const stageBottom =
  layout.height -
  layout.captionBottom -
  layout.captionBandHeight -
  layout.captionGap;

/** 保存済みデータを書き換えず、旧 manifest にも現在の見た目を共有させる。 */
export const themeOf = (): Theme => whiteboard;

export const shadowOf = (theme: Theme) => theme.textShadow;
export const plateOf = (theme: Theme) => theme.plate;
