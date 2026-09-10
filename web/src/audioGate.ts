import type { PlayerRef } from "@remotion/player";
import type { Internals } from "remotion";

type SharedAudio = NonNullable<React.ContextType<typeof Internals.SharedAudioContext>>;
export type AudioStatus = "locked" | "preparing" | "ready" | "blocked";

/** 権限はイベントやセッションではなく、実際に play() が成功した要素に属する。 */
export class AudioGate {
  private audios = new Map<HTMLAudioElement, () => void>();
  private context: SharedAudio | null = null;
  private attempt = 0;
  private preparing = false;
  unlocked = false;

  constructor(
    private player: React.RefObject<PlayerRef | null>,
    private container: React.RefObject<HTMLDivElement | null>,
    private notify: (status: AudioStatus) => void,
  ) {}

  setContext = (context: SharedAudio | null) => {
    this.context = context;
  };

  block = () => {
    this.unlocked = false;
    this.cancel();
    this.notify("blocked");
  };

  cancel = () => {
    this.attempt++;
    this.preparing = false;
    this.player.current?.pause();
    this.audios.forEach((_, audio) => audio.pause());
    // preflight 中は Player がまだ停止中なので、Player.pause() だけでは resume が取り消されない。
    void this.context?.suspend();
    this.notify(this.unlocked ? "ready" : "locked");
  };

  bindPool = () => {
    // pool は Player の表示 DOM の兄弟。アプリ全体や他の Player の音声には触れない。
    const pool = this.container.current?.querySelectorAll("audio");
    pool?.forEach((audio) => {
      if (this.audios.has(audio)) return;
      this.unlocked = false;
      const originalPlay = audio.play;
      const ownPlay = Object.getOwnPropertyDescriptor(audio, "play");
      // 4.0.518 の Html5Audio は onAutoPlayError を公開せず、拒否をログにするだけ。
      // pool 内の要素だけで Promise を監視し、後のシーンの失敗も Player を停止させる。
      audio.play = () => {
        const attempt = this.attempt;
        const src = audio.src;
        let promise: Promise<void>;
        try {
          promise = originalPlay.call(audio);
        } catch (error) {
          promise = Promise.reject(error);
        }
        void promise.catch((error: unknown) => {
          // seek / buffering による pause は正常な中断であり、権限の拒否とは区別する。
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (attempt === this.attempt && src === audio.src && this.player.current?.isPlaying()) {
            this.block();
          }
        });
        return promise;
      };
      const checkVolume = () => {
        if ((audio.muted || audio.volume === 0) && !audio.paused && this.player.current?.isPlaying()) {
          this.block();
        }
      };
      audio.addEventListener("volumechange", checkVolume);
      audio.addEventListener("error", this.block);
      this.audios.set(audio, () => {
        audio.removeEventListener("volumechange", checkVolume);
        audio.removeEventListener("error", this.block);
        if (ownPlay) Object.defineProperty(audio, "play", ownPlay);
        else delete (audio as Partial<HTMLAudioElement>).play;
      });
    });
  };

  /** 初回は click handler から同期的に呼ぶ。await の後や保存した event では解除できない。 */
  start = () => {
    const instance = this.player.current;
    if (!instance || this.preparing || document.hidden) return;
    this.bindPool();
    if (this.audios.size === 0) {
      this.block();
      return;
    }
    const attempt = ++this.attempt;
    this.preparing = true;
    this.notify("preparing");

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Audio start timed out")), 5000);
    });
    // 同期例外の場合も timeout の Promise に拒否ハンドラを付けておく。
    void timeout.catch(() => {});
    try {
      // 両 API を gesture が生きている間に呼ぶ。Player.play() は void を返し、成功を証明しない。
      const resume = this.context?.resume();
      const resumed = this.context?.getIsResumingAudioContext();
      const played = Array.from(this.audios.keys(), (audio) => {
        const src = audio.src;
        if (audio.error) audio.load();
        audio.muted = false;
        audio.volume = 1;
        return audio.play().then(() => {
          if (attempt !== this.attempt) return;
          if (src !== audio.src) throw new Error("Audio changed during preparation");
          if (audio.muted || audio.volume === 0) throw new Error("Audio is muted");
        });
      });
      void Promise.race([Promise.all([Promise.all(played), resume, resumed]), timeout])
        .then(([, , result]) => {
          if (attempt !== this.attempt) return;
          if (result === "failed" || result === "cancelled" ||
              (this.context?.audioContext && this.context.audioContext.state !== "running")) {
            throw new Error("AudioContext did not resume");
          }
          this.preparing = false;
          this.unlocked = true;
          this.notify("ready");
          // pool 全要素を確認済みなので、古い event を渡して解除したふりをしない。
          instance.play();
        })
        .catch(() => {
          if (attempt === this.attempt) this.block();
        })
        .finally(() => clearTimeout(timer));
    } catch {
      clearTimeout(timer);
      this.block();
    }
  };

  dispose = () => {
    this.cancel();
    this.audios.forEach((restore) => restore());
    this.audios.clear();
    this.context = null;
    this.unlocked = false;
  };
}
