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

/**
 * Budget for the 300s Vercel function: reserve 170s for script generation,
 * 20s for outline/captions/manifest/upload, and 30s for variance. The remaining
 * 80s allow ten sequential TTS requests at an assumed 8s each. This is a
 * conservative operating budget, not a latency guarantee: existing manifests
 * record playback (16 projects, 4–6 scenes, 25–70s), NOT synthesis wall time.
 * Revisit these assumptions with production timing, especially for Whisper.
 * 120s of estimated speech and 20s per scene also bound request size; neither
 * is a target to fill. Actual playback is determined by TTS plus scene padding.
 */
export const MAX_SCRIPT_SCENES = 10;
const MAX_NARRATION_SECONDS = 120;
const MAX_SCENE_SECONDS = 20;

export type Budget = {
  seconds: number;
  maxScenes: number;
  /** Maximum point count with one hook and one summary, never a quota. */
  points: number;
  totalChars: number;
  perScene: number;
};

export const budgetFor = (
  pace: keyof typeof CHARS_PER_SECOND = "prose",
): Budget => ({
  seconds: MAX_NARRATION_SECONDS,
  maxScenes: MAX_SCRIPT_SCENES,
  points: MAX_SCRIPT_SCENES - 2,
  totalChars: Math.floor(MAX_NARRATION_SECONDS * CHARS_PER_SECOND[pace]),
  perScene: Math.floor(MAX_SCENE_SECONDS * CHARS_PER_SECOND[pace]),
});

/** Validate before TTS; silently slicing scenes could drop a requested answer. */
export const assertScriptBudget = (
  scenes: readonly { narration: string }[],
  budget: Budget,
) => {
  if (scenes.length > budget.maxScenes ||
      scenes.some((scene) => scene.narration.length > budget.perScene) ||
      scenes.reduce((sum, scene) => sum + scene.narration.length, 0) > budget.totalChars) {
    throw new Error(`解説が生成上限（${budget.maxScenes}シーン・合計${budget.totalChars}文字・1シーン${budget.perScene}文字）を超えました。問題を設問ごとに分けてください。`);
  }
};

export const scriptMaxTokens = (budget: Budget) => 12_000 + budget.maxScenes * 1_500;

export const narrationRules = (budget: Budget) => `# narration（音声読み上げ用）
narration はそのまま字幕にもなる。読み上げが正しく、かつ字幕として読みやすい表記にする。

- 話し言葉。ですます調。1文は短く、40文字以内を目安に切る。
- 箇条書き記号、括弧書きの補足、URL、絵文字、Markdown は使わない。
- **1シーンは最大${budget.perScene}文字、全体は最大${budget.maxScenes}シーン・合計${budget.totalChars}文字**（読み上げ換算で最大約${budget.seconds}秒）。
  これは生成処理を守る上限で、目標ではない。必要な説明が済んだら終える。短くても水増ししない。

## そのまま書いてよいもの（正しく読まれることを実測済み）
- 算用数字: 98、60、2.65 →「きゅうじゅうはち」等。**漢数字にしない**
- 英字の並び: AB、AC、CP、ABC →「エービー」等。**カタカナ読みにしない**
- 分数 1/2 →「2ぶんの1」。**「2ぶんの1」と書かず「1/2」と書く**
- 根号 √7 →「ルート7」

## 読みを安定させるため必ず日本語の語に開くもの
- 設問番号 (1)、(2) は narration では「かっこ1」「かっこ2」と書く。
  括弧記号は語に開き、番号は算用数字のままにする（「かっこイチ」「一」にはしない）。
  visual_content や visual_items の画面表記は (1)、(2) のままでよい。
- = は完全に無音になる → 「イコール」または「は」と書く
- ± は「プラスマイナス」と書く（記号の読みは未検証なので、他の演算記号と同じくカナに統一する）
- + - × ÷ → 「たす」「ひく」「かける」「わる」
- x^2 → 「xのにじょう」、x^3 → 「xのさんじょう」。**ひらがなで書き、「の」を省かない**
  「2乗」「二乗」と書くと数字と「乗」に分断され、単独の「乗」が「の」と読まれる。
  「の」を省いた「xにじょう」も「に」と「じょう」に割れる。「ACのにじょう」も同じ
- cos sin は綴りのまま1文字ずつ読まれてしまう → 「コサイン」「サイン」と書く
  （tan, log はそのままで正しく読まれる）
- **数列の添字の _ は「アンダーライン」と声に出して読まれる。narration には書かない**
  a_n →「エーエヌ」、a_1 →「エーイチ」、S_n →「エスエヌ」、
  a_{n+1} →「エーエヌプラスイチ」とカタカナで書く。
  下線を外した「an」は「案」と読まれるので、それも書かない。
  （字幕では自動で aₙ, a₁, Sₙ, aₙ₊₁ に戻して表示される）
- 数字とカタカナを直接つなげない。「98コサインB」ではなく「98かけるコサインB」。
  つなげると読み上げの語の切れ目がずれる

字幕では プラスマイナス→±、コサイン→cos、イコール→=、かける→×、にじょう→2乗、シータ→θ、パイ→π
のように自動で書き言葉に戻して表示される（xの2乗+2x のように組み上がる）。
読み上げのための表記なので、遠慮なくカタカナ・ひらがなで書いてよい。`;

export const VISUAL_CONTENT = `# visual_content（画面に出す文字）
- narrationの要約ではなく、narrationを聞きながら読んで理解が進む短い言葉。
- 20文字以内の短いフレーズを基本とする。文にしない。
- hookのvisual_contentはサムネイルにもなる。何の話なのかが一目で分かる言葉にする。
- **前のシーンの続きなら visual_content は空文字 "" にする。**
  見出しが出なくなり、画面は前のシーンからそのまま続いて見える。
  1シーンに1つ見出しを立てなければいけない、ということはない。
  空にする:
  - 前のシーンと同じ定理・同じ公式を、別の対象にもう一度あてはめるだけのシーン
    （「△ABCで余弦定理」の次の「△ACDで余弦定理」は、2つ目を空にする）
  - 前のシーンで立てた式を、整理・計算しているだけのシーン
  見出しを立てる:
  - 使う道具が変わるとき（余弦定理をやめて、円の性質を使い始める）
  - 話の向きが変わるとき（立式が終わって、答えの吟味に移る）`;

const VISUAL_DOCS = {
  bullets: `- "bullets": 並列な要素を列挙する
    visual_items = 各項目12文字以内、1〜4個`,
  flow: `- "flow":    順序・因果・手順を示す。矢印でつながって上から順に出る
    visual_items = 各ステップ8文字以内、2〜4個`,
  bars: `- "bars":    量の比較が意味を持つときだけ。データは確かなものに限る
    visual_bars = 2〜5本、visual_unit = 単位`,
  formula: `- "formula": 定義式・公式・式変形と、その理由を見せる
    visual_items = 数式と短い文章を混在させて原則3〜4行、短ければ1〜2行、最大6行。配列の順に表示される。
    大きな文字を保つため、5〜6行は短い式のときだけ。分数や長い理由は次のシーンへ分け、途中式を省かない。
    数式行は LaTeX、文章行は先頭に [text] を付ける。
    マーカーなし・全行LaTeXの複数行なら ↓ でつながり、最後の行が囲まれる
    例: ["(a+b)^2", "a^2 + 2ab + b^2"]
    例: ["f'(x) = \\\\lim_{h \\\\to 0} \\\\frac{f(x+h) - f(x)}{h}"]
    visual_caption = 12文字以内の補足（不要なら空文字列）
    1行が長いと自動で縮小されて読みにくくなる。1行は短く保ち、長い式は行を分ける
    行の先頭に次の装飾マーカーを1つ付けると、数式行にも文章行にも注釈できる（行の一部分への指定・入れ子は不可）。
    文章は [text][underline] 本文 のように種別と装飾を重ねる（[underline][text] も可）。
    [underline] 定義・使う条件に下線、[circle] 注目する値を丸囲み、[highlight] 今使う公式を蛍光色で強調、
    [strike] 条件に合わず除外する候補を打ち消し、[bracket] 同時に使う条件のまとまりを左右の括弧で囲む、
    [box] 確定した答えを囲む、[plain] 装飾せず並べる。
    [substitute: x=2 を代入] は代入後の数式行の先頭に付ける。直前の数式とその行の間に ↓、
    矢印の右横に「x=2 を代入」が出る。独立した [text] 行は追加しない。
    例: ["y=x^2+1", "[substitute: x=2 を代入] y=2^2+1", "[box] y=5"]。
    具体的な値・式を文字に代入するときだけ使い、単なる整理・展開・移項には使わない。
    先頭行、[text] の直後、除外した式の直後には使わず、代入元の数式を必ず直前に置く。
    [box] など装飾1つと併用できる（[substitute: x=2 を代入][box] y=5、逆順も可）。
    [text] や [carry] と同じ行には重ねない。[carry] の次の新しい数式行には使える。
    説明は12〜14文字程度、長くても16文字を目安にし、x=2 のような本文表記にする。
    説明に角括弧・改行・LaTeXコマンドは入れない。長い説明は横の列で折り返され、全文を含めて縮小されるため、
    理由の詳細は音声で補い、複数の代入はシーンを分ける。矢印と説明の高さも使うので式は少なめにする。
    行数枠は代入後の式と合わせて1行のまま。figure / plot の2行併記でも使える。
    [carry] は前シーンから続く式変形の再掲専用。前後とも point で formula または figure/plot の式併記、
    かつ前の最終数式をそのまま整理・計算する場合だけ、現在の visual_content を空文字にし、
    前の最終数式の装飾を外して「[carry] 同じLaTeX」を現在の visual_items の先頭に必ず写す。
    再掲は「前の式」と淡く静止表示される。読み上げ直さず、その式から次の変形を説明する。
    [carry] に [text] や別の装飾は重ねない。再掲の次に必ず新しい数式行を置く。
    同じ公式を別の対象に使うだけ、別問、別の定理、答えの吟味では使わない。
    前の最終数式が [box] の確定答え、[strike] の除外候補なら使わない。
    再掲も最大6行（図との併記は2行）のうち1行を使う。必要なら新しい変形を次のシーンに分ける。
    継続途中の最後の式には [plain] を付け、自動の答え囲みを避ける。
    1行でも [text]・装飾・[substitute: 説明] を使ったら、そのシーン全体で自動の ↓ と最後の自動囲みは出ない。
    ただし [substitute: 説明] を付けた数式の直前だけは、明示した説明付き ↓ が出る。
    マーカーのない行はそのまま出る。必要な答えには明示的に [box] を付ける。
    例: ["[underline] x>0", "[strike] x=-2", "[box] x=2"]
    複数の条件は1行に [bracket] x>0,\\quad y>0 のようにまとめる。
    装飾は見る場所を案内するために使う。全行を強調せず、その説明で意味のある行に絞る。
    文章行は、式変形の根拠・次の一手の理由・場合分けの宣言が式だけでは伝わらない場所に挟む。
    文章行は12〜14文字程度、長くても16文字を目安にする。長い理由はシーンを分けて音声で補い、6行を埋めるためには足さない。
    良い例: ["x^2-5x+6=0", "[text] 和が5、積が6の2数を探す", "(x-2)(x-3)=0",
             "[text][underline] どちらかの因数が0", "[box] x=2,3"]
    悪い例: ["x+2=5", "[text] 次に計算します", "x=3"]（変形の根拠にならない）
    画面は要点、音声はその説明。文章行をナレーションの逐語コピーにしない。
    良い組合せ: 画面「[text] 積が0なら因数のどちらかが0」／音声「両方がゼロでなければ、かけてもゼロにはなりません。」
    悪い組合せ: 画面にも音声にも「両方がゼロでなければ、かけてもゼロにはなりません。」
    文章中の簡単な式は x^2、a_n、x>0 のような本文表記。指数・添字は表示できるが、$ やLaTeXコマンドは使わない。
    ± は数式行では LaTeX の \\pm、[text] 文章行ではリテラルの ± を使う（文章に \\pm は書かない）。
    分数など複雑な式は別の数式行に置く。数式行の中に日本語を混ぜるときは必ず \\text{} で囲む
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
        [{x, y, label}] を1〜3個。label は "(-1, -1)" のような短い文字列。不要なら空配列
    visual_items = グラフと同時に見せる短い数式／[text]文章行を合計0〜2個（不要なら空配列）。図の下に表示される。
        接点と接線の式、塗った領域と定積分、交点と方程式の対応を説明するときに使う。
        formula と同じ行頭マーカーを使える。併記では自動の ↓ も最後の自動囲みも出ない。
        [substitute: 説明] の明示的な矢印は出る。
        例: ["[underline] f'(1)=2", "[box] y=2x-1"]
    visual_caption = 図・式の関係を示す12文字以内の補足（不要なら空文字列）。式がなくても表示する`,
  figure: `- "figure":  図形そのものを描く。三角形・円・立体など、幾何の問題では必ず使う
    visual_points  = 頂点。label が名前であり、他のフィールドから参照するidにもなる
        [{x, y, label}] を2〜8個。座標は自分で計算した正しい値を入れる
        単位は自由。図全体が自動で画面に合わせて拡大縮小される（縦横は同じ倍率）
    visual_segments = 線分。[{from, to, label, dashed, emphasis, ticks, arrow}] を1〜10本
        from / to は visual_points の label
        label = 長さなどの短い文字（不要なら空文字列）
        dashed = true で破線。立体の隠れた辺や、追加した補助線に使う
        emphasis = 0 は通常線、1〜5 は色の役割を表す整数で、同じ番号は同じ色の太線になる
            対応する辺どうしを同じ番号、別の組や補助線を別番号、求める辺を独立した番号にする
            例: AB と DE は emphasis:1、BC と EF は emphasis:2、補助線 AD は emphasis:3, dashed:true
            色はデザインで変わる。シーンをまたいで同じ役割の番号を保ち、「赤い辺」のように色名で呼ばず点名で説明する
            色だけに頼らず label の数値・"?"、等しさの ticks、補助線の dashed を併用する。色は必要な組だけに使う
        ticks = 等しい辺の印の本数（0〜3）。**同じ本数の辺どうしが等しい**
            等しいと分かっている辺に同じ本数を付ける。相似で対応するだけの辺は同色にし、等長の印は付けない。不要なら0
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
        （△ABCを x=0〜3、△DEFを x=5〜8 に置く。全体が自動で画面に収まる）
    visual_items = 図と同時に見せる短い数式／[text]文章行を合計0〜2個（不要なら空配列）。図の下に表示される。
        図の辺・角に定理をあてはめるときは、図を消さずに公式と代入式をここへ置く。
        formula と同じ行頭マーカーを使える。併記では自動の ↓ も最後の自動囲みも出ない。
        [substitute: 説明] の明示的な矢印は出る。
        例: ["[highlight] c^2=a^2+b^2", "[substitute: a=3,b=4 を代入][box] c^2=3^2+4^2=25"]
    visual_caption = 図・式の関係を示す12文字以内の補足（不要なら空文字列）。式がなくても表示する`,
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
LaTeX と expr は別物。formula と figure / plot の visual_items は数式行なら LaTeX、[text] 行なら文章。
plot の expr は上に挙げた記号だけの素の式で、LaTeX や行頭マーカーを絶対に入れない。`
      : ""
  }`;
};

/**
 * How the question itself should be written back out.
 *
 * `topic` is already in the schema and its value was being thrown away — the
 * user's raw input was kept instead. It is now the model's job, because the
 * model is the only thing here that can read `ｙ＝ｘ^2＋４ｘ－３` and know which
 * characters are the formula and which are the sentence. A pattern-matcher
 * cannot: it has to guess whether a `-` is a minus or a hyphen, whether a `,`
 * separates points or thousands, and it has no idea what the question means.
 *
 * The instruction is narrow on purpose. This is typesetting, not editing — the
 * question shown on the card has to be the question that was asked.
 */
export const TOPIC_RULE = `# topic（画面に出す問題文）
入力された文を、表記を整えて、topic に書く。
これは動画とサムネイルに大きく出る文字列で、入力欄の中身ではない。

必ず直すもの
- 一般的な教科書に書かれている数学問題の表記にする。
- **LaTeX・MathJax の記法は残さない。$ と \\ を1文字も残さずに直す。**
    $\\sqrt{2}$ → √2    $\\frac{\\pi}{4}$ → π/4    $\\theta$ → θ
    $\\le$ → ≦          $\\sin 2\\theta$ → sin2θ    $[ \\ ア \\ ]$ → ［ア］
- **添字と指数の _ と ^ だけは残す。** ここは画面で下付き・上付きに組まれる。
    $a_n$ → a_n    $a_{n+1}$ → a_{n+1}    $S_n$ → S_n    $x^2$ → x^2
  添字が2文字以上なら { } で囲む。an や a n と平らに書くと別の式になる。
  **積分の上端・下端も同じ。** $\\int_0^{\\pi}$ → ∫_0^π。
  ∫[0,π] や 0からπまで のように書き換えない。
- **貼り付けた跡は消す。** Webページからコピーした問題は、記号1つごとに改行が
  入っていたり、記号の前後に空白が入っていたりする。
  「sin θ」→「sinθ」、「0 ∘」→「0°」のように、記号は詰めて1つの式に戻す。
- 入力にある「【問題】」「設定」「設問」のような見出し行は取り除く。
  問題文そのものだけを残す。

改行（\\n）
- **入力の改行はあてにしない。いったん全部つないでから、自分で入れ直す。**
- 設問番号「(1)」「(2)」の前で改行する。
- 独立した1行として示すべき数式は、その前後で改行する。
- 全体が1〜2文の短い問題なら改行しない。1行で読める。
- 数文字で終わる行を作らない。1行は文か式のまとまりにする。

してはいけないこと
- 言い換え、要約、短縮、語尾や文体の変更。
- 条件・数値・点の名前を足す、削る、並べ替える。
- 答えや方針を書き足す。「問題:」のような見出しを足す。

直すのは表記だけ。文そのものは入力のまま。
入力がすでに教科書の表記で整っているなら、1文字も変えずにそのまま写す。`;

/**
 * The opening has room for the actual problem, and losing a qualification can
 * change its answer. Keep complete conditions and requests in the existing
 * string channel; explicit numbers distinguish every question without growing
 * the script's 19-field schema. Even a single request gets (1), so new data
 * never depends on the legacy last-line convention.
 */
export const OUTLINE_RULE = `# outline（冒頭と一覧に出す問題文）
topic の設定・条件・すべての問いを、省略せず読みやすい順に整える。

- **1行1つの意味のまとまり。目安は4〜10行、1行25〜45文字。短い問題は1行でもよい。**
  行数・文字数を守るために情報を削らない。長い文は画面で折り返される。
- **対象の定義、数値、範囲、単位、場合分け、条件どうしの関係をすべて残す。**
  「〜である」「〜とする」などの文を使い、体言止めに縮めない。
  元の文を活かし、単独で読んでも何の条件か分かる形にする。
- 共通の設定・条件を先に書き、その後に問われていることをすべて並べる。
- **問いは各行の先頭に半角の (1) (2) のような番号を付ける。単問でも (1) を付ける。**
  元の設問番号と順番を保つ。番号がない複数の問いは入力順に採番する。
  1つの問いを1項目とし、「何を」「どうするか」（求めよ・示せ・証明せよ）まで書く。
  問い固有の条件はその問いに含め、別の共通条件にしない。
- 条件の行頭には番号も「・」「-」も付けない。問い以外に設問番号を使わない。
- 数式は topic と同じ表記のまま写す（_ ^ 記号も含めて）。式の途中で分断しない。
- 問題に無い条件・解き方・答えは足さない。

    入力: 円に内接する四角形ABCDにおいて、AB = BC = 7, CD = 5, DA = 3
          であるとき、cos Bの値を求めなさい。
    outline: "四角形ABCDは円に内接している。\\n辺の長さは AB = BC = 7, CD = 5, DA = 3 である。\\n(1) cos Bの値を求めなさい。"

    入力: 関数f(x)=x^2-4x+3について、(1) f(x)=0を解け。(2) 0≦x≦3での最小値を求めよ。
    outline: "関数f(x)=x^2-4x+3について、次の問いに答えよ。\\n(1) f(x)=0を解け。\\n(2) 0≦x≦3におけるf(x)の最小値を求めよ。"

    入力: ∫_0^π x sinx/(1+cos^2x) dx を求めよ。
    outline: "(1) ∫_0^π x sinx/(1+cos^2x) dx を求めよ。"

概念の説明（「とは」「教えて」）なら、扱う内容を先に説明し、
最後に「何を理解するか」を (1) から始まる問いとして書く。`;

export const COMMON_RULES = `- scene_idは1から連番。
- 事実に自信がないことは書かない。数値を出すなら確かなものだけ。
- 専門用語は初出時に一言で言い換える。`;
