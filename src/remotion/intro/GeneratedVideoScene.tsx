import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { LiveShort } from "./LiveShort";
import { PhoneFrame } from "./PhoneFrame";
import { SceneLayout } from "./SceneLayout";
import type { IntroScene } from "./script";
import { useTheme } from "../theme";

const starts = [0, 277, 582];

export const GeneratedVideoScene: React.FC<{ scene: IntroScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  // 3台と矢印2つが横に収まる上限。ここだけは縦ではなく横幅が高さを決める。
  const height = 740;

  return (
    <SceneLayout title="3-2 生成された解説動画" narration={scene.narration} durationInFrames={scene.durationInFrames}>
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 48 }}>
        {starts.map((start, index) => (
          <div key={start} style={{ display: "flex", alignItems: "center", gap: 48 }}>
            <div
              style={{
                opacity: interpolate(frame, [index * fps * 0.22, (index * 0.22 + 0.45) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                scale: interpolate(frame, [index * fps * 0.22, (index * 0.22 + 0.45) * fps], [0.8, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: theme.easing,
                  output: "perceptual-scale",
                }),
              }}
            >
              <PhoneFrame height={height}>
                <LiveShort height={height} startFrame={start} />
              </PhoneFrame>
            </div>
            {index < starts.length - 1 ? (
              <div
                style={{
                  color: theme.accents[0],
                  fontFamily: theme.fontFamily,
                  fontSize: 64,
                  fontWeight: 900,
                  opacity: interpolate(frame, [(index + 0.5) * fps * 0.36, (index + 0.5) * fps * 0.36 + fps * 0.3], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                  translate: interpolate(frame, [(index + 0.5) * fps * 0.36, (index + 0.5) * fps * 0.36 + fps * 0.3], ["-20px 0px", "0px 0px"], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                →
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </SceneLayout>
  );
};
