/**
 * What the player needs before it may make sound on a phone.
 *
 * The Player keeps a pool of silent `<audio>` tags and unlocks them all when
 * `play()` is handed an event. Handing it one from a *past* gesture is enough
 * to keep later shorts playing, but the first unlock of a session has to
 * happen inside a real gesture — a `play()` called straight out of the click
 * handler. Until that has happened once, a short waits to be tapped rather
 * than starting silently.
 */
export type AudioGate = {
  /** The last real user gesture, forwarded to shorts that start on their own. */
  gesture: React.SyntheticEvent | null;
  /** Set once a play() has run inside a click handler this session. */
  unlocked: boolean;
};

export const newAudioGate = (): AudioGate => ({ gesture: null, unlocked: false });
