import { PHONE_HEIGHT, PhoneFrame } from "./PhoneFrame";
import { SceneLayout } from "./SceneLayout";
import { ScreenVideo } from "./ScreenVideo";
import type { IntroScene } from "./script";

export const InputScene: React.FC<{ scene: IntroScene }> = ({ scene }) => (
  <SceneLayout title="3-1 入力から動画生成まで" narration={scene.narration} durationInFrames={scene.durationInFrames}>
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 130 }}>
      <PhoneFrame height={PHONE_HEIGHT}>
        <ScreenVideo placeholder="ここに 3-1 左の録画（写真撮影・テキスト抽出） が入る" />
      </PhoneFrame>
      <PhoneFrame height={PHONE_HEIGHT}>
        <ScreenVideo placeholder="ここに 3-1 右の録画（画像入力・テキスト抽出） が入る" />
      </PhoneFrame>
    </div>
  </SceneLayout>
);
