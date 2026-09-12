import { AbsoluteFill, Series } from "remotion";
import { Background } from "../Background";
import { ThemeProvider, themeOf } from "../theme";
import { AnimationScene } from "./AnimationScene";
import { GeneratedVideoScene } from "./GeneratedVideoScene";
import { InputScene } from "./InputScene";
import { LibraryScene } from "./LibraryScene";
import { OverviewScene } from "./OverviewScene";
import { SYSTEM_INTRO_SCRIPT, type IntroScene } from "./script";
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
          {SYSTEM_INTRO_SCRIPT.map((scene) => (
            <Series.Sequence key={scene.id} name={scene.id} durationInFrames={scene.durationInFrames}>
              <Scene scene={scene} />
            </Series.Sequence>
          ))}
        </Series>
      </AbsoluteFill>
    </ThemeProvider>
  );
};
