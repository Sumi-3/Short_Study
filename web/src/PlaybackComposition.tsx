import { createContext, useContext, useLayoutEffect } from "react";
import { useCurrentScale } from "remotion";
import { StudyShort, type StudyShortProps } from "../../src/remotion/Composition";

export const PlaybackLayoutContext = createContext<((scale: number | null) => void) | null>(null);

export const PlaybackComposition: React.FC<StudyShortProps> = (props) => {
  const onLayout = useContext(PlaybackLayoutContext);
  const scale = useCurrentScale();

  // scalechange は passive effect で届くため、等倍の commit を paint 前に止められない。
  // transform と同じ render の scale を通知し、寸法が合うまでは下の FirstFrame に譲る。
  useLayoutEffect(() => {
    onLayout?.(props.manifest ? scale : null);
  }, [onLayout, props.manifest, scale]);

  return props.manifest ? <StudyShort {...props} /> : null;
};
