// IVs (valores individuais) e estrelas. Cada Pokémon nasce com um IV de 0 a 31 em cada atributo.
// As estrelas resumem a soma dos seis IVs: 3★ e 4★ são raros e ganham destaque (junto com os brilhantes).

export const maxIv = 31;
export const statKeys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type StatKey = (typeof statKeys)[number];
export type Ivs = Record<StatKey, number>;
export type IvStars = 0 | 1 | 2 | 3 | 4;
export type Random = () => number;

export const statLabels: Record<StatKey, string> = {
  hp: 'HP', atk: 'Ataque', def: 'Defesa', spa: 'Ataque especial', spd: 'Defesa especial', spe: 'Velocidade',
};

export const maxTotalIv = maxIv * statKeys.length;
const qualityLabels = ['Comum', 'Acima da média', 'Muito bom', 'Excelente', 'Potencial perfeito'] as const;

/** Soma mínima de IVs para cada nível de estrela (4★ = todos os IVs no máximo). */
export const starThresholds = [91, 121, 151, maxTotalIv] as const;
/** A partir de quantas estrelas o Pokémon ganha destaque. */
export const alertStars = 3;
/** Chance de um selvagem nascer com IVs perfeitos (4★), além da chance natural, que é desprezível. */
export const perfectChance = 1 / 1000;

export function rollIvs(random: Random): Ivs {
  const ivs = {} as Ivs;
  for (const key of statKeys) ivs[key] = Math.floor(random() * (maxIv + 1));
  return ivs;
}

export function perfectIvs(): Ivs {
  return { hp: maxIv, atk: maxIv, def: maxIv, spa: maxIv, spd: maxIv, spe: maxIv };
}

export function ivTotal(ivs: Ivs) {
  return statKeys.reduce((sum, key) => sum + ivs[key], 0);
}

export function ivStars(ivs: Ivs): IvStars {
  const total = ivTotal(ivs);
  return starThresholds.reduce<number>((stars, minimum) => (total >= minimum ? stars + 1 : stars), 0) as IvStars;
}

export function ivQuality(ivs: Ivs) {
  const total = ivTotal(ivs);
  const stars = ivStars(ivs);
  return { total, percentage: Math.round((total / maxTotalIv) * 100), stars, label: qualityLabels[stars] };
}

export const starText = (stars: number) => (stars > 0 ? '★'.repeat(stars) : '0★');

/** Gerador determinístico a partir de um texto: dá IVs estáveis a quem foi salvo antes de existirem IVs. */
export function seededRandom(seed: string): Random {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lê IVs salvos; se faltarem (save antigo) ou estiverem inválidos, gera uns estáveis a partir da semente. */
export function readIvs(value: unknown, seed: string): Ivs {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const values = statKeys.map((key) => record[key]);
    if (values.every((entry) => typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry <= maxIv)) {
      return Object.fromEntries(statKeys.map((key, index) => [key, values[index]])) as Ivs;
    }
  }
  return rollIvs(seededRandom(seed));
}

/** Os casos especiais de um selvagem, do mais ao menos chamativo: brilhante (dourado), 4★ (vermelho), 3★ (azul). */
export type Grade = 'shiny' | 'perfect' | 'great';

export function gradeOf(subject: { shiny: boolean; ivs: Ivs }): Grade | null {
  if (subject.shiny) return 'shiny';
  const stars = ivStars(subject.ivs);
  return stars >= 4 ? 'perfect' : stars >= alertStars ? 'great' : null;
}

export function isSpecial(subject: { shiny: boolean; ivs: Ivs }) {
  return gradeOf(subject) !== null;
}

/** Mensagem de aviso quando um Pokémon especial aparece no mapa. */
export function specialMessage(name: string, subject: { shiny: boolean; ivs: Ivs }): string | null {
  const stars = ivStars(subject.ivs);
  const starred = stars >= alertStars;
  if (subject.shiny && starred) return `✦ ${name} brilhante e ${starText(stars)} apareceu no mapa!`;
  if (subject.shiny) return `✦ ${name} brilhante apareceu no mapa!`;
  if (stars >= 4) return `${starText(4)} ${name} com IVs perfeitos apareceu no mapa!`;
  if (starred) return `${starText(stars)} ${name} com IVs excelentes apareceu no mapa!`;
  return null;
}

/** Selo curto para mostrar ao lado do nome: "✦", "★★★", "✦ ★★★★"… (nada para os comuns). */
export function gradeBadge(subject: { shiny: boolean; ivs: Ivs }): string {
  const stars = ivStars(subject.ivs);
  return [subject.shiny ? '✦' : '', stars >= alertStars ? starText(stars) : ''].filter(Boolean).join(' ');
}

export const gradeNames: Record<Grade, string> = { shiny: 'Brilhante', perfect: 'IVs perfeitos', great: 'IVs excelentes' };

/** Frase curta para o destaque na ficha do Pokémon ("✦ Brilhante · ★★★★ IVs perfeitos"). */
export function specialSummary(subject: { shiny: boolean; ivs: Ivs }): string | null {
  const stars = ivStars(subject.ivs);
  const starred = stars >= alertStars ? `${starText(stars)} ${stars >= 4 ? 'IVs perfeitos' : 'IVs excelentes'}` : null;
  if (subject.shiny) return starred ? `✦ Brilhante · ${starred}` : '✦ Pokémon brilhante';
  return starred;
}
