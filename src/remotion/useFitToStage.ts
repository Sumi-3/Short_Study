import { useLayoutEffect, useRef, useState } from "react";
import { useDelayRender } from "remotion";

const isWebPlayerBuild = typeof __STUDY_WEB__ !== "undefined" && __STUDY_WEB__;

/**
 * Scale the whole block, including gaps, arrows, caption and annotation room.
 * Font size alone cannot bound nested fractions or aligned environments.
 * The same shrink also fits the measured width, since rough SVG annotations
 * can extend beyond the width budget used for the text itself.
 * offsetHeight ignores Player/entrance transforms and our own scale, so the
 * measurement never feeds a previously shrunk height back into the next fit.
 *
 * SceneShell ends at 1920 - 100 - 212 - 44 = 1564. Its remaining stage height
 * already excludes the actual heading and 56px gap. For content height H and
 * available height B, s = min(1, B/H) guarantees H*s <= B without dropping rows.
 * A companion gets at most 40% of (stage height - 20px grid gap), preserving
 * at least 60% for the diagram; short companions still use only their height.
 */
export const useFitToStage = (compact: boolean) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 1, height: 0, width: 0 });
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender("fit formula to stage"));

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const stage = viewport?.parentElement;
    if (!viewport || !content || !stage) return;
    const measure = () => {
      // DOM integer sizes round to the nearest pixel. Round the content up
      // and the budget down so that a fractional last pixel cannot cross B.
      const height = content.offsetHeight + 1;
      /*
       * `viewport` is `height: 100%` inside a parent whose own height comes
       * from `flex-grow`. Whether that percentage resolves against a
       * flex-resolved height is exactly where engines disagree: Blink treats
       * it as definite, WebKit can leave it indefinite and report 0. Asking
       * the stage directly gives the same number on both.
       */
      const budget = compact
        ? Math.max(0, stage.clientHeight - 21) * 0.4
        : Math.max(0, (viewport.clientHeight || stage.clientHeight) - 1);
      /*
       * A budget of zero means the stage has not been laid out yet, not that
       * the content has to vanish. Scaling to 0 here is unrecoverable: the
       * observers watch boxes whose own size never changes again, so nothing
       * ever triggers a second measurement and the whole block stays
       * invisible for the life of the scene. `useFitToWidth` makes the same
       * guard for width — skip the measurement and keep the last good fit.
       */
      if (budget <= 0 || content.offsetHeight === 0) return;
      const computed = getComputedStyle(content);
      const horizontalPadding = parseFloat(computed.paddingLeft) +
        parseFloat(computed.paddingRight);
      const naturalWidth = Math.max(
        0,
        ...Array.from(content.children, (child) =>
          child instanceof HTMLElement && child.dataset.formulaMeasure !== undefined
            ? child.offsetWidth
            : 0,
        ),
      ) + horizontalPadding;
      const scale = Math.min(
        1,
        budget / height,
        // The placement box fills the stage so prose can use its left edge.
        // Its own width would make this ratio one, so fit against the widest
        // measured row instead; that retains the formula's intrinsic width.
        Math.max(0, viewport.clientWidth - 1) / (naturalWidth + 1),
      );
      const width = viewport.clientWidth;
      setSize((old) =>
        old.height === height && old.scale === scale && old.width === width
          ? old
          : { height, scale, width },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    // The full-width placement box does not resize when a rough mark expands
    // only one row. Watch measured rows too, so that late SVG padding is
    // included in the same intrinsic-width fit instead of escaping the stage.
    for (const child of Array.from(content.children)) {
      if (child instanceof HTMLElement && child.dataset.formulaMeasure !== undefined) {
        observer.observe(child);
      }
    }
    observer.observe(compact ? stage : viewport);
    // Only Web fetches new ranges after `ready`. In the renderer, this extra
    // callback races the width fit and annotation padding, shifting stills.
    if (isWebPlayerBuild) {
      document.fonts.addEventListener("loadingdone", measure);
    }
    measure();
    void document.fonts.ready.then(() => {
      measure();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => continueRender(handle)),
      );
    });
    return () => {
      observer.disconnect();
      if (isWebPlayerBuild) {
        document.fonts.removeEventListener("loadingdone", measure);
      }
    };
  }, [compact, continueRender, handle]);

  return { viewportRef, contentRef, ...size };
};
