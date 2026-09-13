import { useEffect, useState } from "react";
import { Video } from "@remotion/media";
import { useTheme, withAlpha } from "../theme";
import { assetSrc } from "../assetSrc";

export const ScreenVideo: React.FC<{ src?: string; placeholder: string }> = ({
  src,
  placeholder,
}) => {
  const theme = useTheme();
  /*
   * 録画が未収録でも Studio と still を止めない。`Video` は onError を渡さないと
   * MediaPlaybackError を throw し、1本欠けただけで紹介動画全体が開けなくなる。
   * 差し替えを何度もやる作りなので、欠けている間はプレースホルダへ落とす。
   */
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (src && !failed) {
    return (
      <Video
        src={assetSrc(src)}
        onError={() => {
          setFailed(true);
          // throw させず、こちらのプレースホルダへ切り替える。
          return "fallback";
        }}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
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
        <div>{placeholder}</div>
        {/* 置き場所を間違えても、どの path を探したかがその場で分かるようにする。 */}
        {src ? (
          <div style={{ marginTop: 14, color: theme.inkDim, fontSize: 20, fontWeight: 700 }}>
            public/{src}
          </div>
        ) : null}
      </div>
    </div>
  );
};
