// Golpes que cada espécie aprende por TM (máquina). O catálogo é grande, então só é baixado quando alguém abre a área de golpes.
type Raw = { names: string[]; tm: Record<string, number[]> };

let cache: Promise<Raw> | undefined;

function load(): Promise<Raw> {
  cache ??= import('../catalog/battle-tms.json').then((module) => module.default as Raw);
  return cache;
}

/** Nomes dos golpes de TM da espécie (ordem alfabética do catálogo). */
export async function loadTmMoves(speciesId: number): Promise<string[]> {
  const { names, tm } = await load();
  return (tm[String(speciesId)] ?? []).map((index) => names[index]!);
}
