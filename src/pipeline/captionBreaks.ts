import type { Caption } from "@remotion/captions";

/** Where a Japanese sentence actually asks the reader to stop. */
const HARD = /[。！？]/;
const SOFT = /[、，]/;

/** Punctuation is a pause, not something a caption should show. */
const DROPPED = /[\s。、，！？・]/g;

/**
 * Lines the caption tokens back up with the narration they came from.
 *
 * The synthesiser's word boundaries drop everything that is not a word: `です`
 * is followed straight by the first word of the next sentence, and `3√19/4`
 * comes back as `3` `√` `19` `4` with the slash gone. The narration still has
 * all of it, and the tokens are its words in order, so walking the two together
 * recovers both — the sentence ends become page breaks, and any symbol that
 * fell out is put back on the token it followed.
 */
export const markPhraseBreaks = (
  narration: string,
  captions: Caption[],
): Caption[] => {
  let cursor = 0;

  return captions.map((caption, index) => {
    const at = narration.indexOf(caption.text, cursor);
    if (at < 0) {
      // Out of step with the text — leave the paging to the character budget.
      return caption;
    }
    cursor = at + caption.text.length;

    const next = captions[index + 1];
    if (!next) {
      return caption;
    }

    const nextAt = narration.indexOf(next.text, cursor);
    const between = nextAt < 0 ? "" : narration.slice(cursor, nextAt);

    // Whatever is left after the punctuation is a symbol the tokeniser ate.
    const carried = between.replace(DROPPED, "");
    const breaks = HARD.test(between) || SOFT.test(between);

    if (!carried && !breaks) {
      return caption;
    }
    return {
      ...caption,
      text: caption.text + carried,
      ...(breaks ? { pageBreakAfter: true } : {}),
    };
  });
};
