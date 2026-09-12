import { Composition } from "remotion";
import {
  StudyShort,
  calculateStudyShortMetadata,
  type StudyShortProps,
} from "./Composition";
import { SYSTEM_INTRO_VIDEO, VIDEO } from "../config-video";
import { SystemIntro } from "./intro/SystemIntro";
import { SYSTEM_INTRO_DURATION_IN_FRAMES } from "./intro/script";

const defaultProps: StudyShortProps = {
  // render ごとに `--props` で上書きする。`mock` は repository に入っている sample。
  manifestSrc: "projects/mock/manifest.json",
  manifest: null,
  animateHookEntrance: true,
  renderCaptions: true,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="StudyShort"
        component={StudyShort}
        durationInFrames={VIDEO.fps * 50}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
        defaultProps={defaultProps}
        calculateMetadata={calculateStudyShortMetadata}
      />
      <Composition
        id="SystemIntro"
        component={SystemIntro}
        durationInFrames={SYSTEM_INTRO_DURATION_IN_FRAMES}
        fps={SYSTEM_INTRO_VIDEO.fps}
        width={SYSTEM_INTRO_VIDEO.width}
        height={SYSTEM_INTRO_VIDEO.height}
      />
    </>
  );
};
