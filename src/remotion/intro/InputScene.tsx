import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { PHONE_HEIGHT } from "./PhoneFrame";
import { SceneLayout } from "./SceneLayout";
import { ScreenPhoneFrame } from "./ScreenVideo";
import { introDurationInFrames, type IntroScene } from "./script";
import { activeSentenceIndex, sentenceWindows } from "./sentenceWindows";
import { useTheme, withAlpha } from "../theme";

/**
 * 入力から動画までは順に進む処理なので、枝分かれではなく一本の流れで見せる。
 * 添える一行は、その工程で何が起きるかを具体物で示すものに留める。
 */
const STEPS = [
  { label: "画像の入力", detail: "撮影、または画像を選ぶ" },
  { label: "テキストの抽出", detail: "数秒で完了、テキストの入力も可能" },
  { label: "動画の生成", detail: "解説文・アニメーション・音声の生成" },
] as const;

export const InputScene: React.FC<{ scene: IntroScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  /*
   * ナレーションは「画像を入力します」「テキストの抽出が行われます」「動画の生成を行います」と
   * 工程順に進むので、塗りつぶしもその文に合わせて送る。文は工程より多く、最後の文
   * （動画は1、2分で生成されます）も最終工程の話なので、超えたぶんは末尾に留める。
   */
  const windows = sentenceWindows(scene.narration, introDurationInFrames(scene, fps), fps);
  const spokenStep = windows.length > 0
    ? Math.min(activeSentenceIndex(windows, frame), STEPS.length - 1)
    : STEPS.length - 1;

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
        <ScreenPhoneFrame height={PHONE_HEIGHT} src="intro/input.mp4" placeholder="ここに 入力の録画（撮影・切り抜き・テキスト抽出・音声選択） が入る" />

        {/* 中身は短い一行なので、余白を埋めるためにブロックを伸ばさない。幅を中身に
            見合う値で決め、余ったぶんは端末ごと中央へ寄せる。 */}
        <div style={{ width: 760, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {STEPS.map((step, index) => (
            <div key={step.label}>
              <div
                style={{
                  ...enter(index * 0.55),
                  padding: "26px 30px",
                  borderRadius: theme.radius,
                  backgroundColor: index === spokenStep ? withAlpha(theme.accents[0], 0.12) : theme.plate,
                  border: `3px solid ${withAlpha(theme.accents[0], index === spokenStep ? 0.4 : 0.16)}`,
                }}
              >
                <div style={{ color: theme.accents[0], fontFamily: theme.fontFamily, fontSize: 40, fontWeight: 800 }}>
                  {step.label}
                </div>
                <div style={{ marginTop: 8, color: theme.ink, fontFamily: theme.fontFamily, fontSize: 30, fontWeight: 700, lineHeight: 1.3 }}>
                  {step.detail}
                </div>
              </div>
              {/* 矢印は工程の間にだけ置く。最後の下に出すと、まだ続きがあるように読める。 */}
              {index < STEPS.length - 1 ? (
                <div
                  style={{
                    ...enter(index * 0.55 + 0.3),
                    display: "flex",
                    justifyContent: "center",
                    color: theme.accents[0],
                    fontFamily: theme.fontFamily,
                    fontSize: 72,
                    fontWeight: 800,
                    lineHeight: 1.1,
                  }}
                >
                  ↓
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </SceneLayout>
  );
};
