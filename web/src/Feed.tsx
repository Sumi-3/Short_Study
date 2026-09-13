import { flushSync } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const canLoop = shorts.length > 1;
  const firstIndex = Math.max(0, Math.min(shorts.length - 1, initialIndex));
  /* 両端の複製は snap の着地点だけを作る。Player は下の sourceIndex を使うので、
     複製の上でも元の short と同じ一つの instance を保てる。 */
  const items = useMemo(
    () =>
      canLoop
        ? [
            { short: shorts[shorts.length - 1]!, sourceIndex: shorts.length - 1 },
            ...shorts.map((short, sourceIndex) => ({ short, sourceIndex })),
            { short: shorts[0]!, sourceIndex: 0 },
          ]
        : shorts.map((short, sourceIndex) => ({ short, sourceIndex })),
    [canLoop, shorts],
  );
  const [activeIndex, setActiveIndex] = useState(firstIndex);
  const [playerItemIndex, setPlayerItemIndex] = useState(firstIndex + (canLoop ? 1 : 0));
  const [playerSwapping, setPlayerSwapping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | null>(null);
  /* 一つの item が scroller を満たすため、これは行の高さであると同時に、固定した
     player をずらす pitch でもある。 */
  const [itemHeight, setItemHeight] = useState(0);

  // third card から開いても first card を一瞬表示しないよう、paint 前に行う。
  useLayoutEffect(() => {
    const container = scroller.current;
    if (container) {
      container.scrollTop = (firstIndex + (canLoop ? 1 : 0)) * container.clientHeight;
    }
  }, [canLoop, firstIndex]);

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

    const itemAt = (scrollTop: number) =>
      Math.max(0, Math.min(items.length - 1, Math.round(scrollTop / itemHeight)));

    const wrapAfterSnap = () => {
      const currentItemIndex = itemAt(container.scrollTop);
      // scrollend のない browser の静止待ちで途中の位置を巡回させないよう、clone の
      // snap point まで実際に着地したときだけ書き換える。
      if (
        !canLoop ||
        Math.abs(container.scrollTop - currentItemIndex * itemHeight) > 1 ||
        (currentItemIndex !== 0 && currentItemIndex !== items.length - 1)
      ) {
        return;
      }

      const targetItemIndex = currentItemIndex === 0 ? shorts.length : 1;
      // Player の top を先に同じ実カードへ移す。DOM を作り直さず scrollTop だけを戻せば、
      // iOS で gesture 中に解除した audio pool をそのまま使える。
      flushSync(() => {
        setPlayerItemIndex(targetItemIndex);
        setActiveIndex(items[targetItemIndex]!.sourceIndex);
      });
      container.scrollTop = targetItemIndex * itemHeight;
    };

    const onScroll = () => {
      const nextItemIndex = itemAt(container.scrollTop);
      const next = items[nextItemIndex]!.sourceIndex;
      setPlayerItemIndex((current) => (current === nextItemIndex ? current : nextItemIndex));
      setActiveIndex((current) => (current === next ? current : next));

      if (!("onscrollend" in container)) {
        if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
        // 慣性中に clone を実カードへ戻すと iOS の bounce と競合するため、scrollend を
        // 持たない browser だけは scroll が止まってから同じ判定を行う。
        settleTimer.current = window.setTimeout(wrapAfterSnap, 180);
      }
    };

    onScroll();
    container.addEventListener("scroll", onScroll, { passive: true });
    container.addEventListener("scrollend", wrapAfterSnap);
    return () => {
      container.removeEventListener("scroll", onScroll);
      container.removeEventListener("scrollend", wrapAfterSnap);
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    };
  }, [canLoop, itemHeight, items, shorts.length]);

  // swipe は両方向に進めるため、両隣を warm する。どちらかが active short になる頃には
  // manifest を取得済みにするためである。
  useEffect(() => {
    if (!canLoop) {
      return;
    }
    for (const index of new Set([
      (activeIndex + 1) % shorts.length,
      (activeIndex - 1 + shorts.length) % shorts.length,
    ])) {
      const neighbour = shorts[index];
      if (neighbour) {
        prefetchManifest(neighbour.manifestSrc);
      }
    }
  }, [activeIndex, canLoop, shorts]);

  const active = shorts[activeIndex];

  return (
    <div className="feed">
      <div className="feed-scroll" ref={scroller}>
        {items.map(({ short, sourceIndex }, itemIndex) => (
          <section
            className="feed-item"
            key={`${short.slug}-${itemIndex}`}
            data-index={sourceIndex}
          >
            <div className="phone">
              {/* swipe で次に来るのはこの両隣だけ。そこには動画自身の最初の絵を敷き、
                  player が乗っても何も変わらないようにする。遠くの short は library
                  と同じ video layout の Poster を使い、manifest がまだ無い間も文字の大きさを揃える。 */}
              {sourceIndex === activeIndex ||
              (canLoop &&
                (sourceIndex === (activeIndex + 1) % shorts.length ||
                  sourceIndex === (activeIndex - 1 + shorts.length) % shorts.length)) ? (
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
              top: playerItemIndex * itemHeight,
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
