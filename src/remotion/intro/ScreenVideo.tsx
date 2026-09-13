import { useEffect, useState } from "react";
import { Video } from "@remotion/media";
import { getVideoMetadata } from "@remotion/media-utils";
import { useDelayRender } from "remotion";
import { useTheme, withAlpha } from "../theme";
import { assetSrc } from "../assetSrc";
import { PhoneFrame } from "./PhoneFrame";

const FALLBACK_ASPECT_RATIO = 9 / 16;

const useScreenVideoAspectRatio = (src: string | undefined, playbackFailed: boolean) => {
  const [aspectRatio, setAspectRatio] = useState(FALLBACK_ASPECT_RATIO);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender("load screen recording dimensions"));

  useEffect(() => {
    let cancelled = false;
    const settle = (nextAspectRatio: number) => {
      if (cancelled) {
        continueRender(handle);
        return;
      }
      setAspectRatio(nextAspectRatio);
      // state の commit より先に render を再開すると、初期値の枠を still が拾える。
      requestAnimationFrame(() => continueRender(handle));
    };

    if (!src || playbackFailed) {
      settle(FALLBACK_ASPECT_RATIO);
      return () => {
        cancelled = true;
      };
    }

    // 最初の描画を待たせ、9:16 から実寸比への切り替わりを render 済み frame に残さない。
    void getVideoMetadata(assetSrc(src))
      .then(({ width, height }) => {
        const nextAspectRatio = width / height;
        settle(
          Number.isFinite(nextAspectRatio) && nextAspectRatio > 0
            ? nextAspectRatio
            : FALLBACK_ASPECT_RATIO,
        );
      })
      .catch(() => settle(FALLBACK_ASPECT_RATIO));

    return () => {
      cancelled = true;
    };
  }, [continueRender, handle, playbackFailed, src]);

  return aspectRatio;
};

export const ScreenVideo: React.FC<{
  src?: string;
  placeholder: string;
  onPlaybackError?: () => void;
}> = ({
  src,
  placeholder,
  onPlaybackError,
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
        muted
        onError={() => {
          setFailed(true);
          onPlaybackError?.();
          // throw させず、こちらのプレースホルダへ切り替える。
          return "fallback";
        }}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
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

/** 録画の上端を覆わず、実寸の画面を先に確定してから枠を描く。 */
export const ScreenPhoneFrame: React.FC<{
  height: number;
  src?: string;
  placeholder: string;
}> = ({ height, src, placeholder }) => {
  const [playbackFailed, setPlaybackFailed] = useState(false);
  useEffect(() => setPlaybackFailed(false), [src]);
  const aspectRatio = useScreenVideoAspectRatio(src, playbackFailed);

  return (
    <PhoneFrame height={height} aspectRatio={aspectRatio}>
      <ScreenVideo
        src={src}
        placeholder={placeholder}
        onPlaybackError={() => setPlaybackFailed(true)}
      />
    </PhoneFrame>
  );
};
