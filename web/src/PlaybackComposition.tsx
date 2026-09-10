import { useContext, useLayoutEffect } from "react";
import { Internals } from "remotion";
import { StudyShort, type StudyShortProps } from "../../src/remotion/Composition";
import type { AudioGate } from "./audioGate";

export const PlaybackComposition: React.FC<StudyShortProps & { audioGate: AudioGate }> = ({
  audioGate, ...props
}) => {
  // Player 自身が resume する context を検証する。別 context の解除は証明にならない。
  // 4.0.518 の内部 API のため、Remotion 更新時はこの接続も確認する。
  const context = useContext(Internals.SharedAudioContext);
  useLayoutEffect(() => {
    audioGate.setContext(context);
    return () => audioGate.setContext(null);
  }, [audioGate, context]);
  return <StudyShort {...props} />;
};
