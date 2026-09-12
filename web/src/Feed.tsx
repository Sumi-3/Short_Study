import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FirstFrame } from "./FirstFrame";
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
  /** シークバーを預ける tab bar 上辺の枠。そのまま Player へ渡す。 */
  seekSlot: HTMLElement | null;
  playbackRef?: React.Ref<ShortPlayerHandle>;
}> = ({ shorts, initialIndex, seekSlot, playbackRef }) => {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [playerSwapping, setPlayerSwapping] = useState(false);
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
    <div className="feed">
      <div className="feed-scroll" ref={scroller}>
        {shorts.map((short, index) => (
          <section className="feed-item" key={short.slug} data-index={index}>
            <div className="phone">
              {/* swipe で次に来るのはこの両隣だけ。そこには動画自身の最初の絵を敷き、
                  player が乗っても何も変わらないようにする。遠くの short は library
                  と同じ video layout の Poster を使い、manifest がまだ無い間も文字の大きさを揃える。 */}
              {Math.abs(index - activeIndex) <= 1 ? (
                <FirstFrame short={short} />
              ) : (
                <Thumbnail short={short} layout="video" showMeta={false} />
              )}
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
              // swapping 中は上層の Player とこの背景を同時に退かせ、下の FirstFrame を見せる。
              // 通常時は 9:16 の外に残る帯を、item と同じ白で埋める。
              background: playerSwapping ? "transparent" : "var(--white)",
            }}
          >
            <div className="phone">
              <ShortPlayer
                manifestSrc={active.manifestSrc}
                seekSlot={seekSlot}
                playbackRef={playbackRef}
                onSwappingChange={setPlayerSwapping}
              />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};
