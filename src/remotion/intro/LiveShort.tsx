import { Sequence } from "remotion";
import mockManifest from "../../../public/projects/mock/manifest.json";
import { StudyShort } from "../Composition";
import type { Manifest } from "../../types";

const MOCK_DURATION_IN_FRAMES = 1457;
const SHORT_WIDTH = 1080;
const SHORT_HEIGHT = 1920;

export const LiveShort: React.FC<{ height: number; startFrame?: number }> = ({
  height,
  startFrame = 0,
}) => {
  const scale = height / SHORT_HEIGHT;

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>
      <div
        style={{
          width: SHORT_WIDTH,
          height: SHORT_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <Sequence from={-startFrame} durationInFrames={MOCK_DURATION_IN_FRAMES + startFrame} layout="absolute-fill">
          <StudyShort
            manifestSrc="projects/mock/manifest.json"
            manifest={mockManifest as Manifest}
            animateHookEntrance={false}
            renderCaptions={false}
            renderAudio={false}
          />
        </Sequence>
      </div>
    </div>
  );
};
