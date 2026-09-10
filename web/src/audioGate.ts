import type { PlayerRef } from "@remotion/player";

export type AudioStatus = "locked" | "ready" | "blocked";

const nameOf = (error: unknown) =>
  typeof error === "object" && error !== null && "name" in error
    ? String((error as { name?: unknown }).name)
    : "";

/**
 * phone で音が出る状態を保つ。
 *
 * Player は無音の `<audio>` tag pool を持ち、`play()` に event を渡すと `playAllAudios()`
 * が pool 全体を鳴らして解除する。解除は実際の gesture の中で一度起きればよく、それ以降
 * は同じ Player instance が生きているかぎり、swipe や manifest の到着でも音つきで
 * 再生できる。だから gesture を保存して使い回す必要はない。必要なのは、最初のタップの
 * *中*で一度 `play(event)` を呼ぶことだけである。
 *
 * 再生を始める前に発音を検証はしない。検証は、seek・source の差し替え・buffering に
 * よる正常な中断と、権限の拒否とを取り違える。swipe のたびに `<audio>` の src が入れ
 * 替わり、その中断が失敗と判定されて「タップして再試行」が出ていた。代わりに本当の
 * 失敗、すなわち pool の `NotAllowedError` と、AudioContext を再開できなかった Remotion
 * 自身の自動 mute だけを捕まえ、そのときだけ停止して視聴者に委ねる。無音のまま進む
 * 経路は残さない。
 */
export class AudioGate {
  private audios = new Map<HTMLAudioElement, () => void>();
  /** 実際の gesture の中で、この Player の pool を一度解除できたか。 */
  unlocked = false;

  constructor(
    private player: React.RefObject<PlayerRef | null>,
    private container: React.RefObject<HTMLDivElement | null>,
    private notify: (status: AudioStatus) => void,
  ) {}

  /** 無音で再生を続けないための唯一の停止点。 */
  block = () => {
    this.unlocked = false;
    this.player.current?.pause();
    this.notify("blocked");
  };

  bindPool = () => {
    // pool は Player の表示 DOM の兄弟。アプリ全体や他の Player の音声には触れない。
    const pool = this.container.current?.querySelectorAll("audio");
    pool?.forEach((audio) => {
      if (this.audios.has(audio)) return;
      // 置き換わった tag はまだ鳴らしたことがない。解除をやり直させる。
      this.unlocked = false;
      const originalPlay = audio.play;
      const ownPlay = Object.getOwnPropertyDescriptor(audio, "play");
      // 4.0.518 の Html5Audio は onAutoPlayError を公開せず、拒否を console に出すだけ。
      // pool 内の要素の Promise を見て、後のシーンでの拒否も Player を止められるようにする。
      audio.play = () => {
        let promise: Promise<void>;
        try {
          promise = originalPlay.call(audio);
        } catch (error) {
          promise = Promise.reject(error);
        }
        void promise.catch((error: unknown) => {
          // 権限の拒否だけを失敗とする。AbortError（seek / pause / source 差し替え）や
          // NotSupportedError（読み込み中の src）は swipe のたびに起きる正常な中断で、
          // これを失敗として扱っていたのが「タップして再試行」の原因だった。
          if (nameOf(error) !== "NotAllowedError") return;
          if (audio.muted) return;
          this.block();
        });
        return promise;
      };
      this.audios.set(audio, () => {
        if (ownPlay) Object.defineProperty(audio, "play", ownPlay);
        else delete (audio as Partial<HTMLAudioElement>).play;
      });
    });
  };

  /**
   * click handler から同期で呼ぶ。event を渡すと Player が pool 全体を鳴らして解除する。
   * manifest の取得を待ってからでは gesture が失効するので、待たずに呼ぶこと。
   */
  unlock = (event?: React.SyntheticEvent) => {
    const instance = this.player.current;
    if (!instance) return;
    this.bindPool();
    instance.unmute();
    instance.setVolume(1);
    // onPlay は play() の中から同期で届く。先に立てておかないと未解除と見なされる。
    this.unlocked = true;
    this.notify("ready");
    instance.play(event);
  };

  /** gesture の外から再生する。pool は解除済みなので event は要らない。 */
  resume = () => {
    const instance = this.player.current;
    if (!instance || document.hidden || !this.unlocked) return;
    this.bindPool();
    instance.unmute();
    instance.setVolume(1);
    this.notify("ready");
    instance.play();
  };

  pause = () => {
    this.player.current?.pause();
    if (this.unlocked) this.notify("ready");
  };

  dispose = () => {
    this.player.current?.pause();
    this.audios.forEach((restore) => restore());
    this.audios.clear();
    this.unlocked = false;
  };
}
