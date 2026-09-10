import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Player, type PlayerRef } from "@remotion/player";
import { firstSceneFrame } from "./FirstFrame";
import { PlaybackComposition } from "./PlaybackComposition";
import { fetchManifest } from "./api";
import { AudioGate, type AudioStatus } from "./audioGate";
import type { Manifest } from "../../src/types";

const MEDIA_CONTROLS = { mode: "prevent-media-session" } as const;
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

export type ShortPlayerHandle = { play: (event?: React.SyntheticEvent) => void };

/**
 * MP4 を介さず React composition を直接再生する。音つきで始めるための解除は
 * [audioGate.ts](./audioGate.ts) が持つ。
 */
export const ShortPlayer: React.FC<{
  manifestSrc: string;
  playbackRef?: React.Ref<ShortPlayerHandle>;
}> = ({ manifestSrc, playbackRef }) => {
  const player = useRef<PlayerRef>(null);
  const container = useRef<HTMLDivElement>(null);
  const wantsPlay = useRef(false);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("locked");
  // Feed 内の swipe では要素ごと生存し、Feed を閉じたら権限も破棄する。
  const [gate] = useState(() => new AudioGate(player, container, (status) => {
    if (status === "blocked") wantsPlay.current = false;
    setAudioStatus(status);
  }));
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
    programmaticPause.current = true;
    gate.pause();

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
  }, [manifestSrc, clearPauseOverlayTimers, gate]);

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
      if (gate.unlocked && !wasProgrammatic) {
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

  useEffect(() => {
    const instance = player.current;
    if (!instance) return;
    const onMute = (event: { detail: { isMuted: boolean } }) => {
      // Remotion は context の再開失敗時に自動ミュートする。無音での続行を許さない。
      if (event.detail.isMuted) gate.block();
    };
    const onVisibility = () => {
      if (document.hidden) {
        programmaticPause.current = true;
        wantsPlay.current = false;
        gate.pause();
        setPauseOverlay("settled");
      }
    };
    instance.addEventListener("mutechange", onMute);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      instance.removeEventListener("mutechange", onMute);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loaded, gate]);

  useLayoutEffect(() => {
    gate.bindPool();
  }, [gate, loaded]);

  useEffect(() => () => gate.dispose(), [gate]);

  useEffect(() => {
    const instance = player.current;
    if (!loaded || loaded.src !== manifestSrc || !instance || started.current) return;
    // 視聴者がまだ再生を求めていない、または解除できていない short は、表紙の
    // 1 コマで止めておく。gesture の外で音つき再生は始められない。
    if (!wantsPlay.current || !gate.unlocked) {
      instance.seekTo(firstSceneFrame(loaded.manifest.fps));
      return;
    }
    started.current = true;
    instance.seekTo(0);
    // seek 後の音声位置が commit されてから鳴らす。
    const timer = window.setTimeout(() => gate.resume(), 0);
    return () => window.clearTimeout(timer);
  }, [loaded, manifestSrc, gate]);

  const playFromGesture = useCallback((event?: React.SyntheticEvent) => {
    const instance = player.current;
    if (!instance) return;
    wantsPlay.current = true;
    const ready = loaded?.src === manifestSrc;
    // 表紙で止めていた分を巻き戻してから鳴らす。unlock() の play() より先に行う。
    if (ready && !started.current) {
      started.current = true;
      flushSync(() => instance.seekTo(0));
    }
    gate.unlock(event);
    if (!ready) {
      // manifest はまだ取得中。pool の解除だけこの gesture で済ませ、中身のない
      // composition は進めない。到着後に自動で再生へ入る。
      programmaticPause.current = true;
      instance.pause();
    }
  }, [gate, loaded, manifestSrc]);

  useImperativeHandle(playbackRef, () => ({ play: playFromGesture }), [playFromGesture]);

  const toggle = useCallback((event: React.MouseEvent | React.KeyboardEvent) => {
    const instance = player.current;
    if (!instance) return;
    if ((event.target as HTMLElement).closest(".scrubber, .speed-control")) return;
    if (instance.isPlaying()) {
      wantsPlay.current = false;
      gate.pause();
      return;
    }
    playFromGesture(event);
  }, [gate, playFromGesture]);

  // identity を安定させる。ここで新しい object を渡すと prop 変更と見なされ、
  // render ごとに audio が再スケジュールされる。
  const inputProps = useMemo(
    () => ({ manifestSrc: loaded?.src ?? "", manifest: loaded?.manifest ?? null }),
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

  // manifest 到着で Player を作り直さず、サムネイルのタップ中に解除した pool を使い続ける。
  const manifest = loaded?.manifest;
  const audioUnlocked = audioStatus === "ready" && !error && loaded?.src === manifestSrc;
  /*
   * 再生は許可済みで、次の manifest の到着だけを待っている状態。
   *
   * swipe のたびにここを通る。この間も後ろの FirstFrame が次の short の1シーン目を
   * 出しており、manifest が届けば自動で再生に入るので、視聴者に求めることは何もない。
   * それでも overlay を出していたため、スクロールの途中で一瞬グレーアウトして
   * 「読み込み中」に見えていた。何も描かないのが正しい。
   */
  const swapping = audioStatus === "ready" && !error && loaded?.src !== manifestSrc;

  return (
    <div
      className="short"
      ref={container}
      tabIndex={0}
      aria-label="動画の再生・一時停止"
      onClickCapture={toggle}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || event.repeat) return;
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          toggle(event);
        }
      }}
    >
      <Player
        ref={player}
        component={PlaybackComposition}
        inputProps={inputProps}
        durationInFrames={Math.max(1, durationInFrames)}
        compositionWidth={manifest?.width ?? 1080}
        compositionHeight={manifest?.height ?? 1920}
        fps={manifest?.fps ?? 30}
        initialFrame={0}
        playbackRate={playbackRate}
        loop
        controls={false}
        clickToPlay={false}
        spaceKeyToPlayOrPause={false}
        browserMediaControlsBehavior={MEDIA_CONTROLS}
        initialVolume={1}
        /*
         * AudioContext を停止のたびに suspend させない。
         *
         * 既定では Player は pause で AudioContext を suspend し、play で resume して、
         * 実際に running へ戻るのを待つ。戻らなければ Remotion は自身を mute して映像
         * だけ進める。phone では gesture の外からの resume が届かないことがあり、swipe
         * のたびにこの mute 経路に落ちていた。gain で無音にする方式なら context は
         * running のまま、resume は即座に返り、mute 経路そのものに入らない。
         *
         * 音そのものは Composition が Html5Audio（`useWebAudioApi={false}`）で native
         * 再生しているので、この context は再生速度を変えた Safari の増幅にしか関わらない。
         */
        _experimentalKeepAudioContextAlive
        style={PLAYER_STYLE}
      />

      {playing || swapping ? null : (
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
              <p className="short__hint" role="status">
                {/* 取得中でも、このタップは pool を解除して到着後の再生を予約する。
                    待てとは言わず、押せる操作をそのまま案内する。 */}
                {error ? `読み込めませんでした: ${error}` :
                  audioStatus === "blocked" ? "音声を有効にするにはタップしてください" :
                  "タップして再生"}
              </p>
            </>
          )}
        </div>
      )}

      {manifest ? (
        <>
          <Scrubber player={player} durationInFrames={durationInFrames} fps={manifest.fps} />
          <SpeedControl playbackRate={playbackRate} onChange={setPlaybackRate} />
        </>
      ) : null}
    </div>
  );
};
