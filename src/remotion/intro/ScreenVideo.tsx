import { Video } from "@remotion/media";
import { useTheme, withAlpha } from "../theme";
import { assetSrc } from "../assetSrc";

export const ScreenVideo: React.FC<{ src?: string; placeholder: string }> = ({
  src,
  placeholder,
}) => {
  const theme = useTheme();

  if (src) {
    return <Video src={assetSrc(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
        boxSizing: "border-box",
        backgroundColor: withAlpha(theme.accents[0], 0.1),
        color: theme.ink,
        fontFamily: theme.fontFamily,
        fontWeight: 900,
        fontSize: 26,
        lineHeight: 1.45,
        textAlign: "center",
      }}
    >
      <div
        style={{
          padding: "24px 18px",
          border: `3px dashed ${withAlpha(theme.accents[0], 0.72)}`,
          borderRadius: theme.radius,
          backgroundColor: theme.plate,
        }}
      >
        {placeholder}
      </div>
    </div>
  );
};
