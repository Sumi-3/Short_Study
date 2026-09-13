import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { LiveShort } from "./LiveShort";
import { PHONE_HEIGHT, PhoneFrame } from "./PhoneFrame";
import { SceneLayout } from "./SceneLayout";
import { ScreenVideo } from "./ScreenVideo";
import type { IntroScene } from "./script";

export const OverviewScene: React.FC<{ scene: IntroScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const height = PHONE_HEIGHT;
  const enter = (index: number) => ({
    opacity: interpolate(frame, [index * fps * 0.25, (index * 0.25 + 0.55) * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    translate: interpolate(frame, [index * fps * 0.25, (index * 0.25 + 0.55) * fps], ["0px 44px", "0px 0px"], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  });

  return (
    <SceneLayout title="数学をショート動画に" narration={scene.narration} durationInFrames={scene.durationInFrames}>
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 120 }}>
        <div style={enter(0)}>
          <PhoneFrame height={height}>
            <ScreenVideo src="intro/feed.mp4" placeholder="ここに 概要・左のフィード録画 が入る" />
          </PhoneFrame>
        </div>
        <div style={enter(1)}>
          <PhoneFrame height={height}>
            <LiveShort height={height} />
          </PhoneFrame>
        </div>
      </div>
    </SceneLayout>
  );
};
