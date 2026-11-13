/** Sorteia a próxima faixa, sem repetir a que acabou de tocar (se houver outra). */
export function pickTrack(count: number, previous: number | null, random: () => number = Math.random): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  const next = Math.floor(random() * (count - 1));
  return previous === null || previous < 0 ? Math.floor(random() * count) : next >= previous ? next + 1 : next;
}
