/**
 * The parts of the system prompt that do not depend on the course: how the
 * narration has to sound for the speech synthesiser, and how the visual payload
 * is encoded. Each course composes these around its own teaching instructions.
 */

/**
 * Characters of narration per second at EDGE_RATE=+8%, measured on finished
 * videos.
 *
 * Maths runs slower per character than prose: "AC" is two characters but four
 * morae, "98" is two characters but seven. Budgeting both at the same rate is
 * what made the maths shorts overshoot by a third.
 */
const CHARS_PER_SECOND = { math: 4.6, prose: 5.2 } as const;

export type Budget = {
  seconds: number;
  /** How many `point` scenes fit between the fixed hook and summary. */
  points: number;
  totalChars: number;
  perScene: number;
};

export const budgetFor = (
  targetSeconds: number,
  pace: keyof typeof CHARS_PER_SECOND = "prose",
): Budget => {
  const points = Math.max(2, Math.min(4, Math.round((targetSeconds - 14) / 11)));
  const totalChars = Math.round(targetSeconds * CHARS_PER_SECOND[pace]);

  return {
    seconds: targetSeconds,
    points,
    totalChars,
    // Stated per scene as well: a total is easy to blow past one scene at a
    // time without noticing.
    perScene: Math.round(totalChars / (points + 2)),
  };
};

export const narrationRules = (budget: Budget) => `# narration（音声読み上げ用）
narration はそのまま字幕にもなる。読み上げが正しく、かつ字幕として読みやすい表記にする。

- 話し言葉。ですます調。1文は短く、40文字以内を目安に切る。
- 箇条書き記号、括弧書きの補足、URL、絵文字、Markdown は使わない。
- **1シーンのnarrationは${budget.perScene}文字以内**。全${budget.points + 2}シーンで合計${budget.totalChars}文字前後
  （${budget.seconds}秒相当）に収める。大きく下回ると説明が駆け足になる。

## そのまま書いてよいもの（正しく読まれることを実測済み）
- 算用数字: 98、60、2.65 →「きゅうじゅうはち」等。**漢数字にしない**
- 英字の並び: AB、AC、CP、ABC →「エービー」等。**カタカナ読みにしない**
- 分数 1/2 →「2ぶんの1」。**「2ぶんの1」と書かず「1/2」と書く**
- 根号 √7 →「ルート7」

## 音にならないので必ず日本語の語に開くもの
- = は完全に無音になる → 「イコール」または「は」と書く
- + - × ÷ → 「たす」「ひく」「かける」「わる」
- x^2 → 「xの2乗」
- cos sin は綴りのまま1文字ずつ読まれてしまう → 「コサイン」「サイン」と書く
  （tan, log はそのままで正しく読まれる）
- 数字とカタカナを直接つなげない。「98コサインB」ではなく「98かけるコサインB」。
  つなげると読み上げの語の切れ目がずれる

字幕では コサイン→cos、イコール→=、かける→× のように自動で記号に戻して表示される。
読み上げのための表記なので、遠慮なくカタカナで書いてよい。`;

export const VISUAL_CONTENT = `# visual_content（画面に出す文字）
- narrationの要約ではなく、narrationを聞きながら読んで理解が進む短い言葉。
- 12文字以内の短いフレーズを基本とする。文にしない。
- hookのvisual_contentは一覧のサムネイルにもなる。何の話なのかが一目で分かる言葉にする。`;

const VISUAL_DOCS = {
  bullets: `- "bullets": 並列な要素を列挙する
    visual_items = 各項目12文字以内、1〜4個`,
  flow: `- "flow":    順序・因果・手順を示す。矢印でつながって上から順に出る
    visual_items = 各ステップ8文字以内、2〜4個`,
  bars: `- "bars":    量の比較が意味を持つときだけ。データは確かなものに限る
    visual_bars = 2〜5本、visual_unit = 単位`,
  formula: `- "formula": 定義式・公式・式変形を見せる
    visual_items = LaTeX の行を1〜3個。複数行なら上から順に導出として表示され、最後の行が囲まれる
    例: ["(a+b)^2", "a^2 + 2ab + b^2"]
    例: ["f'(x) = \\\\lim_{h \\\\to 0} \\\\frac{f(x+h) - f(x)}{h}"]
    visual_caption = 12文字以内の補足（不要なら空文字列）
    1行が長いと自動で縮小されて読みにくくなる。1行は短く保ち、長い式は行を分ける
    日本語を混ぜるときは必ず \\text{} で囲む
    （"極大値10" は数式扱いになって崩れる。"\\text{極大値}10" と書く）`,
  plot: `- "plot":    座標平面。グラフ・曲線・領域を見せる
    visual_curves = 1〜3本。それぞれ {expr, expr_y, label, region}
      expr は x の式。使えるのは
        数字 x + - * / ^ ( ) と sin cos tan sqrt abs exp ln log と pi e のみ
        （例: "x^2", "2*x+1", "sqrt(x)", "-(x-2)^2+4"）
      expr_y を書くと媒介変数曲線になる。expr が x(t)、expr_y が y(t) で、変数は t
        円 x²+y²=9      : expr="3*cos(t)", expr_y="3*sin(t)"
        楕円 x²/16+y²/4=1: expr="4*cos(t)", expr_y="2*sin(t)"
        サイクロイド     : expr="t-sin(t)", expr_y="1-cos(t)"
        y=f(x) で書けるものには使わない。expr_y は空文字列にする
      region に "above" か "below" を入れると、その曲線の上側／下側が塗られる
        複数の曲線に付ければ、その全部を満たす部分（連立不等式の領域）が塗られる
        例: y≧x² かつ y≦6 → 1本目 region="above"、2本目 expr="0*x+6" region="below"
        不要なら空文字列
      label は10文字以内の凡例（不要なら空文字列）
    visual_range = [xの最小, xの最大, yの最小, yの最大]。曲線が収まる範囲にする
        媒介変数曲線の t の範囲を変えたいときだけ、後ろに [tの最小, tの最大] を足して6数値
        （既定は0〜2π。サイクロイド2山なら [0, 12.6] を足す）
        **円を丸く描きたいときは x の幅と y の幅を等しくする**（例: [-5,5,-5,5]）
    visual_shade = [開始x, 終了x]。定積分の面積を塗るとき、または領域のx範囲を切るとき
        不要なら空配列
    visual_points = 印をつける点。接点・交点・解など「答えになる点」があるときだけ
        [{x, y, label}] を1〜3個。label は "(-1, -1)" のような短い文字列。不要なら空配列`,
  figure: `- "figure":  図形そのものを描く。三角形・円・立体など、幾何の問題では必ず使う
    visual_points  = 頂点。label が名前であり、他のフィールドから参照するidにもなる
        [{x, y, label}] を2〜8個。座標は自分で計算した正しい値を入れる
        単位は自由。図全体が自動で画面に合わせて拡大縮小される（縦横は同じ倍率）
    visual_segments = 線分。[{from, to, label, dashed, emphasis, ticks, arrow}] を1〜10本
        from / to は visual_points の label
        label = 長さなどの短い文字（不要なら空文字列）
        dashed = true で破線。立体を平面に描くときの「隠れた辺」に使う
        emphasis = true でアクセント色の太線。求めるものを1本だけ強調する
        ticks = 等しい辺の印の本数（0〜3）。**同じ本数の辺どうしが等しい**
            合同・相似の証明では、対応する辺に同じ本数を付ける。不要なら0
        arrow = true で to 側に矢じり。ベクトルはこれで描く
    visual_angles   = 角の印。[{at, from, to, label, ticks}] を0〜3個
        at が頂点、from と to がその両側の点。90度なら自動で直角記号になる
        ticks = 等しい角の印の本数（0〜3）。同じ本数の角どうしが等しい
    visual_circles  = 円・弧・扇形。[{center, radius, label, dashed, from_angle, to_angle, sector}] を0〜3個
        center は visual_points の label（中心も点として置く）
        radius は visual_points と同じ単位。label は "r=2" などの短い文字
        from_angle と to_angle は度。**同じ値なら円全体**、違えばその間の弧
            角度は反時計回りで、真右が0度。円周角なら対応する弧をこれで強調する
        sector = true で中心まで塗って扇形にする（弧度法・扇形の面積）
    visual_highlight = 塗りつぶす面。頂点idの配列（例: ["A","B","C"]）。不要なら空配列
    visual_unit = "axes" と書くと座標軸を描く。複素数平面・位置ベクトル・座標の問題のとき
        2つの図形を見比べさせたいときは、離れた座標に両方を置けばよい
        （△ABCを x=0〜3、△DEFを x=5〜8 に置く。全体が自動で画面に収まる）`,
  table: `- "table":    表。行と列で意味が決まるものは、箇条書きでも式でも代用できない
    visual_table = 1行ずつの配列。2〜6行、1行あたり1〜8セル
        1行目と1列目は見出しとして色が付く
    増減表はこの形で書く（区間と点を交互に並べる）:
        [["x", "…", "-1", "…", "3", "…"],
         ["f'(x)", "+", "0", "-", "0", "+"],
         ["f(x)", "↗", "極大", "↘", "極小", "↗"]]
        増加は ↗、減少は ↘ を使う。区間は "…" で表す
    visual_caption = 12文字以内の補足（不要なら空文字列）`,
  tree: `- "tree":     樹形図。場合の数・確率で、数え落としがないことを見せる
    visual_table = 起点から末端までの経路を1行ずつ並べる。2〜12行、1行1〜5個
        共通する前半は自動でまとめられて枝分かれになる
        例（コイン2回）: [["表","表"],["表","裏"],["裏","表"],["裏","裏"]]
        → 表と裏の2本が最初に分かれ、それぞれがまた2本に分かれる図になる
    行数がそのまま「全◯通り」として自動で表示される。数え上げた通りに書けばよい
    visual_caption = 12文字以内の補足（不要なら空文字列）`,
  venn: `- "venn":     ベン図。集合の重なりや、少なくとも一方・両方の個数を扱うとき
    visual_items  = 集合の名前を2個または3個（例: ["犬派","猫派"]）
    visual_values = 各領域の個数を決まった順に
        2集合: [Aだけ, AとBの両方, Bだけ, どちらでもない]
        3集合: [Aだけ, Bだけ, Cだけ, AとBだけ, BとCだけ, AとCだけ, 3つすべて, どれでもない]
    visual_highlight = 答えにあたる領域を塗る。"A" "B" "C" "AB" "BC" "AC" "ABC" "none"
        から選んで入れる（複数可）。不要なら空配列
    visual_caption = 12文字以内の補足`,
  histogram: `- "histogram": 度数分布。階級が連続しているとき（棒がくっつく）
    visual_range  = [いちばん下の階級の下限, いちばん上の階級の上限] の2数値
    visual_values = 各階級の度数を下から順に2〜12個
        階級の幅は range を個数で等分したものになる（等しい幅にする）
        例: range=[30,90], values=[2,5,9,6,3,1] なら 30〜40が2人、40〜50が5人…
    visual_unit   = 横軸の単位（例: "点", "cm"）
    visual_points = 平均値・中央値・最頻値などの基準線。x に値、label に名前、y は0
    visual_caption = 12文字以内の補足（不要なら空文字列）`,
  box: `- "box":      箱ひげ図。5数要約を見せる、または2〜3群を比較する
    visual_values = 最小値, 第1四分位数, 中央値, 第3四分位数, 最大値 の順に5個
        2群を比べるなら 5個 + 5個 の計10個を続けて並べる（最大3群）
        各組は必ず小さい順にする
    visual_items  = 群の名前（例: ["A組","B組"]）。1群だけなら空配列でよい
    visual_unit   = 数直線の単位
    visual_caption = 12文字以内の補足`,
  scatter: `- "scatter":  散布図。2つの量の相関を見せる
    visual_points = データ点 [{x, y, label}] を3〜40個。label は空文字列でよい
    visual_range  = [xの最小, xの最大, yの最小, yの最大]
    visual_items  = [x軸の名前, y軸の名前]（例: ["身長", "体重"]）
    visual_curves = 相関の傾向線を引くときだけ1本。expr は plot と同じ書式
        （例: [{expr: "0.8*x+12", label: ""}]）。不要なら空配列
    visual_caption = 12文字以内の補足`,
  dot: `- "dot":      ドットプロット。1つの値を1つの点として数直線に積む
    データが少なく（20個程度まで）、代表値の意味を見せたいときに使う
    visual_values = 生のデータ。数値を2〜40個
    visual_unit   = 数直線の単位
    visual_points = 平均値・中央値・最頻値。x に値、label に名前、y は0。0〜3個
    visual_caption = 12文字以内の補足`,
} as const;

export type VisualKind = keyof typeof VISUAL_DOCS;

/**
 * Only the kinds a course can actually use are documented. A history script has
 * no business reading the LaTeX and plotting rules — leaving them out is both
 * cheaper and a much stronger signal than telling the model not to use them.
 */
export const visualSection = (
  kinds: readonly VisualKind[],
  fallback: VisualKind,
) => {
  const bothMathKinds = kinds.includes("formula") && kinds.includes("plot");

  return `# visual（図解データ・任意）
シーンの内容に一番合うものを選ぶ。ここに書かれていない kind は使わない。迷ったら "${fallback}"。

${kinds.map((kind) => VISUAL_DOCS[kind]).join("\n")}
- "none":    hookなど、大きな一言だけを見せたいとき

未使用のフィールドは必ず空（空配列 / 空文字列）にする。${
    bothMathKinds
      ? `
LaTeX と expr は別物。formula は LaTeX、plot の expr は上に挙げた記号だけの素の式。`
      : ""
  }`;
};

export const structureHeading = (budget: Budget) => `# 構成
1. hook: 1シーン。最初の3秒で手を止めさせる一言。
2. point: ${budget.points}シーン。1シーンにつき要点は1つだけ。前のシーンを受けて積み上げる。
3. summary: 1シーン。要点を束ねて、持ち帰る一文で締める。`;

export const COMMON_RULES = `- scene_idは1から連番。
- 事実に自信がないことは書かない。数値を出すなら確かなものだけ。
- 専門用語は初出時に一言で言い換える。`;
