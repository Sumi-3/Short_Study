import { useCallback, useEffect, useRef, useState } from "react";
import { useDelayRender } from "remotion";

/**
 * 登録された要素のうち最も幅広いものが `budget` を満たすよう、文字サイズを決める。
 *
 * `maxScale` は記述時のサイズをどこまで超えて拡大できるかを表す。1なら数式向けの縮小専用、
 * table なら与えられた空間まで広がる方がよい。
 *
 * 見た目ほど単純でない理由は2つある。
 *
 * Webfonts: KaTeX と日本語 font は必要になって初めて fetch されるため、browser では要求前に
 * `document.fonts.ready` が resolve し得る。その時点で測ると fallback の metrics を使い、後で
 * 行がより広く reflow する。その切り替わりを捕捉するのが observer である。
 *
 * Feedback: 結果を適用すると測っている幅自体が変わるため、測定幅を現在の fit で割って
 * 等倍時の幅を復元する。これがなければ測定のたびに文字がさらに縮む。
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

    void document.fonts.ready.then(() => {
      remeasure();
      // resize 後の layout が実際に paint されるまで2 frame待つ。render を続行すると screenshot を
      // 撮れるようになる。
      requestAnimationFrame(() =>
        requestAnimationFrame(() => continueRender(handle)),
      );
    });

    return () => observer.disconnect();
  }, [handle, continueRender, remeasure]);

  return { register, fit };
};
