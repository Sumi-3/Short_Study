import { useEffect, useMemo, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { MathText } from "../../src/remotion/MathText";
import { themeOf } from "../../src/remotion/theme";
import { explanationOf, type ExplanationFormulaBlock, type ExplanationSection } from "../../src/explanation";
import type { Manifest } from "../../src/types";

const substitutionLabel = (substitution: string) =>
  substitution.endsWith("を代入") ? substitution : `${substitution} を代入`;

const Formula: React.FC<{ block: ExplanationFormulaBlock }> = ({ block }) => (
  <div className={`explanation__formula explanation__formula--${block.annotation ?? "plain"}`}>
    {block.substitution ? (
      <p className="explanation__substitution">
        <MathText text={substitutionLabel(block.substitution)} display={false} />
      </p>
    ) : null}
    <MathText text={block.latex} formula />
  </div>
);

const Section: React.FC<{
  section: ExplanationSection;
  active: boolean;
  onSelect: (event: React.SyntheticEvent<HTMLElement>, frame: number) => void;
}> = ({ section, active, onSelect }) => (
  <div
    className={`explanation__section${active ? " is-active" : ""}`}
    role="button"
    tabIndex={0}
    onClick={(event) => onSelect(event, section.startFrame)}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(event, section.startFrame);
      }
    }}
  >
    <span className="explanation__section-heading">
      {section.heading || "解説"}
      {active ? <span className="explanation__now">再生中</span> : null}
    </span>
    <div className="explanation__blocks">
      {section.blocks.map((block, index) => {
        switch (block.type) {
          case "prose":
            return <span className="explanation__prose" key={index}><MathText text={block.text} /></span>;
          case "formula":
            return <Formula block={block} key={index} />;
          case "bullets":
            return (
              <ul className="explanation__bullets" key={index}>
                {block.items.map((item, itemIndex) => <li key={itemIndex}><MathText text={item} /></li>)}
              </ul>
            );
          case "caption":
            return <span className="explanation__caption" key={index}><MathText text={block.text} /></span>;
        }
      })}
    </div>
  </div>
);

/**
 * frame はこの reader の中だけで購読する。親まで毎フレーム再描画すると Player の inputProps
 * が作り直され、Remotion が音声を二重にスケジュールする既知の不具合を再発させるためである。
 */
export const Explanation: React.FC<{
  manifest: Manifest;
  player: React.RefObject<PlayerRef | null>;
  onOpen: () => void;
  onSeekAndPlay: (event: React.SyntheticEvent<HTMLElement>, frame: number) => void;
}> = ({ manifest, player, onOpen, onSeekAndPlay }) => {
  const [open, setOpen] = useState(false);
  const [frame, setFrame] = useState(0);
  const sections = useMemo(() => explanationOf(manifest), [manifest]);
  const theme = themeOf();

  useEffect(() => {
    if (!open) return;
    const instance = player.current;
    if (!instance) return;
    setFrame(instance.getCurrentFrame());
    const onFrame = (event: { detail: { frame: number } }) => setFrame(event.detail.frame);
    instance.addEventListener("frameupdate", onFrame);
    return () => instance.removeEventListener("frameupdate", onFrame);
  }, [open, player]);

  const activeIndex = sections.reduce(
    (current, section, index) => (section.startFrame <= frame ? index : current),
    0,
  );

  return (
    <>
      <button
        className="explanation-control"
        type="button"
        aria-expanded={open}
        aria-controls="explanation-sheet"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            setOpen(false);
            return;
          }
          onOpen();
          setOpen(true);
        }}
      >
        解説
      </button>

      {open ? (
        <div
          className="explanation-sheet"
          id="explanation-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="動画の解説"
          style={{
            "--explanation-bg": theme.bg,
            "--explanation-deep": theme.bgDeep,
            "--explanation-ink": theme.ink,
            "--explanation-ink-dim": theme.inkDim,
            "--explanation-accent": theme.accents[0],
          } as React.CSSProperties}
          // 親の全面タップだけでなく、この上での選択やスクロールも video 操作に渡さない。
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="explanation__backdrop"
            type="button"
            aria-label="解説を閉じる"
            onClick={() => setOpen(false)}
          />
          <div className="explanation__panel">
            <div className="explanation__handle" aria-hidden />
            <header className="explanation__header">
              <div>
                <p className="explanation__eyebrow">
                  {manifest.unit || "解説"}{manifest.difficulty ? ` ・ 難易度 ${manifest.difficulty}` : ""}
                </p>
                <h2><MathText text={manifest.topic} /></h2>
              </div>
              <button className="explanation__close" type="button" onClick={() => setOpen(false)}>
                閉じる
              </button>
            </header>
            <div className="explanation__list">
              {sections.map((section, index) => (
                <Section
                  key={`${section.startFrame}-${section.heading}`}
                  section={section}
                  active={index === activeIndex}
                  onSelect={(event, startFrame) => {
                    event.stopPropagation();
                    setOpen(false);
                    onSeekAndPlay(event, startFrame);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
