import assert from 'node:assert/strict';
import test from 'node:test';
import {
  achievementReward, achievements, applyEvent, applyLifetime, describeGoal, emptyLifetime, generateBoard, matches, readMissionState,
  rewardGrowth, tierEnd, tierPeriod, type Board, type Names, type PoolEntry,
} from './mission-goals.ts';

const pool: PoolEntry[] = [
  { id: 1, types: ['grass', 'poison'], region: 1 }, { id: 4, types: ['fire'], region: 1 }, { id: 7, types: ['water'], region: 1 },
  { id: 25, types: ['electric'], region: 1 }, { id: 152, types: ['grass'], region: 2 },
];
const names: Names = { type: (id) => id.toUpperCase(), species: (id) => `#${id}`, region: (id) => `R${id}` };
const profile = (progress: number, charm = false, entries = pool) => ({ progress, charm, pool: entries });

test('o mesmo período e perfil geram sempre as mesmas metas', () => {
  assert.deepEqual(generateBoard('daily', 20000, profile(3)), generateBoard('daily', 20000, profile(3)));
  assert.notDeepEqual(generateBoard('daily', 20000, profile(3)).goals, generateBoard('daily', 20001, profile(3)).goals);
});

test('cada faixa tem a quantidade esperada de metas e o amuleto abre as de horda e área', () => {
  assert.equal(generateBoard('quick', 5, profile(0)).goals.length, 10);
  assert.equal(generateBoard('daily', 5, profile(0)).goals.length, 7);
  assert.equal(generateBoard('weekly', 5, profile(0)).goals.length, 9);
  const kinds = (charm: boolean, tier: 'quick' | 'daily' | 'weekly') => generateBoard(tier, 5, profile(2, charm)).goals.map((goal) => goal.kind);
  assert.ok(!kinds(false, 'weekly').some((kind) => kind === 'horde' || kind === 'area'));
  assert.ok(kinds(true, 'weekly').includes('horde') && kinds(true, 'weekly').includes('area'));
  assert.ok(kinds(true, 'quick').includes('horde') && !kinds(false, 'quick').includes('horde'));
});

test('metas e prêmios crescem com o progresso do jogador', () => {
  const low = generateBoard('daily', 99, profile(0));
  const high = generateBoard('daily', 99, profile(12));
  low.goals.forEach((goal, index) => {
    const other = high.goals[index]!;
    assert.ok(other.target >= goal.target);
    assert.ok(other.reward.money > goal.reward.money);
    assert.ok(other.reward.chips > goal.reward.chips);
  });
  assert.ok(high.bonus.money > low.bonus.money);
  assert.equal(rewardGrowth(0), 1);
  assert.ok(generateBoard('weekly', 1, profile(0)).goals[0]!.target < generateBoard('weekly', 1, profile(10)).goals[0]!.target);
});

test('tipos, espécies e gerações sorteados só vêm das espécies que aparecem no mapa', () => {
  const types = new Set(pool.flatMap((entry) => entry.types));
  const ids = new Set(pool.map((entry) => entry.id));
  let sawType = false, sawSpecies = false, sawRegion = false;
  for (let period = 0; period < 200; period += 1) for (const tier of ['quick', 'daily', 'weekly'] as const) {
    for (const goal of generateBoard(tier, period, profile(4, true)).goals) {
      if (goal.filter?.type) { sawType = true; assert.ok(types.has(goal.filter.type)); }
      if (goal.filter?.species) { sawSpecies = true; assert.ok(ids.has(goal.filter.species)); }
      if (goal.filter?.region) { sawRegion = true; assert.ok([1, 2].includes(goal.filter.region)); }
    }
  }
  assert.ok(sawType && sawSpecies && sawRegion);
  const kanto = pool.filter((entry) => entry.region === 1);
  for (let period = 0; period < 100; period += 1) {
    assert.ok(generateBoard('weekly', period, profile(0, false, kanto)).goals.every((goal) => goal.filter?.region === undefined));
  }
});

test('uma meta de tipo não repete o mesmo tipo na faixa', () => {
  for (let period = 0; period < 100; period += 1) {
    const filters = generateBoard('quick', period, profile(2)).goals.filter((goal) => goal.filter?.type).map((goal) => `${goal.kind}${goal.filter!.type}`);
    assert.equal(new Set(filters).size, filters.length);
  }
});

test('sem espécies disponíveis as metas de sorteio viram metas simples', () => {
  const board = generateBoard('quick', 3, profile(0, false, []));
  assert.ok(board.goals.every((goal) => !goal.filter));
});

test('os eventos contam só nas metas que combinam', () => {
  assert.ok(matches({ kind: 'defeat' }, { kind: 'defeat', species: 1 }));
  assert.ok(!matches({ kind: 'defeat' }, { kind: 'catch', species: 1 }));
  assert.ok(matches({ kind: 'catch', filter: { type: 'fire' } }, { kind: 'catch', types: ['fire', 'flying'] }));
  assert.ok(!matches({ kind: 'catch', filter: { type: 'fire' } }, { kind: 'catch', types: ['water'] }));
  assert.ok(matches({ kind: 'catch', filter: { stars: 2 } }, { kind: 'catch', stars: 3 }));
  assert.ok(!matches({ kind: 'catch', filter: { stars: 2 } }, { kind: 'catch', stars: 1 }));
  assert.ok(!matches({ kind: 'catch', filter: { shiny: true } }, { kind: 'catch', shiny: false }));
  assert.ok(matches({ kind: 'defeat', filter: { species: 25 } }, { kind: 'defeat', species: 25 }));
  assert.ok(!matches({ kind: 'defeat', filter: { region: 2 } }, { kind: 'defeat', region: 1 }));
});

const board = (): Board => ({
  period: 1, counts: [0, 0, 0], seen: [[], [], []], claimed: [], bonus: { money: 1, chips: 1, items: [] },
  goals: [
    { kind: 'defeat', target: 2, reward: { money: 1, chips: 1, items: [] } },
    { kind: 'catch', distinct: true, target: 3, reward: { money: 1, chips: 1, items: [] } },
    { kind: 'area', target: 10, reward: { money: 1, chips: 1, items: [] } },
  ],
});

test('contagem simples, espécies diferentes e limite no alvo', () => {
  let current = board();
  for (let i = 0; i < 5; i += 1) current = applyEvent(current, { kind: 'defeat', species: 1 });
  assert.equal(current.counts[0], 2);
  current = applyEvent(current, { kind: 'catch', species: 1 });
  current = applyEvent(current, { kind: 'catch', species: 1 });
  current = applyEvent(current, { kind: 'catch', species: 4 });
  assert.equal(current.counts[1], 2);
  assert.deepEqual(current.seen[1], [1, 4]);
  current = applyEvent(current, { kind: 'area', amount: 7 });
  current = applyEvent(current, { kind: 'area', amount: 7 });
  assert.equal(current.counts[2], 10);
  const same = board();
  assert.equal(applyEvent(same, { kind: 'cup' }), same);
});

test('conquistas acumulam no longo prazo e os prêmios sobem a cada nível', () => {
  let lifetime = emptyLifetime();
  lifetime = applyLifetime(lifetime, { kind: 'catch', species: 1, shiny: true, stars: 3 });
  lifetime = applyLifetime(lifetime, { kind: 'catch', species: 4, shiny: false, stars: 1 });
  assert.equal(lifetime.counts.catch, 2);
  assert.equal(lifetime.counts.shiny, 1);
  assert.equal(lifetime.counts.stars2, 1);
  assert.equal(lifetime.counts.stars3, 1);
  assert.equal(lifetime.counts.defeat, undefined);
  for (const achievement of achievements) {
    const levels = achievement.levels;
    assert.ok(levels.every((value, index) => index === 0 || value > levels[index - 1]!), achievement.id);
    let previous = 0;
    levels.forEach((_, level) => {
      const reward = achievementReward(0, level);
      assert.ok(reward.money > previous);
      previous = reward.money;
    });
  }
});

test('período das faixas: 2 horas, dia e semana no horário local', () => {
  const noon = Date.UTC(2026, 10, 25, 12); // quarta-feira
  const hour = 3_600_000;
  assert.equal(tierPeriod('quick', noon), tierPeriod('quick', noon + hour * 0.5));
  assert.equal(tierEnd('quick', tierPeriod('quick', noon)) % (2 * hour), 0);
  // Brasília (UTC−3 → offset 180): meia-noite local = 03:00 UTC.
  const before = Date.UTC(2026, 10, 26, 2, 59), after = Date.UTC(2026, 10, 26, 3, 1);
  assert.equal(tierPeriod('daily', after, 180), tierPeriod('daily', before, 180) + 1);
  assert.equal(tierEnd('daily', tierPeriod('daily', before, 180), 180), Date.UTC(2026, 10, 26, 3));
  // A semana vira na segunda-feira (30/11/2026) à meia-noite local.
  const sunday = Date.UTC(2026, 10, 30, 2, 59), monday = Date.UTC(2026, 10, 30, 3, 1);
  assert.equal(tierPeriod('weekly', monday, 180), tierPeriod('weekly', sunday, 180) + 1);
  assert.equal(tierEnd('weekly', tierPeriod('weekly', sunday, 180), 180), Date.UTC(2026, 10, 30, 3));
  assert.equal(new Date(tierEnd('weekly', tierPeriod('weekly', noon), 0)).getUTCDay(), 1);
});

test('descrições em português para todas as metas', () => {
  assert.equal(describeGoal({ kind: 'defeat', target: 5 }, names), 'Derrote 5 Pokémon selvagens');
  assert.equal(describeGoal({ kind: 'defeat', target: 3, filter: { type: 'fire' } }, names), 'Derrote 3 Pokémon selvagens do tipo FIRE');
  assert.equal(describeGoal({ kind: 'defeat', target: 1, filter: { species: 25 } }, names), 'Derrote #25 selvagem');
  assert.equal(describeGoal({ kind: 'catch', target: 2, filter: { species: 25 } }, names), 'Capture #25 2 vezes');
  assert.equal(describeGoal({ kind: 'catch', target: 4, distinct: true }, names), 'Capture 4 espécies diferentes');
  assert.equal(describeGoal({ kind: 'catch', target: 2, filter: { stars: 2 } }, names), 'Capture 2 Pokémon com 2★ ou mais nos IVs');
  assert.equal(describeGoal({ kind: 'catch', target: 3, filter: { region: 2 } }, names), 'Capture 3 Pokémon de R2');
  assert.equal(describeGoal({ kind: 'horde', target: 1 }, names), 'Vença 1 horda');
  assert.equal(describeGoal({ kind: 'area', target: 40 }, names), 'Use golpes em área 40 vezes');
});

test('o save é lido com segurança: dados ruins são descartados e o formato antigo recomeça', () => {
  const quick = generateBoard('quick', 7, profile(2, true));
  const state = { quick: applyEvent(quick, { kind: 'defeat', species: 1 }), lifetime: { counts: { defeat: 4 }, claimed: { defeat: 1 } } };
  const round = readMissionState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(round?.quick, state.quick);
  assert.deepEqual(round?.lifetime, state.lifetime);
  assert.equal(readMissionState({ period: 5, captures: [1], wild: 2, trainer: 0, cup: 0, claimed: [0] })?.quick, undefined);
  assert.equal(readMissionState('x'), undefined);
  const tampered = JSON.parse(JSON.stringify(state));
  tampered.quick.goals[0].reward.items = [['ITEM!!', 5]];
  assert.equal(readMissionState(tampered)?.quick, undefined);
  tampered.quick.goals[0].reward.items = [['great-ball', 5000]];
  assert.equal(readMissionState(tampered)?.quick, undefined);
  const clamped = JSON.parse(JSON.stringify(state));
  clamped.quick.counts[0] = 9999;
  clamped.quick.claimed = [0, 0, 99, -1];
  clamped.lifetime = { counts: { defeat: -3, unknown: 5, catch: 7 }, claimed: {} };
  const read = readMissionState(clamped)!;
  assert.equal(read.quick?.counts[0], 0);
  assert.deepEqual(read.quick?.claimed, [0]);
  assert.deepEqual(read.lifetime.counts, { catch: 7 });
});
