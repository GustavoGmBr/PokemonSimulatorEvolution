// Animação das Poké Bolas ao capturar: a folha de sprites tem 28 bolas (colunas) × 32 quadros de 64px (linhas).
// Folha "all pokeball sprites for throw animation", de AnarLaurendil (DeviantArt), enviada pelo usuário.
export const ballSheet = { columns: 28, rows: 32, cell: 64 } as const;

/**
 * Coluna da folha de cada bola do jogo. Quando a folha tem a mesma bola do jogo oficial, vale a dela;
 * nas demais (bolas do jogo antigo sem sprite próprio) vale a de cor parecida com o tema da bola.
 */
export const ballColumns: Record<string, number> = {
  'poke-ball': 0,
  'great-ball': 1,
  'ultra-ball': 2,
  'master-ball': 3,
  'premier-ball': 4,
  'luxury-ball': 6, // Bola de Treino
  'nest-ball': 7, // Bola do Ninho
  'net-ball': 8, // Bola de Rede
  'dive-ball': 9, // Bola Aquática
  'repeat-ball': 10, // Bola Trovão
  'timer-ball': 11, // Bola Psíquica
  'fast-ball': 13, // Bola Rápida
  'dusk-ball': 14, // Bola do Crepúsculo
  'dream-ball': 15, // Bola de Sonho
  'sport-ball': 18, // Bola Incandescente
  'level-ball': 19, // Bola Congelante
  'heavy-ball': 21, // Bola Pesada
  'heal-ball': 22, // Bola de Cura
  'friend-ball': 23, // Bola Floresta
  'moon-ball': 24, // Bola Dracônica
  'love-ball': 27, // Bola das Fadas
};

/** Linhas (quadros) da folha, na ordem em que a animação usa. */
export const ballRows = {
  /** a bola girando no ar */
  spin: [0, 1, 2, 3],
  /** a tampa se abre e a luz que engole o Pokémon */
  open: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  /** fechada, parada */
  closed: 15,
  /** o selvagem escapou: brilho, a bola se abre e se parte */
  release: [20, 21, 22, 23, 24, 25],
  /** capturado: faíscas e anel em volta da bola escura */
  caught: [27, 28, 29, 30, 31],
} as const;

export const ballColumn = (ball: string) => ballColumns[ball] ?? 0;

export const ballSheetUrl = `${import.meta.env.BASE_URL}recursos/Pokebolas/sprites.png`;

let preloaded = false;
/** Baixa a folha antes da primeira captura, para a bola não aparecer vazia. */
export function preloadBallSheet() {
  if (preloaded || typeof Image === 'undefined') return;
  preloaded = true;
  new Image().src = ballSheetUrl;
}

/** Posição de fundo (em %) de um quadro da folha. */
export function ballFramePosition(column: number, row: number) {
  return `${(column / (ballSheet.columns - 1)) * 100}% ${(row / (ballSheet.rows - 1)) * 100}%`;
}
