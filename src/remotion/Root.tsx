import { Composition } from "remotion";
import {
  StudyShort,
  calculateStudyShortMetadata,
  type StudyShortProps,
} from "./Composition";
import { VIDEO } from "../config-video";

const defaultProps: StudyShortProps = {
  // render ごとに `--props` で上書きする。Studio を素で開いたときの表示用に、同梱した
  // 生成物の中から図形と式の両方が出る 1 本を指しておく。
  manifestSrc: "projects/m3-pythagoras/manifest.json",
  manifest: null,
  animateHookEntrance: true,
  renderCaptions: true,
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
