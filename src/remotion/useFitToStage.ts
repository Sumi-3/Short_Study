import { useLayoutEffect, useRef, useState } from "react";
import { useDelayRender } from "remotion";

/**
 * gap、arrow、caption と annotation の領域を含む block 全体を scale する。font size だけでは
 * 入れ子の分数や aligned environment を収められない。rough SVG annotation は文字本体の幅予算を
 * 越え得るので、同じ縮小で測定済み幅も収める。offsetHeight は Player/entrance の transform と
 * 自身の scale を無視するため、縮小済みの高さを次の fit へ戻してしまわない。
 *
 * SceneShell の終端は 1920 - 100 - 212 - 44 = 1564。残る stage 高は実際の heading と56px gapを
 * すでに除いている。content 高を H、利用可能高を B とすると、s = min(1, B/H) により行を落とさず
 * H*s <= B を保証できる。companion は (stage height - 20px grid gap) の最大40%にとどめ、diagram に
 * 最低60%を残す。短い companion は引き続き自分の高さだけを使う。
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
      // DOM の整数サイズは最も近い pixel へ丸められる。content は切り上げ、budget は切り下げて、
      // 小数の最後の1 pixel が B を越えないようにする。
      const height = content.offsetHeight + 1;
      /*
       * `viewport` は自身の高さを `flex-grow` から得る parent 内で `height: 100%` になっている。
       * この percentage を flex で解決した高さに対して解決するかが、engine 間で食い違う点である。
       * Blink は definite と扱い、WebKit は indefinite のまま0を返すことがある。stage に直接
       * 問えば両者で同じ値になる。
       */
      const budget = compact
        ? Math.max(0, stage.clientHeight - 21) * 0.4
        : Math.max(0, (viewport.clientHeight || stage.clientHeight) - 1);
      /*
       * budget が0なのは stage がまだ layout されていないのであって、content を消すべきではない。
       * ここで0へ scale すると復帰できない。observer が監視する box 自身のサイズは二度と変わらず、
       * 再測定を起こすものがなく、scene の間じゅう block が見えないままになる。`useFitToWidth` も
       * 幅に同じ guard を置く。測定を飛ばし、最後に得た正しい fit を保つ。
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
        // placement box は本文が左端を使えるよう stage を埋める。その幅ではこの ratio が1になるため、
        // 代わりに最も幅広い測定済み row へ fit し、formula 本来の幅を保つ。
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
    // 全幅の placement box は rough mark が1 rowだけを広げても resize しない。測定済み row も
    // 監視し、遅れて加わる SVG padding を stage 外へ逃がさず同じ intrinsic-width fit に含める。
    for (const child of Array.from(content.children)) {
      if (child instanceof HTMLElement && child.dataset.formulaMeasure !== undefined) {
        observer.observe(child);
      }
    }
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
