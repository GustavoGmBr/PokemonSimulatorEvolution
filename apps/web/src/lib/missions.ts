import type { GameState, GameUpdate } from './game-state';

export const missionDuration = 2 * 60 * 60 * 1000;
export const missionPeriod = (now: number) => Math.floor(now / missionDuration);
const kinds = ['capture', 'wild', 'trainer', 'cup'] as const;
type Kind = (typeof kinds)[number];
export type MissionState = { period: number; captures: number[]; wild: number; trainer: number; cup: number; claimed: number[] };
export const emptyMissions = (period: number): MissionState => ({ period, captures: [], wild: 0, trainer: 0, cup: 0, claimed: [] });

export function missionsAt(game: GameState, now: number) {
  const period = missionPeriod(now);
  return game.progress.missions?.period === period ? game.progress.missions : emptyMissions(period);
}

export function recordMission(game: GameState, kind: Kind, species?: number): GameState {
  const current = missionsAt(game, Date.now());
  const missions = kind === 'capture'
    ? { ...current, captures: species === undefined ? current.captures : [...new Set([...current.captures, species])] }
    : { ...current, [kind]: current[kind] + 1 };
  return { ...game, progress: { ...game.progress, missions } };
}

export function missionList(period: number) {
  return [
    ...Array.from({ length: 3 }, (_, i) => ({ kind: 'capture' as const, target: i + 1 + period % 3, label: 'Capture espécies diferentes', item: 'great-ball' })),
    ...Array.from({ length: 3 }, (_, i) => ({ kind: 'wild' as const, target: 2 + i * 2, label: 'Derrote Pokémon selvagens', item: 'exp-candy-p' })),
    ...Array.from({ length: 2 }, (_, i) => ({ kind: 'trainer' as const, target: i + 1, label: 'Vença treinadores aleatórios', item: 'great-ball' })),
    ...Array.from({ length: 2 }, (_, i) => ({ kind: 'cup' as const, target: i + 1, label: 'Vença torneios', item: 'exp-candy-m' })),
  ].map((mission, index) => ({ ...mission, index, chips: 50 + index * 25, money: 100 + index * 50 }));
}

export function missionCount(state: MissionState, kind: Kind) {
  return kind === 'capture' ? state.captures.length : state[kind];
}

export function claimMission(index: number, period: number, now = Date.now()): GameUpdate {
  return (game) => {
    const missions = missionsAt(game, now);
    if (missions.period !== period) return 'As missões foram renovadas.';
    if (missions.claimed.includes(index)) return 'Prêmio já resgatado.';
    const all = missionList(period);
    const goal = all[index];
    if (index === 10 ? !all.every((item) => missions.claimed.includes(item.index)) : !goal || missionCount(missions, goal.kind) < goal.target) {
      return 'Missão ainda incompleta.';
    }
    const reward = goal ?? { money: 2500, chips: 2500, item: 'rare-candy' };
    const bag = { ...game.progress.bag };
    bag[reward.item] = Math.min(999, (bag[reward.item] ?? 0) + 1);
    if (goal) {
      const essence = ['iv-hp', 'iv-attack', 'iv-defense', 'iv-special-attack', 'iv-special-defense', 'iv-speed'][goal.index % 6]!;
      bag[essence] = Math.min(999, (bag[essence] ?? 0) + 1);
    }
    return { ...game, progress: { ...game.progress, bag, money: game.progress.money + reward.money,
      casinoChips: game.progress.casinoChips + reward.chips, missions: { ...missions, claimed: [...missions.claimed, index] } } };
  };
}
