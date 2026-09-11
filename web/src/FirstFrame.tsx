import { useEffect, useState } from "react";
import { Thumbnail as StillFrame } from "@remotion/player";
import { PlaybackComposition } from "./PlaybackComposition";
import { Thumbnail } from "./Thumbnail";
import { fetchManifest, type ShortSummary } from "./api";
import type { Manifest } from "../../src/types";

/**
 * 動画自身が最初に見せる絵。scene の entrance が出そろった位置を指す。
 *
 * 0 フレーム目は使えない。`SceneShell` は scene 全体を 0.4 秒かけて現すため、
 * 0 フレーム目には背景しかない。
 */
export const firstSceneFrame = (fps: number) => Math.round(fps * 1.2);

/**
 * feed で next / previous に控える short の下敷き。
 *
 * ここには以前 `Poster`、すなわち library 用の別デザインを敷いていた。swipe の前半では
 * その Poster が見え、行き過ぎた時点で固定 player が乗って動画へ切り替わるので、
 * サムネイルが一度出てから動画になるのが見えていた。同じ composition の同じコマを
 * 敷けば、player が乗っても絵は変わらない。
 *
 * manifest が要る。feed は隣接する short を先に取得しているので通常は cache に
 * あるが、届くまでは Poster に戻る。
 */
export const FirstFrame: React.FC<{ short: ShortSummary }> = ({ short }) => {
  const [loaded, setLoaded] = useState<{ src: string; manifest: Manifest } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchManifest(short.manifestSrc)
      .then((manifest) => !cancelled && setLoaded({ src: short.manifestSrc, manifest }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [short.manifestSrc]);

  if (loaded?.src !== short.manifestSrc) {
    return <Thumbnail short={short} layout="video" showMeta={false} />;
  }

  const { manifest } = loaded;
  return (
    <div className="thumb">
      <StillFrame
        component={PlaybackComposition}
        inputProps={{ manifestSrc: loaded.src, manifest }}
        compositionWidth={manifest.width}
        compositionHeight={manifest.height}
        durationInFrames={Math.max(
          1,
          manifest.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0),
        )}
        fps={manifest.fps}
        frameToDisplay={firstSceneFrame(manifest.fps)}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};
