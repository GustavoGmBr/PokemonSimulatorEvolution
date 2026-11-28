// Hordas: várias criaturas da mesma espécie num só encontro. Regras puras (sem dependências) para valer no mapa e nos testes.

export type Random = () => number;

/** Amuleto de Horda: sem ele, nenhuma horda aparece no mapa. */
export const hordeCharm = 'horde-charm';
export const hordeCharmPrice = 35000;
export const hordeBaseChance = 0.1;
export const hordeChancePerGeneration = 0.05;
export const hordeMaxChance = 0.55;
export const hordeMinSize = 2;
export const hordeBaseMaxSize = 3;
export const hordeMaxSize = 5;

export type HordeOdds = { chance: number; minSize: number; maxSize: number };

/**
 * Com o amuleto: 10% dos selvagens aparecem em horda de 2 ou 3 Pokémon. Cada geração concluída soma 5% à chance
 * (até 55%), a cada 3 gerações cabe mais um Pokémon na horda (até 5) e, com 5 gerações, o mínimo sobe para 3.
 */
export function hordeOdds(completed: number, hasCharm: boolean): HordeOdds | null {
  if (!hasCharm) return null;
  const generations = Math.max(0, Math.floor(completed));
  return {
    chance: Math.min(hordeMaxChance, hordeBaseChance + hordeChancePerGeneration * generations),
    minSize: hordeMinSize + (generations >= 5 ? 1 : 0),
    maxSize: Math.min(hordeMaxSize, hordeBaseMaxSize + Math.floor(generations / 3)),
  };
}

/** Tamanho (minSize a maxSize) de uma horda. */
export function hordeSize(odds: HordeOdds, random: Random) {
  return odds.minSize + Math.floor(random() * (odds.maxSize - odds.minSize + 1));
}
