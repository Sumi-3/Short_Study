import { StudyShort, type StudyShortProps } from "../../src/remotion/Composition";

export const PlaybackComposition: React.FC<StudyShortProps> = (props) =>
  props.manifest ? <StudyShort {...props} /> : null;
