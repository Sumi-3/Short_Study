/**
 * phone で player が音を出せるようになる前に必要な状態。
 *
 * Player は無音の `<audio>` tag pool を持ち、`play()` に event を渡すとすべてを
 * unlock する。*過去*の gesture の event でも後続 short の再生には足りるが、
 * セッション最初の unlock は実際の gesture、すなわち click handler から直に呼ぶ
 * `play()` の中で起こさなければならない。それまでは、無音で開始する代わりに
 * short をタップ待ちにする。
 */
export type AudioGate = {
  /** 自動開始する short に渡す、最後の実際の user gesture。 */
  gesture: React.SyntheticEvent | null;
  /** このセッションで click handler 内の play() が一度走ったらセットする。 */
  unlocked: boolean;
};

export const newAudioGate = (): AudioGate => ({ gesture: null, unlocked: false });
