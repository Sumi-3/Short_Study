import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "./clamped";
import { layout, shadowOf, stageBottom, useTheme, withAlpha } from "./theme";
import { MathText } from "./MathText";
import { Formula } from "./math/Formula";
import type { Scene } from "../types";
import { parseProblemOutline } from "../problemOutline";
import { useFitToStage } from "./useFitToStage";

/**
 * hook の最初の frame から見せる問題。
 *
 * この short は見返される前提なので、opening は narration より先に何を解くかを示す必要がある。
 * そうしないと最初の10秒は空画面に声だけが流れ、見返す人が戻ってきても目印がない。
 */
/**
 * frame 上端に渡す curriculum unit。
 *
 * feed 上で閲覧を止めるか決めるのはこの行である。「数I 図形と計量」なら問題文を読む前に何を練習するか
 * 分かるため、画面最上部に置き、それに見合うサイズにする。
 */
const UnitBanner: React.FC<{
  unit: string;
  accent: string;
  fontSize: number;
  top: number;
  inset: number;
}> = ({ unit, accent, fontSize, top, inset }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const appear = clamped(frame, [0, 0.4 * fps], [0, 1], theme.easing);

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: inset,
        right: inset,
        opacity: appear,
      }}
    >
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontWeight: 900,
          fontSize,
          letterSpacing: 2,
          lineHeight: 1.2,
          color: accent,
          textShadow: shadowOf(theme),
        }}
      >
        {unit}
      </div>
      <div
        style={{
          marginTop: 18,
          height: 5,
          borderRadius: 3,
          backgroundColor: withAlpha(accent, 0.45),
          transformOrigin: "left center",
          scale: `${appear} 1`,
        }}
      />
    </div>
  );
};

/** video と poster で共有する、question box 自身の枠。 */
const CARD_PADDING_Y = 26;
const CARD_PADDING_X = 30;
const CARD_BORDER = 3;
const CARD_LINE_HEIGHT = 1.55;

/** 62px は2列 card では10pxに見える。library は unit で探すため、poster ではより大きくする。 */
const UNIT_SIZE = 62;
const POSTER_UNIT_SIZE = 84;

/**
 * poster は frame の端まで使う。
 *
 * video の margin は phone UI や platform の部品が重なる場所に重要なものを置かないためにある。still card
 * にはそれが重ならず、margin に返す1 pixel ごとに question が使える幅を失う。そこで box は
 * `POSTER_SAFE_X` まで広げ、banner もそれに合わせて上げる。
 */
const POSTER_SAFE_X = 32;
const POSTER_SAFE_TOP = 56;
/** 上端 inset に置く、rule 上の84px type の unit banner を避ける位置。 */
const POSTER_TOP = 200;
/** home screen が重ねる subunit と running-time の strip 用領域。 */
const POSTER_FOOT = 180;
/**
 * poster の question box は text の高さで決めず、banner と strip の間すべてに広げる。1行問題でも
 * 6行問題と同じく、満ちた card になる。
 */
const POSTER_BOX_OUTER = layout.height - POSTER_TOP - POSTER_FOOT;
/** padding と border の内側。 */
const POSTER_BOX_HEIGHT = POSTER_BOX_OUTER - CARD_PADDING_Y * 2 - CARD_BORDER * 2;
/** box 内部。frame から safe margin、padding、border を除いた幅。 */
const POSTER_BOX_WIDTH =
  layout.width - POSTER_SAFE_X * 2 - CARD_PADDING_X * 2 - CARD_BORDER * 2;
/** 実際の text が折り返すまでに row のどこまで到達するか。 */
const PACKING = 0.92;
/** 番号付き question には hanging indent が要り、condition は全幅を使う。 */
const QUESTION_GUTTER = 1.8;

/**
 * string の組み幅を em で概算する。
 *
 * 日本語は1文字1emの正方形で、数学問題に混じる latin と数字はその少し半分超である。境界を CJK block
 * でなく latin-1 にするのは、「、】【：」「△」はいずれも code point が低くても日本語 font では全幅に
 * 組まれるためである。line 数を数えるには十分であり、それ以上の用途はない。
 */
const emsOf = (text: string) => {
  let ems = 0;
  for (const character of text) {
    ems += character.charCodeAt(0) < 0x0100 ? 0.6 : 1;
  }
  return ems;
};

/**
 * 問題全体が poster の box にまだ収まる最大サイズ。
 *
 * 文字数に対する式にはしない。question は固有の改行を保ち、改行は位置を問わず1行を終える。つまり
 * 「…求めよ。」の後に短い3行があれば、文字数にかかわらず4 rowを使う。row 数を正しく数えるには
 * segment ごとに layout するしかないため、収まるまで size を下げていく。
 *
 * 可読性の下限は設けない。condition を落とすと問題が変わるため、特に長い question は末尾を失うより
 * 小さくする。DOM fitting は、この見積もりでは数えられない divider、question gap、実際の font metrics、
 * 最後の正の size での overflow も扱う。上限は短い question 用である。「∫_0^π …を求めよ。」は28文字で、
 * box 全体を満たさせると文字が frame 高の5分の1になり、問題でなく slogan に見えた。130を超えたら
 * box には余白を残す方がよい。
 */
const posterFontSize = (segments: { text: string; numbered: boolean }[]) => {
  for (let size = 130; size > 2; size -= 2) {
    // 文字は分断せず、幅も完全には使わない。row は word または kinsoku の境界で折れ、文字の途中や、
    // 収まる最後の em で折れることはまれである。切り捨ては、そもそも1 row が4〜5文字しかない大きな
    // size で特に重要になる。hanging indent の幅を使うのは番号付き row だけで、すべての condition や
    // 番号なし question に課すと poster が早く縮む。
    const rows = segments.reduce((total, segment) => {
      const emsPerRow = Math.max(1, Math.floor(
        (POSTER_BOX_WIDTH / size) * PACKING - (segment.numbered ? QUESTION_GUTTER : 0),
      ));
      return total + segment.text.split("\n").reduce(
        (sum, line) => sum + Math.max(1, Math.ceil(emsOf(line) / emsPerRow)), 0,
      );
    }, 0);
    if (rows * CARD_LINE_HEIGHT * size <= POSTER_BOX_HEIGHT) {
      return size;
    }
  }

  return 2;
};

const ProblemCard: React.FC<{
  text: string;
  /** 分割した question。short にそれがなければ `text` へ fallback する。 */
  points: string[];
  accent: string;
  /** still card。caption は来ないため question が frame を使う。 */
  poster?: boolean;
}> = ({ text, points, accent, poster }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const { conditions, questions } = parseProblemOutline(points);
  const outlined = conditions.length + questions.length > 0;
  const lines = outlined
    ? [...conditions.map((text) => ({ text, numbered: false })),
      // 実際に下で描く内容と合わせ、番号を表示しない単独 question のために poster 見積もりが gutter を
      // 予約しないようにする。
      ...questions.map((question) => ({
        text: question.text,
        numbered: question.number !== null && questions.length > 1,
      }))]
    : [{ text, numbered: false }];
  const measured = lines.map((line) => line.text).join("\n");
  // opening は縦の空間を完全な文に使える。長い question でもまず大きくし、13行目（多くは2問目）を
  // 黙って落とさず、実際に wrap された block を fit する。poster は130pxまで見積もり、可読性下限を
  // 置かない。library には caption band がないが、長い question でもすべての condition を保つ必要がある。
  const fontSize = poster
    ? posterFontSize(lines)
    : measured.length > 200 ? 44 : measured.length > 130 ? 48
      : measured.length > 88 ? 52 : 56;
  const { viewportRef, contentRef, scale } = useFitToStage(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        opacity: clamped(frame, [0, 0.35 * fps], [0, 1], theme.easing),
        translate: clamped(frame, [0, 0.5 * fps], ["0px -24px", "0px 0px"], theme.easing),
      }}
    >
      {/* 問題 chip は置かない。card は video が最初に見せるもので、unit banner の下、question 自身の周囲に
          あるため、他に告知できるものがない。poster も一貫して chip なしである。 */}
      <div
        style={{
          /*
           * 描画する box ではなく、使える余地を知る box。以前は両者が1 element で、plate は常に stage と
           * 同じ高さになり、4行 question が12行分の空 border の中央にあった。fitter には測定対象として
           * definite な高さがなお必要なので、ここは `flex: 1` を保ち、下の見える plate だけが text に沿う。
           */
          flex: 1,
          minHeight: 0,
          fontFamily: theme.fontFamily,
          fontWeight: 700,
          fontSize,
          lineHeight: CARD_LINE_HEIGHT,
          color: theme.ink,
          textShadow: shadowOf(theme),
        }}
      >
        {/* 上限のある viewport なら shared fitter が label、divider、wrap 済み question、webfont metrics を
            まとめて数えられる。測定済み block があふれたときだけ、完全な text を nominal size より優先する。 */}
        {/* poster では利用可能な空間が分かっている。flex-sized parent 内の percentage は indefinite となって
            content とともに伸び得る。それを budget として測ると、縮めるべき overflow 自体を許してしまう。
            Thumbnail の display scale に影響されない composition pixel を使い、video の測定 path は変えない。 */}
        <div ref={viewportRef} style={{ height: poster ? POSTER_BOX_OUTER : "100%", minHeight: 0, display: "flex", alignItems: "center" }}>
          <div
            ref={contentRef}
            style={{
              width: "100%",
              flexShrink: 0,
              whiteSpace: "pre-line",
              overflowWrap: "anywhere",
              scale: String(scale),
              backgroundColor: withAlpha(theme.bgDeep, 0.72),
              border: `${CARD_BORDER}px solid ${withAlpha(accent, 0.55)}`,
              borderRadius: theme.radius,
              padding: `${CARD_PADDING_Y}px ${CARD_PADDING_X}px`,
              boxSizing: "border-box",
            }}
          >
            {outlined ? (
              <>
                {conditions.length > 0 && !poster ? (
                  // 固定 label size にして、長い question が道案内を必要とするまさにその時に、以前の0.48em
                  // heading が15pxまで縮むのを防ぐ。
                  <div style={{ color: theme.inkDim, fontWeight: 900, fontSize: 36, letterSpacing: "0.14em", lineHeight: 1.2, marginBottom: 16 }}>
                    条件
                  </div>
                ) : null}
                {conditions.map((condition, index) => (
                  <div key={index}><MathText text={condition} /></div>
                ))}
                <div style={conditions.length ? { marginTop: "0.35em", paddingTop: "0.35em", borderTop: `2px solid ${withAlpha(accent, 0.5)}` } : undefined}>
                  {questions.map((question, index) => (
                    <div key={index} style={{ display: "flex", alignItems: "baseline", gap: "0.25em", marginTop: index ? "0.25em" : 0 }}>
                      {/* gutter が要るのは番号付き row だけ。span を省くと番号なし row の flex gap も消え、
                          混在 list でもどちらも自然に wrap できる。

                          単独 question は番号なしで見せる。ただし data には番号が必要で、parser はそれで
                          question と condition を区別する。なければ「最後の行が question」へ fallback して
                          それ以前の行をすべて落とす。しかし "(1)" は要素1つの list に番号を振ることになり、
                          番号を振る対象がない。 */}
                      {question.number !== null && questions.length > 1 ? (
                        <span style={{ color: accent, fontWeight: 900, flexShrink: 0, minWidth: `${QUESTION_GUTTER - 0.25}em` }}>
                          {`(${question.number})`}
                        </span>
                      ) : null}
                      <span style={{ minWidth: 0 }}><MathText text={question.text} /></span>
                    </div>
                  ))}
                </div>
              </>
            ) : <MathText text={text} />}
          </div>
        </div>
      </div>
    </div>
  );
};

/*
 * 本当に独立した section である2 scene だけが chip を得る。
 *
 * 以前はすべての step に "POINT 1"、"POINT 2" と打っており、各々が新しい point を起こすと主張していた。
 * 多くの場合そうではない。step は前の step が始めた計算を続けるもので、新たな point と番号を付けると、
 * 新しいものがないのに読み手へ新しいものを探させてしまう。
 */
const labelFor = (scene: Scene) => {
  if (scene.visual_type === "hook") {
    return "問題";
  }
  if (scene.visual_type === "summary") {
    return "まとめ";
  }
  return null;
};

/**
 * 各 scene 共通の chrome、すなわち section chip と画面上の headline（`visual_content`）。child はその下の
 * stage 領域へ render する。
 */
/** stage の入場と退場に使う frame 数。 */
const ENTER = 8;
const LEAVE = 7;

export const SceneShell: React.FC<{
  scene: Scene;
  /** この scene 自身の長さ。`useVideoConfig()` は video 全体の長さを返す。 */
  durationInFrames: number;
  accent: string;
  /** この video が答える question。渡すのは hook だけ。 */
  problem?: { text: string; points: string[]; unit: string };
  /**
   * 再生せず still card として描く。caption は来ないため、stage は banner から frame 下端までを使い、
   * question はそこを満たす。2列の home screen では video の44pxは8px未満になる。
   */
  poster?: boolean;
  /**
   * run（FormulaRun）にまたがる舞台で、シーンごとに切り替わる見出し。`from` はこの Sequence 内の
   * frame。省略時は `scene.visual_content` を frame 0 から出す。
   */
  headings?: readonly { text: string; from: number }[];
  children?: React.ReactNode;
}> = ({ scene, durationInFrames, accent, problem, poster, headings, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const isHook = scene.visual_type === "hook";
  /*
   * question は card でも video の opening でも同じ幅に組む。card を tap して video を開いたとき、
   * reflow でなく同じ frame の続きに見せるためである。他 scene の margin は phone の部品用だが、ここで
   * その下にあるのは question だけなので、question には幅を優先する。
   */
  const inset = poster || problem ? POSTER_SAFE_X : layout.safeX;
  const label = labelFor(scene);
  // 前 step の続きを示す step は heading を空にする。その場合 stage には計算だけがあり、上で新しい
  // section を告知するものはない。
  const heading = problem ? "" : scene.visual_content;
  const headingList = problem ? [] : headings ?? (heading ? [{ text: heading, from: 0 }] : []);
  // 下に置く diagram がないなら headline が stage 全体を使う。ただし problem card がすでに使っている場合を除く。
  const centered = !scene.visual && !problem;
  const companion =
    scene.visual?.kind === "figure" || scene.visual?.kind === "plot"
      ? scene.visual
      : undefined;
  const hasCompanion = Boolean(companion?.lines?.length || companion?.caption);

  /*
   * 入退場するのは stage で、background・unit banner・caption は残る。scene は重なりのない別々の
   * `<Sequence>` なので、cut をまたいで残るものはなく、退場の 7 frame と次の入場の 8 frame は
   * 重ならずに並ぶ。つまり境界の 0.5 秒は画面がほぼ空になる（実測で ink 4% → 0.09%）。
   * 続く式変形でこれが起きないよう、連続する formula は `FormulaRun` が 1 つの舞台にまとめ、
   * この入退場を run の両端だけに置く。formula 自体を morph せず積み重ねる理由は
   * math/Formula.tsx の注記を参照。
   */
  const arrival = clamped(frame, [0, ENTER], [0, 1], theme.easing);
  const departure = clamped(
    frame,
    [durationInFrames - LEAVE, durationInFrames],
    [1, 0]);

  return (
    <AbsoluteFill
      style={{
        opacity: arrival * departure,
        // slide ではなく scale にする。slide は各 headline と formula line がすでに持つ entrance と競合する。
        scale: `${clamped(frame, [0, ENTER], [0.985, 1], theme.easing)}`,
        paddingLeft: inset,
        paddingRight: inset,
        // poster の question box は、absolute 配置で上書きされる unit banner まで届く高さがある。完全な
        // problem は利用可能高を使うため、banner（74.4 + 18 + 5px）とその rule 下32pxを明示して予約する。
        paddingTop: poster ? POSTER_TOP : problem?.unit
          ? layout.safeTop + UNIT_SIZE * 1.2 + 18 + 5 + 32 : layout.safeTop,
        // stage は caption band の前で止め、両者が重ならないようにする。poster に caption はなく、下端には
        // library 自身の strip だけがある。
        paddingBottom: poster ? POSTER_FOOT : layout.height - stageBottom,
        // question とそれに答える行は一体なので、両端へ押し分けず1 group として中央に置く。
        justifyContent: problem ? "center" : "flex-start",
      }}
    >
      {problem?.unit ? (
        <UnitBanner
          unit={problem.unit}
          accent={accent}
          fontSize={poster ? POSTER_UNIT_SIZE : UNIT_SIZE}
          top={poster ? POSTER_SAFE_TOP : layout.safeTop}
          inset={inset}
        />
      ) : null}

      {problem ? (
        <ProblemCard
          text={problem.text}
          points={problem.points}
          accent={accent}
          poster={poster}
        />
      ) : null}

      {/* question が opening 全体である。その下での言い直しは、読み手が読みたい本体と競合する。 */}
      {problem || (!label && !headingList.length) ? null : (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          flexGrow: centered ? 1 : 0,
          justifyContent: "center",
        }}
      >
      {label ? (
      <div
        style={{
          alignSelf: "flex-start",
          backgroundColor: accent,
          color: theme.bgDeep,
          fontFamily: theme.fontFamily,
          fontWeight: 900,
          fontSize: 34,
          letterSpacing: 2,
          padding: "12px 28px",
          borderRadius: theme.radius,
          opacity: clamped(frame, [0, 0.3 * fps], [0, 1], theme.easing),
          translate: clamped(
            frame,
            [0, 0.4 * fps],
            ["-40px 0px", "0px 0px"], theme.easing),
        }}
      >
        {label}
      </div>
      ) : null}

      {headingList.length ? (
      // wrap された heading も1つの title なので、短い最終行でなく block 全体に underline を引く。
      // fit-content は1行に沿い、wrap block は利用可能幅で止める。scale 依存の DOM 測定や rule と text の
      // feedback loop を要しない。
      //
      // run では見出しがシーンごとに替わる。全部を同じ grid cell に重ねて置き、見えるのを 1 つに
      // する。器の高さは常に最も高い見出しのぶんになるので、見出しが替わっても下の stage の高さは
      // 動かず、useFitToStage が測り直して数式の scale が跳ぶことがない。見出しが 1 つの従来の
      // scene では、cell が 1 つの grid は以前の block と同じ大きさに組まれる。
      <div style={{ display: "grid", width: "fit-content", maxWidth: "100%" }}>
      {headingList.map(({ text, from }, index) => {
        const local = frame - from;
        const next = headingList[index + 1]?.from;
        // 次の見出しが立ち上がる 0.15 秒のうちに退き切る。同じ場所に二つの文が重なって透けると
        // 読めないので、重ねずに順に入れ替える。
        const leaving = next === undefined ? 1 : clamped(frame - next, [0, 0.15 * fps], [1, 0]);
        return (
      <div key={index} style={{ gridArea: "1 / 1", minWidth: 0 }}>
      <div
        style={{
          marginTop: label ? (isHook ? 88 : 56) : 0,
          fontFamily: theme.fontFamily,
          fontWeight: 900,
          fontSize: isHook ? 124 : 90,
          overflowWrap: "anywhere",
          lineHeight: 1.18,
          color: theme.ink,
          textShadow: shadowOf(theme),
          opacity: clamped(
            local,
            [0.15 * fps, 0.6 * fps],
            [0, 1],
            theme.easing,
          ) * leaving,
          translate: clamped(
            local,
            [0.15 * fps, 0.7 * fps],
            ["0px 44px", "0px 0px"], theme.easing),
        }}
      >
        {/* headline には question と同じ `a_n`/`x^2` 表記があるため、同じように組版する。 */}
        <MathText text={text} />
      </div>

      {/* headline 下に wipe in する accent rule。 */}
      <div
        style={{
          marginTop: 28,
          height: 12,
          borderRadius: 6,
          backgroundColor: accent,
          width: "100%",
          transformOrigin: "left center",
          scale: `${clamped(local, [0.4 * fps, 1.1 * fps], [0, 1], theme.easing) * leaving} 1`,
        }}
      />
      </div>
        );
      })}
      </div>
      ) : null}

      </div>
      )}

      <div
        style={{
          // 余った空間を使うのは実在する diagram だけ。空の stage まで伸ばすと headline が frame 上端へ戻る。
          flexGrow: !problem && scene.visual ? 1 : 0,
          marginTop: !problem && scene.visual ? 56 : 0,
          minHeight: 0,
          overflow: "hidden",
          // grid が必要なのは combined scene だけ。既存 SVG に独立した縮小 row を与えると aspect ratio を保てる。
          // 横並び column では9:16で label と計算の幅がどちらも半減する。companion field がなければ、JSON が
          // 新しい Zod schema を通っていない旧 manifest も含め、従来の rendering path を使う。
          ...(hasCompanion ? {
            display: "grid",
            gridTemplateRows: "minmax(0, 1fr) auto",
            gap: 20,
            flexBasis: 0,
          } : {}),
        }}
      >
        {hasCompanion ? (
          <>
            <div style={{ minHeight: 0 }}>{children}</div>
            <Formula
              lines={companion?.lines ?? []}
              caption={companion?.caption ?? ""}
              accent={accent}
              compact
              durationInFrames={durationInFrames}
            />
          </>
        ) : children}
      </div>
    </AbsoluteFill>
  );
};
