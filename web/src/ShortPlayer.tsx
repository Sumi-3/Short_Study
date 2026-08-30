import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { StudyShort } from "../../src/remotion/Composition";
import { fetchManifest } from "./api";
import type { Manifest } from "../../src/types";

const PLAYER_STYLE = { width: "100%", height: "100%" } as const;

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/**
 * The seek bar. Also owns the frame counter so the player's parent does not
 * re-render 30 times a second — that mattered a lot: every re-render rebuilt
 * `inputProps`, Remotion treated it as new input, and re-scheduled the audio
 * chunk queue, so the same 24ms chunk landed twice at the same timestamp and
 * you heard the first syllable of a word twice ("一発" → "い一発").
 */
const Scrubber: React.FC<{
  player: React.RefObject<PlayerRef | null>;
  durationInFrames: number;
  fps: number;
}> = ({ player, durationInFrames, fps }) => {
  const [frame, setFrame] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const instance = player.current;
    if (!instance) {
      return;
    }
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    instance.addEventListener("frameupdate", onFrame);
    return () => instance.removeEventListener("frameupdate", onFrame);
  }, [player]);

  const seek = useCallback(
    (clientX: number) => {
      const rect = track.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) {
        return;
      }
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const next = Math.min(durationInFrames - 1, Math.round(ratio * durationInFrames));
      // Optimistic, so the fill tracks the finger even between frame events.
      setFrame(next);
      player.current?.seekTo(next);
    },
    [durationInFrames, player],
  );

  const percent = durationInFrames > 0 ? (frame / durationInFrames) * 100 : 0;

  return (
    <div
      className={`scrubber${scrubbing ? " is-scrubbing" : ""}`}
      // Every handler stops propagation: the whole player surface is a
      // play/pause target, and dragging the bar must not also toggle it.
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        setScrubbing(true);
        seek(event.clientX);
      }}
      onPointerMove={(event) => {
        if (scrubbing) {
          event.stopPropagation();
          seek(event.clientX);
        }
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        // Releasing a capture that was never taken throws.
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setScrubbing(false);
      }}
      onPointerCancel={() => setScrubbing(false)}
      onClick={(event) => event.stopPropagation()}
    >
      {scrubbing ? (
        <div className="scrubber__time">
          {clock(frame / fps)} / {clock(durationInFrames / fps)}
        </div>
      ) : null}
      <div className="scrubber__track" ref={track}>
        <div className="scrubber__fill" style={{ width: `${percent}%` }} />
        <div className="scrubber__knob" style={{ left: `${percent}%` }} />
      </div>
    </div>
  );
};

/**
 * Plays a generated short in the browser with no MP4 involved: `<Player>` runs
 * the same React composition the renderer uses, so a finished manifest is
 * watchable the moment the pipeline writes it.
 *
 * Playback starts on a tap, never automatically — iOS Safari and Android
 * Chrome both refuse to start audio without a user gesture, so an `autoPlay`
 * short would sit silently on the first frame.
 */
export const ShortPlayer: React.FC<{
  manifestSrc: string;
  /**
   * Whether the viewer has already tapped something this session. Browsers only
   * allow programmatic playback after a user gesture, so the first short waits
   * for a tap and every later swipe starts on its own.
   *
   * A ref rather than a prop value on purpose: as state it re-rendered this
   * component during the very tap that set it, so the auto-start effect and the
   * click handler both fired for the same gesture.
   */
  hasGesture: React.RefObject<boolean>;
}> = ({ manifestSrc, hasGesture }) => {
  const player = useRef<PlayerRef>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  /** A ref so the click handler can never read a stale value and re-start. */
  const started = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setManifest(null);
    setError(null);
    setPlaying(false);
    started.current = false;

    fetchManifest(manifestSrc)
      .then((loaded) => !cancelled && setManifest(loaded))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));

    return () => {
      cancelled = true;
    };
  }, [manifestSrc]);

  useEffect(() => {
    const instance = player.current;
    if (!instance) {
      return;
    }

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    instance.addEventListener("play", onPlay);
    instance.addEventListener("pause", onPause);

    return () => {
      instance.removeEventListener("play", onPlay);
      instance.removeEventListener("pause", onPause);
    };
  }, [manifest]);

  // Runs once per mounted short. Swiping to a new one after the first tap
  // starts it without another tap; the first one finds no gesture yet and waits.
  useEffect(() => {
    const instance = player.current;
    if (!manifest || !instance || !hasGesture.current || started.current) {
      return;
    }
    started.current = true;
    instance.seekTo(0);
    instance.play();
  }, [manifest, hasGesture]);

  const toggle = useCallback((event: React.MouseEvent) => {
    const instance = player.current;
    if (!instance) {
      return;
    }
    // Capture phase runs before the scrubber's own handlers, so its
    // stopPropagation cannot keep a drag from also toggling playback. Ask
    // where the click came from instead.
    if ((event.target as HTMLElement).closest(".scrubber")) {
      return;
    }
    // The event is passed on rather than dropped: the Player warms a pool of
    // silent audio tags during a real user gesture, and only tags warmed that
    // way are allowed to make sound on mobile. Calling play() without it
    // leaves the narration silent on a phone while the video runs.
    if (!started.current) {
      // The poster sits a beat into the hook so the thumbnail is not the blank
      // frame every scene fades in from. Rewind on the first real play.
      started.current = true;
      instance.seekTo(0);
      instance.play(event);
      return;
    }
    instance.toggle(event);
  }, []);

  // Stable identity: a fresh object here is read as a prop change and costs an
  // audio re-schedule on every render.
  const inputProps = useMemo(
    () => (manifest ? { manifestSrc, manifest } : null),
    [manifestSrc, manifest],
  );

  const durationInFrames = useMemo(
    () =>
      manifest
        ? manifest.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0)
        : 0,
    [manifest],
  );

  if (error) {
    return <div className="player-placeholder">読み込めませんでした: {error}</div>;
  }

  if (!manifest || !inputProps) {
    return <div className="player-placeholder">読み込み中…</div>;
  }

  return (
    <div className="short" onClickCapture={toggle}>
      <Player
        ref={player}
        component={StudyShort}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        compositionWidth={manifest.width}
        compositionHeight={manifest.height}
        fps={manifest.fps}
        initialFrame={Math.round(manifest.fps * 1.2)}
        loop
        controls={false}
        clickToPlay={false}
        style={PLAYER_STYLE}
      />

      {playing ? null : (
        <div className="short__overlay">
          <div className="short__play" aria-hidden>
            ▶
          </div>
          <p className="short__hint">タップして再生</p>
        </div>
      )}

      <Scrubber
        player={player}
        durationInFrames={durationInFrames}
        fps={manifest.fps}
      />
    </div>
  );
};
