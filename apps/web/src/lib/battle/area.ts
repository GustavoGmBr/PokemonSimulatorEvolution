// Golpes em área: atingem todos os adversários (nas hordas) com o dano reduzido de cada alvo.
// Sem dependências para poder ser usado nas telas sem puxar o motor de batalha.

/** Golpes cujo alvo é "todos os adversários" ou "todos os outros Pokémon". */
export const isAreaMove = (move: { target: string }) => move.target === 'all-opponents' || move.target === 'all-other-pokemon';

/** Dano de cada alvo de um golpe em área quando há mais de um alvo. */
export const AREA_DAMAGE = 0.75;

/** Etiqueta mostrada ao lado dos golpes em área. */
export const AREA_LABEL = '(área)';
