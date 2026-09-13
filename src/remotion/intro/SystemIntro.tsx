import { AbsoluteFill, Series } from "remotion";
import { Audio } from "@remotion/media";
import { assetSrc } from "../assetSrc";
import { SYSTEM_INTRO_VIDEO } from "../../config-video";
import { Background } from "../Background";
import { ThemeProvider, themeOf } from "../theme";
import { AnimationScene } from "./AnimationScene";
import { GeneratedVideoScene } from "./GeneratedVideoScene";
import { InputScene } from "./InputScene";
import { LibraryScene } from "./LibraryScene";
import { OverviewScene } from "./OverviewScene";
import {
  introDurationInFrames,
  introNarrationFor,
  SYSTEM_INTRO_SCRIPT,
  type IntroScene,
} from "./script";
import { TitleScene } from "./TitleScene";

const Scene: React.FC<{ scene: IntroScene }> = ({ scene }) => {
  switch (scene.visual) {
    case "title": return <TitleScene />;
    case "overview": return <OverviewScene scene={scene} />;
    case "input": return <InputScene scene={scene} />;
    case "generated-video": return <GeneratedVideoScene scene={scene} />;
    case "animation-gallery": return <AnimationScene scene={scene} />;
    case "library": return <LibraryScene scene={scene} />;
  }
};

export const SystemIntro: React.FC = () => {
  const theme = themeOf();
  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill
        style={{
          backgroundColor: theme.bgDeep,
        }}
      >
        <Background />
        <Series>
          {SYSTEM_INTRO_SCRIPT.map((scene) => {
            const narration = introNarrationFor(scene);
            return (
              <Series.Sequence
                key={scene.id}
                name={scene.id}
                durationInFrames={introDurationInFrames(scene, SYSTEM_INTRO_VIDEO.fps)}
              >
                {narration ? (
                  <Audio
                    src={assetSrc(narration.audioSrc)}
                    durationInFrames={Math.ceil(narration.durationInSeconds * SYSTEM_INTRO_VIDEO.fps)}
                  />
                ) : null}
                <Scene scene={scene} />
              </Series.Sequence>
            );
          })}
        </Series>
      </AbsoluteFill>
    </ThemeProvider>
  );
};
