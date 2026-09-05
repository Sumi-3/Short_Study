import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ShortPlayer } from "./ShortPlayer";
import { themeOf } from "../../src/remotion/Poster";
import { Thumbnail } from "./Thumbnail";
import { prefetchManifest, type ShortSummary } from "./api";
import type { AudioGate } from "./audioGate";

/**
 * The vertical swipe feed.
 *
 * Both entry points share it: the home screen opens it over a filtered list at
 * the card that was tapped, and the shorts tab hands it everything in shuffled
 * order. Only the short on screen gets a mounted Player — running several
 * compositions at once is the whole cost of this playback model.
 *
 * That one Player is parked *over* the active item rather than rendered inside
 * it. Inside, every swipe moved it to a different parent, which React can only
 * do by unmounting and remounting — and a Player that remounts builds a fresh
 * pool of `<audio>` tags. On a phone those replacements have never been
 * unlocked by a tap, so the sound died after a few swipes. Kept in one place it
 * is the same instance, and the same tags, for the life of the feed.
 */
export const Feed: React.FC<{
  shorts: ShortSummary[];
  initialIndex: number;
  gate: React.RefObject<AudioGate>;
  /** Present when the feed is covering the app rather than filling a tab. */
  onClose?: () => void;
}> = ({ shorts, initialIndex, gate, onClose }) => {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const scroller = useRef<HTMLDivElement>(null);
  /* One item fills the scroller, so this is both the row height and the pitch
     the parked player is offset by. */
  const [itemHeight, setItemHeight] = useState(0);

  // Before paint, so opening on the third card never shows the first one.
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
    // The URL bar collapsing on a phone changes this without a resize event on
    // window, so the box is watched rather than the viewport.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /*
   * Which short the player sits on, from the scroll offset.
   *
   * This was an IntersectionObserver at a threshold of 0.6, which meant the
   * incoming short had to be 60% of the way on screen before the player moved
   * to it — until then the card underneath was what you looked at. Rounding the
   * offset hands over at the halfway point instead, and it tracks a flick
   * continuously rather than waiting for a threshold to be crossed.
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

  // The swipe can go either way, so both neighbours are warmed. By the time one
  // of them becomes the active short its manifest is already in hand.
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
            /* The video is 9:16 and the screen is taller, so bands are left
               above and below whatever the padding is. Painting them the
               video's own deepest colour makes the frame read as reaching the
               edges instead of sitting in a letterbox. */
            style={{ background: themeOf(short.design, short.subject).bgDeep }}
          >
            <div className="phone">
              <Thumbnail short={short} />
            </div>
          </section>
        ))}

        {/* Same markup as an item, so the player lands exactly where that
            item's thumbnail is and nothing shifts as it takes over. */}
        {active && itemHeight > 0 ? (
          <section
            className="feed-item feed-item--player"
            style={{
              top: activeIndex * itemHeight,
              height: itemHeight,
              background: themeOf(active.design, active.subject).bgDeep,
            }}
          >
            <div className="phone">
              <ShortPlayer manifestSrc={active.manifestSrc} gate={gate} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};
