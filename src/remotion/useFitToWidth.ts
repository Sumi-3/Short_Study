import { useCallback, useEffect, useRef, useState } from "react";
import { useDelayRender } from "remotion";

const isWebPlayerBuild = typeof __STUDY_WEB__ !== "undefined" && __STUDY_WEB__;

/**
 * Sizes type so the widest of the registered elements fills `budget`.
 *
 * `maxScale` is how far it may grow past the size it was written at: 1 makes
 * this shrink-only, which is what formulas want, while a table would rather
 * expand into the space it has been given.
 *
 * Two things make this less obvious than it looks.
 *
 * Webfonts: KaTeX and the Japanese faces are only fetched once something needs
 * them, so in the browser `document.fonts.ready` can resolve before they have
 * even been requested. A measurement taken then uses fallback metrics and the
 * line reflows wider afterwards. Font completion and the observer catch late
 * swaps, including ranges first needed when a later scene mounts.
 *
 * Feedback: applying the result changes the very width being measured, so the
 * measured width is divided by the fit currently applied to recover the width
 * at full size. Without that, each measurement would shrink the type again.
 */
export const useFitToWidth = (budget: number, maxScale = 1) => {
  const elements = useRef<(HTMLElement | null)[]>([]);
  const applied = useRef(1);
  const [fit, setFit] = useState(1);

  const register = useCallback(
    (index: number) => (element: HTMLElement | null) => {
      elements.current[index] = element;
    },
    [],
  );

  const remeasure = useCallback(() => {
    const widest = elements.current.reduce(
      (max, element) => Math.max(max, element?.offsetWidth ?? 0),
      0,
    );
    if (widest === 0) {
      return;
    }
    const next = Math.min(maxScale, (budget * applied.current) / widest);
    if (Math.abs(next - applied.current) > 0.005) {
      applied.current = next;
      setFit(next);
    }
  }, [budget, maxScale]);

  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender("fit to width"));

  useEffect(() => {
    const observer = new ResizeObserver(remeasure);
    for (const element of elements.current) {
      if (element) {
        observer.observe(element);
      }
    }
    // The renderer already waits for all font ranges. An extra completion
    // callback changes the fitter's feedback order and can shift stills.
    // Only Web needs to follow ranges fetched on demand after `ready`.
    if (isWebPlayerBuild) {
      document.fonts.addEventListener("loadingdone", remeasure);
    }

    void document.fonts.ready.then(() => {
      remeasure();
      // Two frames so the resized layout has actually painted: continuing the
      // render is what lets the screenshot be taken.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => continueRender(handle)),
      );
    });

    return () => {
      observer.disconnect();
      if (isWebPlayerBuild) {
        document.fonts.removeEventListener("loadingdone", remeasure);
      }
    };
  }, [handle, continueRender, remeasure]);

  return { register, fit };
};
