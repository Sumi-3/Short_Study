import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { themeOf } from "../../src/remotion/theme";
import { ShortPlayer, type ShortPlayerHandle } from "./ShortPlayer";
import { Thumbnail } from "./Thumbnail";
import { prefetchManifest, type ShortSummary } from "./api";

/**
 * 縦 swipe の feed。
 *
 * 二つの入口で共有する。home screen は絞り込んだ list のタップした card 位置でこれを
 * 重ねて開き、shorts tab は全件を shuffle 順で渡す。mounted Player を持つのは画面上の
 * short だけである。複数の composition を同時に動かすことこそ、この再生モデルの
 * コストだからである。
 *
 * その一つの Player は active item の*中*で render せず、その*上*に固定する。中に置くと
 * swipe ごとに別の親へ移り、React は unmount と remount でしか移動できない。remount した
 * Player は新しい `<audio>` tag pool を作るが、phone では置換 tag をタップで unlock
 * していないため、数回 swipe すると音が消えた。一箇所に保てば feed の生存中、同じ
 * instance と同じ tag を使える。
 */
export const Feed: React.FC<{
  shorts: ShortSummary[];
  initialIndex: number;
  playbackRef?: React.Ref<ShortPlayerHandle>;
  /** feed が tab を満たすのでなく app の上を覆う場合に渡される。 */
  onClose?: () => void;
}> = ({ shorts, initialIndex, playbackRef, onClose }) => {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const scroller = useRef<HTMLDivElement>(null);
  /* 一つの item が scroller を満たすため、これは行の高さであると同時に、固定した
     player をずらす pitch でもある。 */
  const [itemHeight, setItemHeight] = useState(0);

  // third card から開いても first card を一瞬表示しないよう、paint 前に行う。
  useLayoutEffect(() => {
    const container = scroller.current;
    if (container) {
      container.scrollTop = initialIndex * container.clientHeight;
    }
  }, [initialIndex]);

  useLayoutEffect(() => {
    const container = scroller.current;
    if (!container) {
      return;
    }
    const measure = () => setItemHeight(container.clientHeight);
    measure();
    // phone では URL bar が縮んでも window の resize event が起きないため、viewport
    // ではなく box を監視する。
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /*
   * scroll offset から、player を置く short を決める。
   *
   * 以前は threshold 0.6 の IntersectionObserver で、入ってくる short が画面の 60% を
   * 占めるまで player が移らず、それまでは下の card を見せていた。offset を丸めれば
   * 半分の時点で切り替わり、threshold をまたぐのを待たず flick に連続して追従する。
   */
  useEffect(() => {
    const container = scroller.current;
    if (!container || itemHeight === 0) {
      return;
    }

    const onScroll = () => {
      const nearest = Math.round(container.scrollTop / itemHeight);
      const next = Math.max(0, Math.min(shorts.length - 1, nearest));
      setActiveIndex((current) => (current === next ? current : next));
    };

    onScroll();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [itemHeight, shorts.length]);

  // swipe は両方向に進めるため、両隣を warm する。どちらかが active short になる頃には
  // manifest を取得済みにするためである。
  useEffect(() => {
    for (const index of [activeIndex + 1, activeIndex - 1]) {
      const neighbour = shorts[index];
      if (neighbour) {
        prefetchManifest(neighbour.manifestSrc);
      }
    }
  }, [activeIndex, shorts]);

  const active = shorts[activeIndex];

  return (
    <div className={`feed${onClose ? " feed--full" : ""}`}>
      {onClose ? (
        <button className="feed__close" onClick={onClose} aria-label="閉じる">
          ✕
        </button>
      ) : null}

      <div className="feed-scroll" ref={scroller}>
        {shorts.map((short, index) => (
          <section
            className="feed-item"
            key={short.slug}
            data-index={index}
            /* video は 9:16 で screen のほうが高いため、padding にかかわらず上下に帯が
               残る。その帯を動画自身の最も濃い色で塗り、letterbox に置かれたのでなく
               frame が端まで届いているように見せる。 */
            style={{ background: themeOf().bgDeep }}
          >
            <div className="phone">
              <Thumbnail short={short} />
            </div>
          </section>
        ))}

        {/* item と同じ markup にし、player がその item の thumbnail とまったく同じ位置に
            着地して、引き継いでも何もずれないようにする。 */}
        {active ? (
          <section
            className="feed-item feed-item--player"
            style={{
              top: activeIndex * itemHeight,
              height: itemHeight,
              background: themeOf().bgDeep,
            }}
          >
            <div className="phone">
              <ShortPlayer manifestSrc={active.manifestSrc} playbackRef={playbackRef} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};
