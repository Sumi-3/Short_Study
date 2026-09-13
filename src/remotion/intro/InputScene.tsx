import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { PHONE_HEIGHT, PhoneFrame } from "./PhoneFrame";
import { SceneLayout } from "./SceneLayout";
import { ScreenVideo } from "./ScreenVideo";
import type { IntroScene } from "./script";
import { useTheme, withAlpha } from "../theme";

/**
 * 生成物は同時に出来上がるものなので、順を示す矢印ではなく1つの入力から枝分かれさせる。
 * 添える例は、その成果物が何であるかを1行で分からせるものに留める。
 */
const OUTPUTS = [
  { label: "分野・単元の特定", example: "数A 図形の性質" },
  { label: "解説文", example: "問題文 → 方針 → 解説" },
  { label: "アニメーション", example: "グラフ・図形・表" },
  { label: "音声", example: "ナレーションと字幕" },
] as const;

export const InputScene: React.FC<{ scene: IntroScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const enter = (delay: number) => ({
    opacity: interpolate(frame, [delay * fps, (delay + 0.5) * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: theme.easing,
    }),
    translate: interpolate(frame, [delay * fps, (delay + 0.5) * fps], ["0px 26px", "0px 0px"], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: theme.easing,
    }),
  });

  return (
    <SceneLayout title="入力から動画生成まで" narration={scene.narration} durationInFrames={scene.durationInFrames}>
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 96 }}>
        <PhoneFrame height={PHONE_HEIGHT}>
          <ScreenVideo src="intro/input.mp4" placeholder="ここに 入力の録画（撮影・切り抜き・テキスト抽出・音声選択） が入る" />
        </PhoneFrame>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              ...enter(0),
              padding: "20px 26px",
              borderRadius: theme.radius,
              backgroundColor: withAlpha(theme.accents[0], 0.12),
              border: `3px solid ${withAlpha(theme.accents[0], 0.4)}`,
            }}
          >
            <div style={{ color: theme.accents[0], fontFamily: theme.fontFamily, fontSize: 22, fontWeight: 900 }}>
              入力された問題
            </div>
            <div style={{ marginTop: 8, color: theme.ink, fontFamily: theme.fontFamily, fontSize: 30, fontWeight: 700, lineHeight: 1.3 }}>
              y = x² + 4x + c が直線 y = 2x + 1 に接するように c を定めよ
            </div>
          </div>

          {/* 1本の入力が4つに枝分かれすることを、下向きの流れとして見せる。 */}
          <div style={{ ...enter(0.45), display: "flex", justifyContent: "center", color: theme.accents[0], fontFamily: theme.fontFamily, fontSize: 40, fontWeight: 900, lineHeight: 1 }}>
            ↓
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 22 }}>
            {OUTPUTS.map((output, index) => (
              <div
                key={output.label}
                style={{
                  ...enter(0.7 + index * 0.22),
                  padding: "22px 24px",
                  borderRadius: theme.radius,
                  backgroundColor: theme.plate,
                  border: `2px solid ${withAlpha(theme.ink, 0.1)}`,
                }}
              >
                <div
                  style={{
                    color: theme.accents[index % theme.accents.length],
                    fontFamily: theme.fontFamily,
                    fontSize: 30,
                    fontWeight: 900,
                  }}
                >
                  {output.label}
                </div>
                <div style={{ marginTop: 8, color: theme.inkDim, fontFamily: theme.fontFamily, fontSize: 22, fontWeight: 700 }}>
                  {output.example}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SceneLayout>
  );
};
