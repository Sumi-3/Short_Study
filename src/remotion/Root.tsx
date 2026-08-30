import { Composition } from "remotion";
import {
  StudyShort,
  calculateStudyShortMetadata,
  type StudyShortProps,
} from "./Composition";
import { VIDEO } from "../config-video";

const defaultProps: StudyShortProps = {
  // Overridden per render via `--props`. `mock` is the checked-in sample.
  manifestSrc: "projects/mock/manifest.json",
  manifest: null,
};

export const RemotionRoot: React.FC = () => {
  return (
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
  );
};
