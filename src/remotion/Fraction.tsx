/**
 * 文章の1行に収まる大きさの、上下に重ねた分数。
 *
 * 字幕は 66px・line-height 1.3 なので、2行それぞれの行ボックスは85.8pxとなり、
 * 212px の帯には縦方向の余裕がない。0.58em の上下2段を line-height 1.08 にすると
 * 1.253em（82.7px）の積み重ねになる。これ以上大きくすると2行字幕が説明領域へ上に
 * 広がってしまう。
 */
export const Fraction: React.FC<{
  numerator: React.ReactNode;
  denominator: React.ReactNode;
}> = ({
  numerator,
  denominator,
}) => (
  <span
    style={{
      display: "inline-flex",
      flexDirection: "column",
      alignItems: "center",
      // 周囲の文字とそろえるべきなのは上下どちらかのベースラインではなく、分数線。
      verticalAlign: "middle",
      // カード本文は16pxで、0.58emの分数はそこで9.28pxにしかならない。11pxの下限なら
      // 66pxの動画字幕は変えずに済む。
      fontSize: "max(0.68em, 11px)",
      lineHeight: 1.08,
      // 両側の1em文字に対して1字のように読ませるため、通常の字形と同じ sidebearing が要る。
      margin: "0 0.12em",
    }}
  >
    <span>{numerator}</span>
    <span
      style={{
        // 文字ではなく border にする。上下で広い方に渡る必要があり、それはどの字形にもできない。
        borderTop: "0.09em solid currentColor",
        width: "100%",
      }}
    >
      {denominator}
    </span>
  </span>
);

/** 「分の」から結合されたトークン全体だけに一致させ、本文中から境界を推測しない。 */
export const WHOLE_FRACTION = /^((?:(?:0|[1-9][0-9]*|[A-Za-zΑ-ΡΣ-ω])?√)?(?:0|[1-9][0-9]*|[A-Za-zΑ-ΡΣ-ω]))\/([1-9][0-9]*|[A-Za-zΑ-ΡΣ-ω])$/;
