import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { StudyShort } from "../../src/remotion/Composition";
import { fetchManifest } from "./api";
import type { AudioGate } from "./audioGate";
import type { Manifest } from "../../src/types";

const PLAYER_STYLE = { width: "100%", height: "100%" } as const;
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5] as const;
const PAUSE_OVERLAY_HOLD_MS = 800;
const PAUSE_OVERLAY_FADE_MS = 320;
// タイマーが動作途中で消さないよう、フェード時間は CSS と共有する。
const PAUSE_OVERLAY_STYLE = {
  "--pause-overlay-fade": `${PAUSE_OVERLAY_FADE_MS}ms`,
} as React.CSSProperties;
const rateLabel = (rate: number) => `${Number.isInteger(rate) ? rate.toFixed(1) : rate}×`;

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/**
 * シークバー。player の親を毎秒30回再レンダーさせないため、フレームカウンターも
 * ここで持つ。これは大きな差だった。再レンダーのたびに `inputProps` が作り直され、
 * Remotion が新しい入力として扱って音声チャンクのキューを再スケジュールした結果、
 * 同じ24msのチャンクが同じ時刻に二度届き、単語の最初の音節が重複して聞こえた
 * （"一発" → "い一発"）。
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
      // フレームイベントの間も塗りが指に追従するよう、先に表示を更新する。
      setFrame(next);
      player.current?.seekTo(next);
    },
    [durationInFrames, player],
  );

  const percent = durationInFrames > 0 ? (frame / durationInFrames) * 100 : 0;

  return (
    <div
      className={`scrubber${scrubbing ? " is-scrubbing" : ""}`}
      // player 全面が再生・停止の対象なので、バーのドラッグまで切り替えないよう
      // すべてのハンドラで伝播を止める。
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
        // 取得していない capture を解放すると例外になる。
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
      className={`speed-control${playbackRate !== 1 ? " is-adjusted" : ""}`}
      // 親は全面の再生・停止対象に capture phase を使う。後でコントロールの
      // markup が変わっても速度変更が再生・停止タップにならないよう、closest() の
      // 判定に加えてここも残す。
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="speed-control__value" aria-hidden>{rateLabel(playbackRate)}</span>
      {/* タッチとキーボードで操作できるよう native picker を残す。透明な hit area は
          テキストより広いが、教材の上には描画されない。 */}
      <select
        className="speed-control__select"
        value={playbackRate}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="再生速度"
      >
        {PLAYBACK_RATES.map((rate) => (
          <option key={rate} value={rate}>
            {rateLabel(rate)}
          </option>
        ))}
      </select>
    </label>
  );
};

/**
 * MP4 を介さず、生成済みの short をブラウザで再生する。`<Player>` が renderer と
 * 同じ React composition を動かすため、pipeline が manifest を書いた瞬間に視聴できる。
 *
 * 再生開始は自動ではなくタップに限る。iOS Safari と Android Chrome はどちらも
 * user gesture なしの音声開始を拒むため、`autoPlay` の short は最初のフレームで
 * 無音のまま止まる。
 */
export const ShortPlayer: React.FC<{
  manifestSrc: string;
  /**
   * セッション全体の音声状態。最初の short はタップを待つ。Player の audio tag を
   * unlock できるのはその click の中で実行した play() だけで、以降の short は自動で
   * 開始し、画面に現れたときの swipe を渡される。
   *
   * 意図して prop value ではなく ref にする。state にするとセットした当のタップ中に
   * この component が再レンダーされ、同じ gesture に対して auto-start effect と
   * click handler の両方が発火した。
   */
  gate: React.RefObject<AudioGate>;
}> = ({ manifestSrc, gate }) => {
  const player = useRef<PlayerRef>(null);
  /**
   * manifest とその取得元アドレスを一緒に持つ。
   *
   * composition には組で渡すので、state も二つではなく一つにする。新しい
   * `manifestSrc` と前の `manifest` が並ぶ render は、画面に何があるかを偽る。
   */
  const [loaded, setLoaded] = useState<{ src: string; manifest: Manifest } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  // 音声経路の `gate` は意図して ref にしている。この小さな mirror は、その ref が
  // 変わった後に最初のタップを促す表示を出すためだけにある。
  const [audioUnlocked, setAudioUnlocked] = useState(() => gate.current.unlocked);
  const [pauseOverlay, setPauseOverlay] = useState<"hidden" | "shown" | "fading" | "settled">(
    "hidden",
  );
  /** click handler が古い値を読んで再開しないよう ref にする。 */
  const started = useRef(false);
  const pauseOverlayTimers = useRef<number[]>([]);
  /** アプリ自身が停止する間にセットし、`onPause` が二者を区別できるようにする。 */
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
        // 解説が完全に見えた後も、隅に小さな案内を残す。
        setPauseOverlay("settled");
        pauseOverlayTimers.current = [];
      }, PAUSE_OVERLAY_HOLD_MS + PAUSE_OVERLAY_FADE_MS),
    ];
  }, [clearPauseOverlayTimers]);

  useEffect(() => clearPauseOverlayTimers, [clearPauseOverlayTimers]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    started.current = false;
    // 隅の案内はこの short で視聴者が停止したものに属する。タイマーも消さないと、
    // 切り替わる short の上に前の停止表示が再び現れる。
    clearPauseOverlayTimers();
    setPauseOverlay("hidden");
    // 視聴者はすでに swipe で離れ、次の manifest はまだ fetch 中なので、前の short は
    // ただちに無音にする。
    //
    // これは視聴者でなくアプリによる停止。flag がないとタップと同じ handler に届き、
    // swipe のたびに開始までの新しい short に scrim と再生マークが乗った。誰も停止を
    // 求めていないこの場面では overlay に伝えることがない。停止対象があるときだけ
    // セットする。初回 mount には player も `pause` event もなく、ここで立てた flag は
    // 視聴者が最初に実際に停止するまで残るからである。
    if (player.current) {
      programmaticPause.current = true;
      player.current.pause();
    }

    /*
     * 次の manifest を読み込む間も、前の manifest は意図して state に残す。消すと
     * `<Player>` が placeholder に置き替わり、unmount された `<Player>` はこの
     * セッションで実際のタップ中に unlock した `<audio>` tag の pool ごと失う。
     * 置き換わる element は、phone がまだ発音を許可していない新しいものになる。
     */
    fetchManifest(manifestSrc)
      .then((manifest) => !cancelled && setLoaded({ src: manifestSrc, manifest }))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));

    return () => {
      cancelled = true;
    };
  }, [manifestSrc, clearPauseOverlayTimers]);

  useEffect(() => {
    const instance = player.current;
    if (!instance) {
      return;
    }

    const onPlay = () => {
      clearPauseOverlayTimers();
      setPauseOverlay("hidden");
      // 念のため。すでに停止中の player への pause() は何も emit せず、flag が
      // それをセットした swipe より長く残るため。
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

  // short の読み込みごとに一度実行する。最初のタップ以降は新しい short へ swipe する
  // だけで始まり、最初の short はまだ gesture がないので待機する。
  useEffect(() => {
    const instance = player.current;
    if (!loaded || !instance || started.current) {
      return;
    }
    if (!gate.current.unlocked) {
      // まだ何も再生できないので、各 scene が fade-in を始める空白フレームではなく、
      // short らしく見えるフレームに置く。
      instance.seekTo(Math.round(loaded.manifest.fps * 1.2));
      return;
    }
    started.current = true;
    instance.seekTo(0);
    // Player が playAllAudios() を呼べるよう event を渡す。再生する tag は
    // セッション最初のタップで unlock 済みなので、引き続き音が出る。
    instance.play(gate.current.gesture ?? undefined);
  }, [loaded, gate]);

  const toggle = useCallback((event: React.MouseEvent) => {
    const instance = player.current;
    if (!instance) {
      return;
    }
    // capture phase は scrubber 自身の handler より先に走るので、そこでの
    // stopPropagation ではドラッグによる再生切替を防げない。click の出所を判定する。
    if ((event.target as HTMLElement).closest(".scrubber, .speed-control")) {
      return;
    }
    // event を捨てずに渡す。Player は実際の user gesture の間に無音の audio tag pool を
    // warm し、mobile で発音を許されるのはそのように warm された tag だけである。
    // これなしに play() を呼ぶと、phone では動画だけ動き narration は無音になる。
    if (!started.current) {
      // thumbnail が各 scene の fade-in 元となる空白フレームにならないよう、poster は
      // hook の少し先に置く。最初の実再生時に先頭へ戻す。
      started.current = true;
      // セッション最初の unlock は click 内でしかできない。これ以降は自動開始してよい。
      gate.current.unlocked = true;
      setAudioUnlocked(true);
      instance.seekTo(0);
      instance.play(event);
      return;
    }
    gate.current.unlocked = true;
    instance.toggle(event);
  }, [gate]);

  // identity を安定させる。ここで新しい object を渡すと prop 変更と見なされ、
  // render ごとに audio が再スケジュールされる。
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

  // placeholder は最初の manifest が届く前だけにする。その後は前の short がフレームを
  // 保持する。Player の unmount が audio の unlock を失わせるためである。
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
            audioUnlocked ? ` short__overlay--paused short__overlay--${pauseOverlay}` : ""
          }`}
          style={PAUSE_OVERLAY_STYLE}
        >
          {audioUnlocked ? (
            <>
              <div className="short__pause-feedback" aria-hidden>
                <span className="short__pause-symbol" />
                <span className="short__pause-title">一時停止</span>
                <span className="short__pause-hint">タップでつづきを再生</span>
              </div>
              {pauseOverlay !== "hidden" ? (
                <div className="short__pause-status" role="status">
                  <span className="short__pause-symbol" aria-hidden />
                  一時停止
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="short__play" aria-hidden>▶</div>
              <p className="short__hint">タップして再生</p>
            </>
          )}
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
