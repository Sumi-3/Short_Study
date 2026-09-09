export type OutlineQuestion = { number: string | null; text: string };

/**
 * 新しい outline は問いを明示的に識別する。位置だけでは最後以外の問いをすべて失うためである。
 * 旧 manifest はまだ最終行規約を使うので、ここに残せば内容を再生成せず再生できる。
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
      // 折り返された問いには独自の条件や表示数式を含み得る。共通条件へ昇格させず、その問いに
      // 付けたままにする。
      questions.at(-1)!.text += `\n${line}`;
    }
  }
  return { conditions: lines.slice(0, firstQuestion), questions };
};
