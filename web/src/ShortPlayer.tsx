import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { StudyShort } from "../../src/remotion/Composition";
import { fetchManifest } from "./api";
import type { AudioGate } from "./audioGate";
import type { Manifest } from "../../src/types";

const PLAYER_STYLE = { width: "100%", height: "100%" } as const;
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5] as const;
const PAUSE_OVERLAY_HOLD_MS = 700;
const PAUSE_OVERLAY_FADE_MS = 200;

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

const SpeedControl: React.FC<{
  playbackRate: number;
  onChange: (playbackRate: number) => void;
}> = ({ playbackRate, onChange }) => {
  return (
    <label
      className="speed-control"
      // The parent uses capture phase for its whole-surface play/pause target.
      // Keep this as well as its closest() check so a speed change is never a
      // play/pause tap when the control's markup changes later.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="speed-control__label">速度</span>
      <select
        className="speed-control__select"
        value={playbackRate}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="再生速度"
      >
        {PLAYBACK_RATES.map((rate) => (
          <option key={rate} value={rate}>
            {rate}x
          </option>
        ))}
      </select>
    </label>
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
   * Session-wide audio state. The first short waits for a tap because only a
   * play() made inside that click unlocks the Player's audio tags; every later
   * one starts on its own and is handed the swipe that brought it on screen.
   *
   * A ref rather than a prop value on purpose: as state it re-rendered this
   * component during the very tap that set it, so the auto-start effect and the
   * click handler both fired for the same gesture.
   */
  gate: React.RefObject<AudioGate>;
}> = ({ manifestSrc, gate }) => {
  const player = useRef<PlayerRef>(null);
  /**
   * The manifest and the address it came from, together.
   *
   * They are one piece of state rather than two because they are handed to the
   * composition as a pair, and a render where the new `manifestSrc` sits beside
   * the previous `manifest` would be a lie about what is on screen.
   */
  const [loaded, setLoaded] = useState<{ src: string; manifest: Manifest } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  // `gate` is deliberately a ref for the audio path. This small mirror is
  // only for rendering the first-tap prompt after that ref changes.
  const [audioUnlocked, setAudioUnlocked] = useState(() => gate.current.unlocked);
  const [pauseOverlay, setPauseOverlay] = useState<"hidden" | "shown" | "fading">(
    "hidden",
  );
  /** A ref so the click handler can never read a stale value and re-start. */
  const started = useRef(false);
  const pauseOverlayTimers = useRef<number[]>([]);
  /** Set while the app pauses on its own, so `onPause` can tell the two apart. */
  const programmaticPause = useRef(false);

  const clearPauseOverlayTimers = useCallback(() => {
    pauseOverlayTimers.current.forEach((timer) => window.clearTimeout(timer));
    pauseOverlayTimers.current = [];
  }, []);

  const showPauseOverlay = useCallback(() => {
    clearPauseOverlayTimers();
    setPauseOverlay("shown");
    pauseOverlayTimers.current = [
      window.setTimeout(() => {
        setPauseOverlay("fading");
      }, PAUSE_OVERLAY_HOLD_MS),
      window.setTimeout(() => {
        setPauseOverlay("hidden");
        pauseOverlayTimers.current = [];
      }, PAUSE_OVERLAY_HOLD_MS + PAUSE_OVERLAY_FADE_MS),
    ];
  }, [clearPauseOverlayTimers]);

  useEffect(() => clearPauseOverlayTimers, [clearPauseOverlayTimers]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    started.current = false;
    // Silence the outgoing short at once — the viewer has already swiped away
    // from it, and the next manifest is a fetch away.
    //
    // This pause is the app's, not the viewer's. Without the flag it reaches
    // the same handler a tap does, so every swipe dropped the scrim and the
    // play mark over the incoming short until it started — the one place the
    // overlay has nothing to say, since nobody asked for a pause.
    // Only when there is something to pause: on the first mount there is no
    // player yet, no `pause` event follows, and a flag set here would still be
    // standing when the viewer makes their first real pause.
    if (player.current) {
      programmaticPause.current = true;
      player.current.pause();
    }

    /*
     * The previous manifest deliberately stays in state while the next one
     * loads. Clearing it would swap `<Player>` out for the placeholder, and a
     * `<Player>` that unmounts takes its pool of `<audio>` tags with it — the
     * ones this session unlocked inside a real tap. The replacements would be
     * new elements that a phone has never allowed to make sound.
     */
    fetchManifest(manifestSrc)
      .then((manifest) => !cancelled && setLoaded({ src: manifestSrc, manifest }))
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

    const onPlay = () => {
      clearPauseOverlayTimers();
      setPauseOverlay("hidden");
      // Belt and braces: a pause() on an already-paused player emits nothing,
      // so the flag would outlive the swipe it was set for.
      programmaticPause.current = false;
      setPlaying(true);
    };
    const onPause = () => {
      setPlaying(false);
      const wasProgrammatic = programmaticPause.current;
      programmaticPause.current = false;
      if (gate.current.unlocked && !wasProgrammatic) {
        setAudioUnlocked(true);
        showPauseOverlay();
      }
    };

    instance.addEventListener("play", onPlay);
    instance.addEventListener("pause", onPause);

    return () => {
      instance.removeEventListener("play", onPlay);
      instance.removeEventListener("pause", onPause);
    };
  }, [clearPauseOverlayTimers, gate, loaded, showPauseOverlay]);

  // Runs once per short that loads. Swiping to a new one after the first tap
  // starts it without another tap; the first one finds no gesture yet and waits.
  useEffect(() => {
    const instance = player.current;
    if (!loaded || !instance || started.current) {
      return;
    }
    if (!gate.current.unlocked) {
      // Nothing may play yet, so park on a frame that looks like the short
      // rather than the blank one every scene fades in from.
      instance.seekTo(Math.round(loaded.manifest.fps * 1.2));
      return;
    }
    started.current = true;
    instance.seekTo(0);
    // Forwarded so the Player calls playAllAudios() — the tags it plays are the
    // ones unlocked by the session's first tap, which is why they still sound.
    instance.play(gate.current.gesture ?? undefined);
  }, [loaded, gate]);

  const toggle = useCallback((event: React.MouseEvent) => {
    const instance = player.current;
    if (!instance) {
      return;
    }
    // Capture phase runs before the scrubber's own handlers, so its
    // stopPropagation cannot keep a drag from also toggling playback. Ask
    // where the click came from instead.
    if ((event.target as HTMLElement).closest(".scrubber, .speed-control")) {
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
      // Inside the click, which is the only place the first unlock of the
      // session can happen. Everything after this may start on its own.
      gate.current.unlocked = true;
      setAudioUnlocked(true);
      instance.seekTo(0);
      instance.play(event);
      return;
    }
    gate.current.unlocked = true;
    instance.toggle(event);
  }, [gate]);

  // Stable identity: a fresh object here is read as a prop change and costs an
  // audio re-schedule on every render.
  const inputProps = useMemo(
    () => (loaded ? { manifestSrc: loaded.src, manifest: loaded.manifest } : null),
    [loaded],
  );

  const durationInFrames = useMemo(
    () =>
      loaded
        ? loaded.manifest.scenes.reduce(
            (sum, scene) => sum + scene.durationInFrames,
            0,
          )
        : 0,
    [loaded],
  );

  if (error) {
    return <div className="player-placeholder">読み込めませんでした: {error}</div>;
  }

  // Only before the very first manifest arrives. After that the outgoing short
  // holds the frame, because unmounting the Player would cost the audio unlock.
  if (!loaded || !inputProps) {
    return <div className="player-placeholder">読み込み中…</div>;
  }

  const manifest = loaded.manifest;

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
        playbackRate={playbackRate}
        loop
        controls={false}
        clickToPlay={false}
        style={PLAYER_STYLE}
      />

      {playing ? null : (
        <div
          className={`short__overlay${
            audioUnlocked ? ` short__overlay--${pauseOverlay}` : ""
          }`}
        >
          <div className="short__play" aria-hidden>
            ▶
          </div>
          {audioUnlocked ? null : <p className="short__hint">タップして再生</p>}
        </div>
      )}

      <Scrubber
        player={player}
        durationInFrames={durationInFrames}
        fps={manifest.fps}
      />

      <SpeedControl playbackRate={playbackRate} onChange={setPlaybackRate} />
    </div>
  );
};
