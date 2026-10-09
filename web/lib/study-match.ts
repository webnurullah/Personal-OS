// Quick Add "study 1h sql joins": which topic or library item the words are about (by rules, no AI).

/** Lower-case words of at least two letters or digits ("SQL joins!" → ["sql", "joins"]). */
export const wordsOf = (text: string) => text.toLowerCase().match(/[\p{L}\p{M}\p{N}]{2,}/gu) ?? [];

export type Matchable = { id: string; label: string };

/**
 * The one item that shares the most words with the text, or null when nothing matches or two are equally good.
 * Words that begin the same count too ("join" finds "joins") from 3 letters.
 */
export function matchBest<T extends Matchable>(text: string, items: T[]): T | null {
  const wanted = [...new Set(wordsOf(text))];
  if (!wanted.length) return null;
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;
  for (const item of items) {
    const have = wordsOf(item.label);
    const score = wanted.reduce((sum, w) => sum + (have.some((h) => h === w || (w.length >= 3 && h.length >= 3 && (h.startsWith(w) || w.startsWith(h)))) ? 1 : 0), 0);
    if (score > bestScore) {
      best = item;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  return best && !tie ? best : null;
}
