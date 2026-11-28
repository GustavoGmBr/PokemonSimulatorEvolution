// Auto-batalha: escolhe o golpe do turno entre os ataques do Pokémon do jogador.
// A pontuação (vantagem de tipo, ataque do usuário, precisão, golpes em sequência e KO garantido) vem do motor; aqui só se decide.

export interface AutoMoveOption {
  slot: number;
  /** Dano esperado já ponderado por efetividade, STAB, precisão e acertos; golpes que derrubam o alvo ganham um bônus enorme. */
  score: number;
  /** Golpe que causa dano (status não entram na escolha). */
  attack: boolean;
}

/**
 * Entre os ataques, o de maior pontuação; em empate, o primeiro da lista. Se todos os ataques não surtem efeito
 * (alvo imune), ainda usa o primeiro ataque; sem nenhum ataque, o primeiro golpe. `-1` é o Struggle (sem golpes).
 */
export function pickAutoSlot(options: readonly AutoMoveOption[]): number {
  const attacks = options.filter((option) => option.attack);
  const effective = attacks.filter((option) => option.score > 0);
  const pool = effective.length > 0 ? effective : attacks.length > 0 ? attacks : options;
  let best: AutoMoveOption | undefined;
  for (const option of pool) if (!best || option.score > best.score) best = option;
  return best?.slot ?? -1;
}

/** Quem entra quando o Pokémon em campo cai: o de melhor confronto (ver `battleAi.matchup`); empate fica com o primeiro. */
export function pickAutoReplacement(candidates: readonly { index: number; matchup: number }[]): number {
  let best: { index: number; matchup: number } | undefined;
  for (const candidate of candidates) if (!best || candidate.matchup > best.matchup) best = candidate;
  return best?.index ?? -1;
}
