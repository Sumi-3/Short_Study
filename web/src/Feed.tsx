import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ShortPlayer } from "./ShortPlayer";
import { Thumbnail } from "./Thumbnail";
import type { ShortSummary } from "./api";
import type { AudioGate } from "./audioGate";
import { formatTopic } from "../../src/topicText";

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

  useEffect(() => {
    const container = scroller.current;
    if (!container) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveIndex(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { root: container, threshold: 0.6 },
    );

    // `[data-index]` and not just `.feed-item`: the parked player wears the same
    // class to inherit its layout, and observing it would report an index of NaN.
    container
      .querySelectorAll(".feed-item[data-index]")
      .forEach((child) => observer.observe(child));

    return () => observer.disconnect();
  }, [shorts]);

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
          <section className="feed-item" key={short.slug} data-index={index}>
            <div className="phone">
              <Thumbnail short={short} />
            </div>
            <p className="feed-item__topic">{formatTopic(short.topic)}</p>
          </section>
        ))}

        {/* Same markup as an item, so the player lands exactly where that
            item's thumbnail is and nothing shifts as it takes over. */}
        {active && itemHeight > 0 ? (
          <section
            className="feed-item feed-item--player"
            style={{ top: activeIndex * itemHeight, height: itemHeight }}
          >
            <div className="phone">
              <ShortPlayer manifestSrc={active.manifestSrc} gate={gate} />
            </div>
            <p className="feed-item__topic">{formatTopic(active.topic)}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
};
