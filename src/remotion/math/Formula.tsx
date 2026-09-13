import { useLayoutEffect, useRef, useState } from "react";
import {
  Box,
  Bracket,
  Circle,
  Highlight,
  StrikeThrough,
  Underline,
} from "@remotion/rough-notation";
import { Arrow } from "@remotion/shapes";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "../clamped";
import { layout, shadowOf, useTheme, withAlpha } from "../theme";
import { useFitToWidth } from "../useFitToWidth";
import { useFitToStage } from "../useFitToStage";
import { BOLD_MATH, BoldMathStyle, MathText } from "../MathText";
import { normalizeExprText } from "../../mathText";
import { FORMULA_MAX_LINES, parseFormulaLine, withoutCarry } from "../../formulaLines";
export { parseFormulaLine } from "../../formulaLines";

/**
 * 式変形の矢印。
 *
 * 以前は文字の ↓ で、線の太さをフォントに任せていた。58〜76px の数式の横では細く、字面の
 * 半分ほどしか占めないため、導出の向きを示す記号として弱かった。`@remotion/shapes` の
 * `<Arrow />` は塗りの図形なので、軸と頭の大きさを数式の大きさに比例させて決められる。
 *
 * 比率はパッケージの既定（頭幅 0.62、頭長 0.4、軸幅 0.27）を少し細めたもの。矢印が数式より
 * 目立つと、読む順が式ではなく矢印から始まってしまう。
 */
const DerivationArrow: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  // 印は Row の余白測定から外す。あの測定が拾うべきなのは rough annotation が行の外へ描く ink で、
  // この矢印は layout の中に収まっている。目印がないと矢印のある行だけ 8px 広がる。
  <span data-derivation-arrow style={{ display: "block", lineHeight: 0 }}>
    <Arrow
      direction="down"
      length={size}
      headWidth={size * 0.55}
      headLength={size * 0.38}
      shaftWidth={size * 0.22}
      cornerRadius={size * 0.03}
      fill={color}
      style={{ display: "block" }}
    />
  </span>
);

const Line: React.FC<{
  latex: string;
  text: boolean;
  delay: number;
  color: string;
  fontSize: number;
  timing: number;
  /** この行が属する segment の開始 frame。run でなければ 0。 */
  from: number;
  measureRef: (el: HTMLDivElement | null) => void;
}> = ({ latex, text, delay, color, fontSize, timing, from, measureRef }) => {
  const frame = (useCurrentFrame() - from) / timing;
  const theme = useTheme();

  return (
    <div
      ref={measureRef}
      style={{
        color,
        fontSize,
        fontFamily: text ? theme.fontFamily : undefined,
        // heading と同じ700ではなく500にする。これは formula 下の補足行で、700では説明対象の
        // formula と競合してしまう。
        fontWeight: text ? 500 : undefined,
        lineHeight: text ? 1.45 : undefined,
        whiteSpace: text ? "nowrap" : undefined,
        textAlign: text ? "left" : "center",
        // `.katex-display` は block なので container の幅を報告してしまう。shrink-wrap すれば、
        // 測定幅を formula 自身の幅にできる。
        width: "max-content",
        textShadow: shadowOf(theme),
        opacity: clamped(frame, [delay, delay + 12], [0, 1], theme.easing),
        translate: clamped(
          frame,
          [delay, delay + 16],
          ["0px 20px", "0px 0px"],
          theme.easing,
        ),
      }}
    >
      <MathText text={latex} formula={!text} />
    </div>
  );
};

/**
 * LaTeX 内の custom command ではなく外側に置く、意図的に小さい行単位の言語。prefix なら分数・
 * 入れ子 brace・aligned environment を分断せず、API の19 field scene に新しい field も要らない。
 * 空でない body を持つ既知 marker だけを消費し、通常の LaTeX と未認識の入力は既存の error-tolerant
 * renderer に通す。
 */
const annotations = {
  box: Box,
  underline: Underline,
  circle: Circle,
  highlight: Highlight,
  strike: StrikeThrough,
  bracket: Bracket,
} as const;

/** annotation が使う4px stroke と14-20px padding に対して余裕を持たせた値。 */
const ROOM_CAP = 160;

/**
 * row と、その rough mark が CSS layout の範囲外に必要とする余白。
 *
 * mark は font size から見積もらず測定する。circle の sqrt(2) の膨張や seeded wobble は文字から
 * 導けず、背の高い分数の囲みはなおさらである。padding は height fitter が扱う非 scale の pixel へ
 * 戻す必要があり、それが下の applied scale による除算の目的であると同時に危険な点でもある。guard は
 * 内部を参照。
 */

const Row: React.FC<{
  derivation: boolean;
  text: boolean;
  gap: number;
  textOffsetX: number;
  children: React.ReactNode;
}> = ({ derivation, text, gap, textOffsetX, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const scaleX = rect.width / element.offsetWidth;
      const scaleY = rect.height / element.offsetHeight;
      /*
       * applied scale を戻すと screen pixel は height fitter が扱う layout pixel へ戻る。しかし同じ数で
       * 測定誤差も割られ、この padding は fitter 自身の input の一つである。およそ10分の1を下回ると
       * loop は安定しない。縮んだ block がより大きい overflow を測り、その overflow が row を広げ、
       * 高くなった row が block を再び縮める。WebKit はこの loop で2100万 pixelの row に達し、
       * formula を見えない大きさまで縮めた。Blink はたまたま収束した。退化した測定を戻さず、最後の
       * 正常な値を保つ。
       */
      if (!(scaleX > 0.1) || !(scaleY > 0.1)) return;
      let x = 0;
      let y = 0;
      for (const svg of Array.from(element.querySelectorAll("svg"))) {
        // KaTeX の radical は clip された span の背後に意図して巨大な SVG を描く。padding に含めるべき
        // なのは rough annotation の overflow である。式変形の矢印も図形なので同じく除く。
        if (svg.closest(".katex") || svg.closest("[data-derivation-arrow]")) continue;
        if (!svg.querySelector("path")) continue;
        /*
         * layout から直接得る、screen pixel での描画 box。
         *
         * 以前は path の着地点を求める教科書的な方法である、`getBBox()` を `getScreenCTM()` 経由で
         * 変換していた。しかし絶対配置 annotation overlay の matrix について2つの engine は一致せず、
         * WebKit の結果では mark が自分の row から数百 pixel 外へ出た。client rect には matrix が不要で、
         * stroke をすでに含み、直上の `rect` と同じ方法で測定される。したがって下の差分は同種同士を
         * 比較することになる。
         */
        const markRect = svg.getBoundingClientRect();
        if (!markRect.width || !markRect.height) continue;
        // 余分な8 pixelで stroke join と DOM の丸めを覆う。手描き風 mark が非対称でも、対称の padding
        // なら equation は中央に保たれる。
        x = Math.max(
          x,
          (rect.left - markRect.left) / scaleX + 8,
          (markRect.right - rect.right) / scaleX + 8,
        );
        y = Math.max(
          y,
          (rect.top - markRect.top) / scaleY + 8,
          (markRect.bottom - rect.bottom) / scaleY + 8,
        );
      }
      // rough annotation は row の外側に1本の stroke と少しの padding を描く。これを超えるものは ink
      // ではなく測定 artefact であり、通すと誤測定が frame より高い row になる。
      x = Math.min(Math.ceil(x - 0.001), ROOM_CAP);
      y = Math.min(Math.ceil(y - 0.001), ROOM_CAP);
      setRoom((old) => old.x === x && old.y === y ? old : { x, y });
    };
    const resize = new ResizeObserver(measure);
    // annotation path は child layout effect で追加され、font swap 後にも変わる。両方を監視すれば
    // delayed render の終了前に捕捉できる。
    const mutation = new MutationObserver(measure);
    resize.observe(element);
    mutation.observe(element, { childList: true, subtree: true, attributes: true });
    measure();
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, []);
  return (
    <div
      data-formula-measure
      style={{
        alignSelf: text ? "flex-start" : "center",
        paddingBlock: Math.max(derivation ? 0 : 22, room.y),
        paddingInline: room.x,
        // placement box 全体を中心から scale すると equation は中央に残る。その transform より前に本文だけを
        // offset し、width fit 後も描画上の左端を stage の content edge に保つ。
        transform: text ? `translateX(${textOffsetX}px)` : undefined,
      }}
    >
      <div ref={ref} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap }}>
        {children}
      </div>
    </div>
  );
};

/**
 * 窓で切る run のために、各行の layout 上の位置を測る。`offsetTop` / `offsetHeight` は transform を
 * 無視するので、fitter が content に掛ける scale や、窓の translate に左右されない。
 */
const useRowGeometry = (
  stackRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
) => {
  const [rows, setRows] = useState<{ top: number; bottom: number }[]>([]);
  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!enabled || !stack) return;
    const measure = () => {
      const next = Array.from(stack.children, (child) =>
        child instanceof HTMLElement
          ? { top: child.offsetTop, bottom: child.offsetTop + child.offsetHeight }
          : { top: 0, bottom: 0 },
      );
      setRows((old) =>
        old.length === next.length &&
        old.every((row, index) => row.top === next[index].top && row.bottom === next[index].bottom)
          ? old
          : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stack);
    for (const child of Array.from(stack.children)) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [stackRef, enabled]);
  return rows;
};

/**
 * marker のない単独 formula は従来の derivation、すなわち arrow と最後の box を保つ。step は morph して
 * 消さず見せ続けるため、short を追う人が substitution とそれを正当化する formula を比較できる。
 * 明示的な marker が一つでもあれば block 全体を annotated statement にする。棄却候補と条件の間へ
 * derivation arrow を入れると、作者が意図しない数学的含意を主張してしまう。statement mode でも
 * [substitute: reason] は入ってくる edge だけを明示的につなぐ。すべての arrow を戻せば無関係な row も
 * つながる。自動 box も引き続き外すので、作者が本当の答えを marker で示す。companion line は marker が
 * なくても同じ statement layout を使う。参照先は前行とは限らず、上の diagram だからである。
 */
export const Formula: React.FC<{
  lines: string[];
  caption: string;
  accent: string;
  compact?: boolean;
  durationInFrames?: number;
  /**
   * run（FormulaRun）にまたがる描画で、各シーンの行がいつ現れるか。`lines` は segment の順に
   * 連結してあり、segment k はその `count` 行を `from` から出す。省略時は全行を frame 0 から
   * 始まる 1 つの segment として扱うので、従来の呼び出しの挙動は変わらない。
   */
  segments?: readonly { from: number; durationInFrames: number; count: number }[];
}> = ({ lines, caption, accent, compact = false, durationInFrames, segments }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  // 上限は authoring/validation の責務。rendering は fit のために row を隠さない。旧 manifest の
  // `[carry]` だけは、淡い再掲をやめたので行ごと落とす。
  const shown = withoutCarry(lines).map(parseFormulaLine);
  const derivation = !compact && shown.every(
    (line) => line.annotation === null && !line.text && !line.substitution,
  );
  /*
   * 6 row は3 rowより到着に時間がかかる。短い narration でも SceneShell の7 frame exit 前に最後の
   * answer/annotation を見せなければならない。長い scene は従来の cadence を保ち、圧縮するのは entrance
   * だけにする。
   *
   * 圧縮率は segment ごとに、その音声の尺で出す。run では後ろの segment ほど遅く始まるが、
   * 各行は自分の segment の開始 frame から数えるので、シーン内で見せていた cadence がそのまま保たれる。
   */
  const cadence = (count: number, duration?: number) => {
    const lastDelay = (0.8 + Math.max(0, count - 1) * 0.9) * fps;
    const naturalEnd = lastDelay + 45;
    const timing = duration === undefined
      ? 1
      : Math.min(1, Math.max(1, duration - 7 - fps * 0.5) / naturalEnd);
    return { timing, lastDelay };
  };
  const plan: { from: number; timing: number; delay: number }[] = [];
  const whole = { from: 0, durationInFrames, count: shown.length };
  let cursor = 0;
  for (const segment of segments ?? [whole]) {
    const own = shown.slice(cursor, cursor + segment.count);
    const { timing } = cadence(own.length, segment.durationInFrames);
    own.forEach((_, local) => plan.push({
      from: segment.from,
      timing,
      delay: (0.8 + local * 0.9) * fps,
    }));
    cursor += segment.count;
  }
  // caption は最後の segment の最後の行のあとに出る。
  const last = segments?.at(-1) ?? whole;
  const ending = cadence(Math.min(last.count, shown.length), last.durationInFrames);
  const captionFrame = (frame - last.from) / ending.timing;
  const dense = shown.length >= 3;
  // 新しい script は3–4 rowにして、より大きい maths と86%サイズの reason を読めるようにする。6 rowの
  // 旧 script は控えめな60pxで完全に残す。useFitToStage は分数・mark・caption を一つの block として
  // 収める。下の display-math margin に割く高さを減らし、height fitter が直ちにこの拡大を打ち消すのを
  // 防ぐ。実際の block が高すぎる/幅広すぎるときだけ完全性を優先し、後の answer を隠さない。
  const baseFontSize = compact ? 58
    : shown.length >= 5 ? 60 : shown.length === 4 ? 64 : dense ? 70 : 76;
  const gap = compact ? 24
    : shown.length >= 5 ? 12 : shown.length === 4 ? 18 : dense ? 26 : 36;
  // arrow は derivation を担い、次の行が上の行から従うと示す。以前の36/48/56では58-76pxの formula の
  // 横で句読点のように読めたため、各 tier を自分の行に近い大きさまで上げる。
  const arrowSize = shown.length >= 4 ? 52 : dense ? 64 : 76;
  const { viewportRef, contentRef, scale, height, width } = useFitToStage(compact);
  // compact companion は diagram 横の説明 label で、caption ではない。stage edge を共有すれば短い行を
  // 通常の statement と自然に読め、formula は中央の視覚的 anchor を保てる。
  const contentInset = 40;
  const textOffsetX = scale === 0
    ? 0
    : (contentInset - (1 - scale) * width / 2) / scale - contentInset;

  // circle の外側 ellipse は矩形 box より遠くまで達する。annotation を端で clip せず、fit 前にその余白を
  // 確保する。
  const hasCircle = shown.some((line) => line.annotation === "circle");
  const { register, fit } = useFitToWidth(
    (layout.width - layout.safeX * 2 - (derivation ? 56 : 96)) /
      (hasCircle ? Math.SQRT2 : 1),
  );
  const fontSize = baseFontSize * fit;

  /*
   * run が FORMULA_MAX_LINES を超えると、全行を積んだままでは fitter が行数ぶん縮める（latex-probe の
   * 4 シーン 9 行は 0.66 倍まで落ちた）。そこで行は流し込みのまま、高さを固定した窓で切り、segment が
   * 始まるたびに古い行を上へ送る。窓の高さは連続する FORMULA_MAX_LINES 行のうち最も高い組で決めるので、
   * 中身が入れ替わっても content の高さは動かず、useFitToStage は 1 度測った scale を保つ。行の位置は
   * offsetTop / offsetHeight から出す。どちらも transform を無視するので、fitter の scale を割り戻す
   * 帰還は生じない。1 シーンの formula と 6 行以下の run はこの経路を通らず、従来どおり全行を積む。
   */
  const windowed = Boolean(segments) && !compact && shown.length > FORMULA_MAX_LINES;
  const stackRef = useRef<HTMLDivElement>(null);
  const rows = useRowGeometry(stackRef, windowed);
  let clipHeight: number | undefined;
  let offset = 0;
  if (windowed && segments && rows.length === shown.length && rows.length) {
    clipHeight = 0;
    for (let index = 0; index < rows.length; index++) {
      const top = rows[Math.max(0, index - FORMULA_MAX_LINES + 1)].top;
      clipHeight = Math.max(clipHeight, rows[index].bottom - top);
    }
    // segment の最後の行が窓の下端に来るまで送る。送りは境界から 12 frame かけ、戻ることはない。
    let end = 0;
    let previous = 0;
    for (const segment of segments) {
      end += segment.count;
      if (end === 0) continue;
      const target = Math.max(0, rows[Math.min(end, rows.length) - 1].bottom - clipHeight);
      if (frame >= segment.from) {
        offset = clamped(frame, [segment.from, segment.from + 12], [previous, target], theme.easing);
      }
      previous = target;
    }
  }

  const rowsJsx = shown.map(({ latex, annotation, text, substitution }, index) => {
          // segment の count が行数と食い違っても描画は落とさず、最後の段の時刻に寄せる。
          const { from, timing, delay } = plan[index] ?? plan.at(-1) ?? { from: 0, timing: 1, delay: 0 };
          const revealFrame = (frame - from) / timing;
          const isLast = index === shown.length - 1;
          const kind = annotation ??
            (derivation && isLast && shown.length > 1 ? "box" : "plain");
          const Mark = kind === "plain" || kind === "carry" ? null : annotations[kind];
          const line = (
            <Line
              latex={latex}
              text={text}
              delay={delay}
              color={theme.ink}
              fontSize={text ? fontSize * 0.86 : fontSize}
              timing={timing}
              from={from}
              measureRef={register(index)}
            />
          );

          return (
            <Row
              key={index}
              derivation={derivation}
              text={text}
              gap={gap}
              textOffsetX={textOffsetX}
            >
              {substitution && index > 0 && !shown[index - 1].text ? (
                // arrow は equation の中心線上に置き、reason は横に置く。幅を限った prose column なら長い
                // label を切らずに wrap できる。全高と gap は Row 内にあるため、diagram companion を含めて
                // useFitToStage が余白を確保する。この幅は fit 結果から独立しており、測定した scale を
                // layout input に割り戻さない。
                <div data-formula-substitution style={{
                  display: "grid", gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center", columnGap: 16,
                  width: compact ? 620 : 720,
                  opacity: clamped(revealFrame, [delay - 8, delay], [0, 1]),
                }}>
                  <span style={{ gridColumn: 2, lineHeight: 1 }}>
                    <DerivationArrow size={arrowSize} color={accent} />
                  </span>
                  {/* 説明は 700 で組むので、中の数式も同じ太さで組ませる（MathText.tsx の BOLD_MATH 参照）。 */}
                  <BoldMathStyle />
                  <span className={BOLD_MATH} style={{
                    gridColumn: 3, minWidth: 0, fontFamily: theme.fontFamily,
                    fontWeight: 700, fontSize: fontSize * 0.7, lineHeight: 1.35,
                    color: theme.ink, overflowWrap: "anywhere", whiteSpace: "normal",
                  }}>
                    {/*
                      「x=2 を代入」のような説明は、プロンプトが本文表記で書かせる約束なので `$` を
                      持たない。本文の規則では `\` も `^` も無い式に数式の証拠がなく、そのまま地の文として
                      組まれていた。式専用として読み直し、`x=2` だけを数式にして「を代入」は文に残す。
                      display を切るのは、行内の label で分数を全高に伸ばさないためである。
                    */}
                    <MathText text={normalizeExprText(substitution)} display={false} />
                  </span>
                </div>
              ) : derivation && index > 0 ? (
                <div
                  style={{
                    lineHeight: 1,
                    opacity: clamped(revealFrame, [delay - 8, delay], [0, 1]),
                  }}
                >
                  <DerivationArrow size={arrowSize} color={accent} />
                </div>
              ) : null}

              {Mark ? (
                <Mark
                  color={kind === "highlight" ? withAlpha(accent, 0.28) : accent}
                  strokeWidth={4}
                  padding={{ top: 14, right: 20, bottom: 14, left: 20 }}
                  {...(kind === "bracket" ? { bracketLeft: true, bracketRight: true } : {})}
                  {...(kind === "circle" ? { box: "around" as const } : {})}
                  progress={clamped(revealFrame, [delay + 18, delay + 45], [0, 1])}
                >
                  {line}
                </Mark>
              ) : line}
            </Row>
          );
        });

  return (
    <div
      ref={viewportRef}
      data-formula-viewport
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: compact ? height * scale : "100%",
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <div
        ref={contentRef}
        data-formula-content
        className={derivation ? "formula-derivation" : "formula-statements"}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap,
          // 外側の24px reserve には line の20px entrance motion も含む。この自然な block を scale すれば、
          // 固定サイズの gap をすべて含められる。
          padding: "24px 40px",
          flexShrink: 0,
          // これは width-fit の測定 box ではなく placement box。text row は左端から始めつつ、maths は中央に
          // 置ける。
          width: "100%",
          scale: String(scale),
          transformOrigin: "center",
          boxSizing: "border-box",
          minWidth: 0,
        }}
      >
        {/* default の1em margin では60pxの6 rowで720pxを空白に使い、短い equation まで縮めざるを得ない。
            1/4em と既存の gap/arrow なら derivation を明瞭に保てる。statement mark は依然として実際の
            mathematical ink だけを囲む。 */}
        <style>{`.formula-derivation .katex-display { margin: 0.25em 0; }
          .formula-statements .katex-display { margin: 0; }
          /* 代入の説明は文と式の混在で、列幅を超えたら折り返してよい。ただし KaTeX の出力は
             inline span の列なので、放っておくと式の内側で割れて「AB =」「2, R = 2」になる。
             式のまとまりだけを不可分にし、折り返しは式と文の境目に落とす。 */
          [data-formula-substitution] .katex { white-space: nowrap; }`}</style>
        {windowed ? (
          // 窓の高さは measured な行位置から出す。測り終えるまでは切らずに流し、最初の layout で確定する。
          <div
            style={{
              // 切るのは縦だけ。`overflow: hidden` は横も切るので、行が content の内幅（904 − 80 の
              // padding）より広いと両端が欠ける。幅の予算は useFitToWidth が 848 に収めるが、annotation の
              // 余白（最大 160px × 2）はその外に出るので、左右に 200px ずつ余裕を持たせて箱を広げ、
              // 同じ量の padding で行の中心を元の位置に戻す。
              width: "100%",
              marginInline: -200,
              paddingInline: 200,
              boxSizing: "content-box",
              height: clipHeight,
              overflow: clipHeight === undefined ? undefined : "hidden",
              // 送り出される行は上端で消える。境界で急に欠けて見えないよう、動き始めた分だけ上端を透かす。
              ...(offset > 0 ? {
                maskImage: `linear-gradient(to bottom, transparent 0, black ${Math.min(48, offset)}px)`,
                WebkitMaskImage: `linear-gradient(to bottom, transparent 0, black ${Math.min(48, offset)}px)`,
              } : {}),
            }}
          >
            <div
              ref={stackRef}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap,
                translate: `0px ${-offset}px`,
              }}
            >
              {rowsJsx}
            </div>
          </div>
        ) : rowsJsx}

        {caption ? (
          <div
            ref={register(shown.length)}
            data-formula-measure
            style={{
              // 増えた text 高の大半を、以前の空の margin から取り戻す。width fit と stage fit はどちらも
              // caption と mark を含む。5–6 row と diagram companion は常に縮まないよう低い位置から始める。
              marginTop: compact ? 0 : dense ? 8 : 16,
              fontFamily: theme.fontFamily,
              fontWeight: 700,
              fontSize: (compact ? 46 : shown.length >= 5 ? 48 : shown.length === 4 ? 52 : dense ? 56 : 60) * fit,
              lineHeight: 1.3,
              width: "max-content",
              color: accent,
              textShadow: shadowOf(theme),
              opacity: clamped(captionFrame, [ending.lastDelay + 20, ending.lastDelay + 40], [0, 1]),
            }}
          >
            {/* caption も $…$ を含み得る本文。生のままだと $ が画面に出る。 */}
            <MathText text={caption} />
          </div>
        ) : null}
      </div>
    </div>
  );
};
