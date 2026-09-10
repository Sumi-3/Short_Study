import { Thumbnail as StillFrame } from "@remotion/player";
import {
  POSTER_DURATION,
  POSTER_SIZE,
  Poster,
  posterFrame,
} from "../../src/remotion/Poster";
import { themeOf, withAlpha } from "../../src/remotion/theme";
import type { ShortSummary } from "./api";

/**
 * 再生中でない short の見た目、すなわち自身の開始フレームを静止させたもの。
 *
 * card は以前、chip・問題文・accent rule・hook line を、入る文字量の推測式で組んだ
 * 別デザインだった。ひとつの問題に組版が二通りあるのは一つ多く、その推測が
 * 失敗し続けた理由でもある。代わりに `<Thumbnail>` が実際の composition を一フレーム
 * 描画するので、card は動画についての絵ではなく動画そのものになる。
 *
 * 代償はサイズである。composition は 1080px の stage 用に組まれているため、その
 * 五分の一幅の card では 44px の問題文が約 8px で描画される。
 */
export const Thumbnail: React.FC<{ short: ShortSummary }> = ({ short }) => {
  const theme = themeOf();

  return (
  <div className="thumb">
    <StillFrame
      component={Poster}
      inputProps={{
        topic: short.topic,
        outline: short.outline ?? [],
        unit: short.unit,
        difficulty: short.difficulty ?? 0,
      }}
      compositionWidth={POSTER_SIZE.width}
      compositionHeight={POSTER_SIZE.height}
      durationInFrames={POSTER_DURATION}
      fps={short.fps}
      frameToDisplay={posterFrame(short.fps)}
      style={{ width: "100%", height: "100%" }}
    />

    {/* 動画には出ないが library には必要な二つ、syllabus 上の位置と再生時間を示す。
        再生中は caption が占め、hook では空いている帯に置く。 */}
    <div
      className="thumb__meta"
      style={{
        color: theme.ink,
        background: `linear-gradient(to top, ${withAlpha(
          theme.bgDeep,
          0.82,
        )} 0%, ${withAlpha(theme.bgDeep, 0.5)} 55%, ${withAlpha(
          theme.bgDeep,
          0,
        )} 100%)`,
      }}
    >
      {short.subunit ? <span>{short.subunit}</span> : null}
      <span>{Math.round(short.durationInFrames / short.fps)}秒</span>
    </div>
  </div>
  );
};
