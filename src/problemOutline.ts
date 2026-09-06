export type OutlineQuestion = { number: string | null; text: string };

/**
 * New outlines identify questions explicitly, because position alone loses
 * every question except the last. Old manifests still use that last-line
 * convention; keeping it here lets them play without regenerating content.
 */
export const parseProblemOutline = (points: string[]) => {
  const lines = points.flatMap((point) => point.split("\n"))
    .map((line) => line.trim()).filter(Boolean);
  const numbered = /^[(（]([0-9０-９]+)[)）]\s*(.+)$/;
  const firstQuestion = lines.findIndex((line) => numbered.test(line));
  if (firstQuestion < 0) {
    return {
      conditions: lines.slice(0, -1),
      questions: lines.length ? [{ number: null, text: lines.at(-1)! }] : [],
    };
  }
  const questions: OutlineQuestion[] = [];
  for (const line of lines.slice(firstQuestion)) {
    const match = line.match(numbered);
    if (match) {
      questions.push({ number: match[1].normalize("NFKC"), text: match[2] });
    } else {
      // A wrapped question may contain its own condition or displayed formula.
      // Keep it with that question instead of promoting it to a shared condition.
      questions.at(-1)!.text += `\n${line}`;
    }
  }
  return { conditions: lines.slice(0, firstQuestion), questions };
};
