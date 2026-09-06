import { useLayoutEffect, useRef, useState } from "react";
import { useDelayRender } from "remotion";

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
  const [size, setSize] = useState({ scale: 1, height: 0 });
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
      const budget = compact
        ? Math.max(0, stage.clientHeight - 21) * 0.4
        : Math.max(0, viewport.clientHeight - 1);
      const scale = Math.min(
        1,
        budget / height,
        Math.max(0, viewport.clientWidth - 1) / (content.offsetWidth + 1),
      );
      setSize((old) =>
        old.height === height && old.scale === scale ? old : { height, scale },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(compact ? stage : viewport);
    measure();
    void document.fonts.ready.then(() => {
      measure();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => continueRender(handle)),
      );
    });
    return () => observer.disconnect();
  }, [compact, continueRender, handle]);

  return { viewportRef, contentRef, ...size };
};
