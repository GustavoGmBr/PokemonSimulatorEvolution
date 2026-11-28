import { useEffect, useMemo, useState } from 'react';
import { Gift, Trophy } from 'lucide-react';
import { getPokemon, typeLabels } from '@pokesim-evolution/data/pokedex';
import { Button } from '@/components/ui/button';
import { ItemIcon } from '@/components/item-icon';
import type { ChangeGame, GameState } from '@/lib/game-state';
import { starterGenerations } from '@/lib/journey-saves';
import {
  achievementReward, achievements, achievementValue, boardDone, claimAchievement, claimMission, derivedOf, describeGoal, goalDone,
  missionsAt, rewardGrowth, tierEnd, tierLabels, tierPeriod, tiers, type MissionKind, type Names, type Reward, type Tier,
} from '@/lib/missions';
import { itemName } from '@/lib/training';
import { completedGenerations, wildBadges } from '@/lib/wild';
import { hordeCharm } from '@/lib/horde';
import { formatMoney } from './trainer-card';
import '@/styles/shop.css';
import '@/styles/missions.css';

type Props = { game: GameState; change: ChangeGame };
type Tab = Tier | 'achievements';

const groups: { title: string; kinds: readonly MissionKind[] }[] = [
  { title: 'Captura', kinds: ['catch'] },
  { title: 'Combate', kinds: ['defeat', 'trainer', 'cup', 'boss'] },
  { title: 'Hordas e golpes em área', kinds: ['horde', 'area'] },
  { title: 'Evolução', kinds: ['evolve'] },
];

const names: Names = {
  type: (id) => typeLabels[id] ?? id,
  species: (id) => getPokemon(id)?.displayName ?? `Espécie ${id}`,
  region: (id) => {
    const entry = starterGenerations.find(({ generation }) => generation === id);
    return entry ? `${entry.region} (Geração ${id})` : `Geração ${id}`;
  },
};

function countdown(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60);
  if (days) return `${days} d ${hours} h`;
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

function RewardLine({ reward }: { reward: Reward }) {
  return <ul className="mission-reward" aria-label="Prêmio">
    <li>{formatMoney(reward.money)}</li>
    {reward.chips > 0 && <li>{reward.chips.toLocaleString('pt-BR')} fichas</li>}
    {reward.items.map(([item, quantity]) => <li key={item} className="mission-item">
      <ItemIcon item={item} size={20} />{quantity}× {itemName(item)}
    </li>)}
  </ul>;
}

const summary = (reward: Reward) => `Prêmio resgatado: ${formatMoney(reward.money)}${reward.chips > 0 ? `, ${reward.chips.toLocaleString('pt-BR')} fichas` : ''}${
  reward.items.map(([item, quantity]) => `, ${quantity}× ${itemName(item)}`).join('')}.`;

export function MissionsScreen({ game, change }: Props) {
  const [now, setNow] = useState(Date.now);
  const [tab, setTab] = useState<Tab>('quick');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const offset = new Date(now).getTimezoneOffset();
  const periods = tiers.map((tier) => tierPeriod(tier, now, offset)).join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => missionsAt(game, now), [game, periods]);
  const derived = derivedOf(game);
  const progress = wildBadges(game.progress) + completedGenerations(game.progress);
  const charm = (game.progress.bag[hordeCharm] ?? 0) > 0;
  const claimable = (tier: Tier) => state[tier]!.goals.filter((_, index) => goalDone(state[tier]!, index) && !state[tier]!.claimed.includes(index)).length
    + (boardDone(state[tier]!) && !state[tier]!.claimed.includes(state[tier]!.goals.length) ? 1 : 0);
  const claimableAchievements = achievements.filter((entry) => {
    const level = state.lifetime.claimed[entry.id] ?? 0;
    const goal = entry.levels[level];
    return goal !== undefined && achievementValue(entry, state.lifetime, derived) >= goal;
  }).length;

  function claim(update: ReturnType<typeof claimMission>, reward: Reward) {
    setMessage(change(update) ?? summary(reward));
  }

  return <section className="game-panel missions">
    <div className="shop-tabs" role="tablist" aria-label="Tipos de missão">
      {tiers.map((tier) => <button key={tier} type="button" role="tab" aria-selected={tab === tier} onClick={() => setTab(tier)}>
        {tierLabels[tier]}{claimable(tier) > 0 && <span className="shop-badge">{claimable(tier)}</span>}
      </button>)}
      <button type="button" role="tab" aria-selected={tab === 'achievements'} onClick={() => setTab('achievements')}>
        <Trophy aria-hidden="true" /> Conquistas{claimableAchievements > 0 && <span className="shop-badge">{claimableAchievements}</span>}
      </button>
    </div>

    {tab === 'achievements' ? <>
      <p className="text-sm text-muted-foreground">Metas de longo prazo: não renovam, e cada nível tem um prêmio maior que o anterior.</p>
      <div className="mission-grid">{achievements.map((entry, position) => {
        const value = achievementValue(entry, state.lifetime, derived);
        const level = state.lifetime.claimed[entry.id] ?? 0;
        const goal = entry.levels[level];
        const done = goal === undefined;
        const ready = !done && value >= goal;
        return <article key={entry.id} className="mission-card" data-ready={ready || undefined} data-done={done || undefined}>
          <h2>{entry.label}</h2>
          <p className="mission-level">Nível {Math.min(level, entry.levels.length)} de {entry.levels.length}</p>
          {done ? <p className="text-sm">Todos os níveis resgatados.</p> : <>
            <progress aria-label={entry.label} value={Math.min(value, goal)} max={goal} />
            <p className="text-sm">{Math.min(value, goal).toLocaleString('pt-BR')} / {goal.toLocaleString('pt-BR')}</p>
            <RewardLine reward={achievementReward(position, level)} />
            <Button disabled={!ready} onClick={() => claim(claimAchievement(entry.id), achievementReward(position, level))}>
              {ready ? 'Resgatar prêmio' : 'Em andamento'}
            </Button>
          </>}
        </article>;
      })}</div>
    </> : (() => {
      const board = state[tab]!;
      const end = tierEnd(tab, board.period, offset);
      const claimedCount = board.claimed.filter((index) => index < board.goals.length).length;
      const bonusIndex = board.goals.length;
      return <>
        <p className="text-sm text-muted-foreground">
          Renovação em {countdown(end - now)} · {claimedCount}/{board.goals.length} resgatadas · metas e prêmios crescem com o seu progresso (prêmios ×{rewardGrowth(progress).toFixed(2).replace('.', ',')}).
        </p>
        {!charm && <p className="text-sm text-muted-foreground">Compre o Amuleto de Horda na loja para liberar metas de horda e golpes em área.</p>}
        {groups.map(({ title, kinds }) => {
          const entries = board.goals.map((goal, index) => ({ goal, index })).filter(({ goal }) => kinds.includes(goal.kind));
          if (!entries.length) return null;
          const claimedHere = entries.filter(({ index }) => board.claimed.includes(index)).length;
          return <div key={title} className="mission-group">
            <h3 className="mission-group-title">{title} <span>{claimedHere}/{entries.length}</span></h3>
            <div className="mission-grid">{entries.map(({ goal, index }) => {
              const count = Math.min(goal.target, board.counts[index] ?? 0);
              const claimed = board.claimed.includes(index);
              const ready = !claimed && goalDone(board, index);
              const label = describeGoal(goal, names);
              return <article key={index} className="mission-card" data-ready={ready || undefined} data-done={claimed || undefined}>
                <h2>{label}</h2>
                <progress aria-label={label} value={count} max={goal.target} />
                <p className="text-sm">{count} / {goal.target}</p>
                <RewardLine reward={goal.reward} />
                <Button disabled={!ready} onClick={() => claim(claimMission(tab, index, board.period), goal.reward)}>
                  {claimed ? 'Resgatado' : ready ? 'Resgatar prêmio' : 'Em andamento'}
                </Button>
              </article>;
            })}</div>
          </div>;
        })}
        <div className="mission-group">
          <h3 className="mission-group-title">Bônus de conclusão</h3>
          <div className="mission-grid">
          <article className="mission-card mission-bonus" data-ready={(boardDone(board) && !board.claimed.includes(bonusIndex)) || undefined} data-done={board.claimed.includes(bonusIndex) || undefined}>
            <h2><Gift aria-hidden="true" /> Bônus de {tierLabels[tab].toLowerCase()}</h2>
            <p className="text-sm">Resgate todas as metas da faixa.</p>
            <RewardLine reward={board.bonus} />
            <Button disabled={!boardDone(board) || board.claimed.includes(bonusIndex)} onClick={() => claim(claimMission(tab, bonusIndex, board.period), board.bonus)}>
              {board.claimed.includes(bonusIndex) ? 'Bônus resgatado' : 'Resgatar bônus'}
            </Button>
          </article>
          </div>
        </div>
      </>;
    })()}
    {message && <p role="status">{message}</p>}
  </section>;
}
