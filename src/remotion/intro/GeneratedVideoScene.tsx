import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneLayout } from "./SceneLayout";
import { ScreenPhoneFrame } from "./ScreenVideo";
import type { IntroScene } from "./script";
import { useTheme } from "../theme";

const recordings = [
  { src: "intro/scene-1.mp4", placeholder: "ここに 問題文の読み上げ が入る" },
  { src: "intro/scene-2.mp4", placeholder: "ここに 回答方針の説明 が入る" },
  { src: "intro/scene-3.mp4", placeholder: "ここに アニメーション解説 が入る" },
] as const;

export const GeneratedVideoScene: React.FC<{ scene: IntroScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  // 録画の実寸比で画面幅が少し広がっても、3台と矢印2つを同じ列に保つ。
  const height = 720;

  return (
    <SceneLayout title="生成された解説動画" narration={scene.narration} durationInFrames={scene.durationInFrames}>
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 48 }}>
        {recordings.map((recording, index) => (
          <div key={recording.src} style={{ display: "flex", alignItems: "center", gap: 48 }}>
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
              <ScreenPhoneFrame height={height} src={recording.src} placeholder={recording.placeholder} />
            </div>
            {index < recordings.length - 1 ? (
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
