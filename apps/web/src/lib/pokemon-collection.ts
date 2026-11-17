// Pokémon do jogador: equipe (até 6) e caixas do PC (30 vagas cada, até 100 caixas).
// Todas as operações são puras: devolvem uma nova coleção ou uma mensagem de erro (string).

import { perfectIvs, readIvs, rollIvs, type Ivs } from './ivs';

export const teamSize = 6;
export const boxSize = 30;
export const maxBoxes = 100;
export const maxNicknameLength = 12;
export const maxBoxNameLength = 20;
// Espécies da Pokédex Nacional (gerações 1 a 9).
export const pokedexTotal = 1025;
export const starterUid = 'inicial';

/** Média de nível arredondada, usada para escalar encontros no Novo Jogo+. */
export function averageLevel(team: readonly { level: number }[]) {
  return team.length ? Math.round(team.reduce((sum, { level }) => sum + level, 0) / team.length) : 5;
}

export type OwnedPokemon = {
  uid: string;
  species: number;
  nickname: string | null;
  level: number;
  shiny: boolean;
  /** Valores individuais (0–31 em cada atributo); as estrelas vêm da soma deles. */
  ivs: Ivs;
  favorite: boolean;
  /** Experiência total; ausente = a do início do nível atual. */
  exp?: number;
  /** Golpes (nomes); ausente = os que a espécie aprende até o nível atual. */
  moves?: string[];
  /** Golpes que ele quer aprender mas esperam uma vaga (já sabe 4). */
  pendingMoves?: string[];
  /** TMs compradas para este Pokémon (valem para sempre; ainda precisam ser ensinadas numa vaga). */
  tms?: string[];
  /** Bola com que foi capturado (nome do item); conta no valor de venda. Ausente = Poké Bola. */
  ball?: string;
  form?: string;
  /** HP restante após uma batalha; ausente em saves antigos significa HP cheio. */
  hp?: number;
  status?: 'burn' | 'poison' | 'paralysis' | 'sleep' | 'freeze' | null;
};
export type PcBox = { name: string; slots: (OwnedPokemon | null)[] };
/** `companion` é o uid do Pokémon que acompanha o treinador; sem ele (ou fora da equipe), vale o primeiro da equipe. */
export type Collection = { team: OwnedPokemon[]; boxes: PcBox[]; companion: string | null };
export type Place = { kind: 'team'; index: number } | { kind: 'box'; box: number; index: number };
export type Result = Collection | string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createUid() {
  const random = crypto.getRandomValues(new Uint32Array(3));
  return Array.from(random, (part) => part.toString(16).padStart(8, '0')).join('');
}

export function createPokemon(species: number, options: Partial<Pick<OwnedPokemon, 'uid' | 'level' | 'shiny' | 'ivs' | 'ball'>> = {}): OwnedPokemon {
  return {
    uid: options.uid ?? createUid(),
    species,
    nickname: null,
    level: options.level ?? 5,
    shiny: options.shiny ?? false,
    ivs: options.ivs ?? rollIvs(Math.random),
    favorite: false,
    ...(options.ball ? { ball: options.ball } : {}),
  };
}

export function emptyBox(name: string): PcBox {
  return { name, slots: Array.from({ length: boxSize }, () => null) };
}

export function newCollection(starterSpecies: number): Collection {
  // O inicial sempre nasce com IVs perfeitos (4★).
  return { team: [createPokemon(starterSpecies, { uid: starterUid, ivs: perfectIvs() })], boxes: [emptyBox('Caixa 1')], companion: null };
}

// ---------- Leitura e validação (dados salvos no navegador ou importados) ----------

function readNames(value: unknown, max: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value.filter((name): name is string => typeof name === 'string' && name.length > 0 && name.length < 40);
  return names.length > 0 ? [...new Set(names)].slice(0, max) : undefined;
}

function readPokemon(value: unknown): OwnedPokemon | null {
  if (!isRecord(value)) return null;
  const { uid, species, nickname, level, shiny, favorite, ivs } = value;
  if (typeof uid !== 'string' || !uid || typeof species !== 'number' || !Number.isSafeInteger(species) ||
      species < 1 || species > pokedexTotal) return null;

  const cleanNickname = typeof nickname === 'string' ? nickname.trim().slice(0, maxNicknameLength) : '';
  return {
    uid,
    species,
    nickname: cleanNickname || null,
    level: typeof level === 'number' && Number.isSafeInteger(level) ? Math.min(100, Math.max(1, level)) : 5,
    shiny: shiny === true,
    // Saves de antes dos IVs ganham valores fixos, derivados do identificador do Pokémon.
    ivs: readIvs(ivs, uid),
    favorite: favorite === true,
    ...(typeof value.form === 'string' && /^[a-z0-9-]{1,60}$/.test(value.form) ? { form: value.form } : {}),
    ...(typeof value.exp === 'number' && Number.isSafeInteger(value.exp) && value.exp >= 0 ? { exp: value.exp } : {}),
    ...(readNames(value.moves, 4) ? { moves: readNames(value.moves, 4) } : {}),
    ...(readNames(value.pendingMoves, 20)?.length ? { pendingMoves: readNames(value.pendingMoves, 20) } : {}),
    ...(readNames(value.tms, 400) ? { tms: readNames(value.tms, 400) } : {}),
    ...(typeof value.ball === 'string' && /^[a-z0-9-]{1,40}$/.test(value.ball) ? { ball: value.ball } : {}),
    ...(typeof value.hp === 'number' && Number.isSafeInteger(value.hp) && value.hp >= 0 && value.hp <= 9999 ? { hp: value.hp } : {}),
    ...(['burn', 'poison', 'paralysis', 'sleep', 'freeze'].includes(String(value.status)) ? { status: value.status as OwnedPokemon['status'] } : value.status === null ? { status: null } : {}),
  };
}

export function readCollection(value: unknown, starterSpecies: number): Collection {
  if (!isRecord(value) || !Array.isArray(value.team) || !Array.isArray(value.boxes)) return newCollection(starterSpecies);

  const seen = new Set<string>();
  const take = (entry: unknown) => {
    const pokemon = readPokemon(entry);
    if (!pokemon || seen.has(pokemon.uid)) return null;
    seen.add(pokemon.uid);
    // Saves de antes de o inicial ser perfeito: o inicial passa a ter IVs 4★.
    return pokemon.uid === starterUid ? { ...pokemon, ivs: perfectIvs() } : pokemon;
  };

  const team = value.team.slice(0, teamSize).map(take).filter((pokemon): pokemon is OwnedPokemon => pokemon !== null);
  const boxes = value.boxes.slice(0, maxBoxes).map((entry: unknown, index): PcBox => {
    const name = isRecord(entry) && typeof entry.name === 'string' && entry.name.trim()
      ? entry.name.trim().slice(0, maxBoxNameLength) : `Caixa ${index + 1}`;
    const raw: unknown[] = isRecord(entry) && Array.isArray(entry.slots) ? entry.slots.slice(0, boxSize) : [];
    const slots = raw.map(take);
    while (slots.length < boxSize) slots.push(null);
    return { name, slots };
  });
  if (boxes.length === 0) boxes.push(emptyBox('Caixa 1'));

  if (team.length === 0) {
    // A equipe nunca fica vazia: se estiver, promove o primeiro Pokémon do PC.
    for (const box of boxes) {
      const index = box.slots.findIndex((slot) => slot !== null);
      if (index >= 0) {
        team.push(box.slots[index]!);
        box.slots[index] = null;
        break;
      }
    }
  }
  if (team.length === 0) return newCollection(starterSpecies);

  const companion = typeof value.companion === 'string' && team.some((pokemon) => pokemon.uid === value.companion)
    ? value.companion : null;
  return { team, boxes, companion };
}

// ---------- Consultas ----------

function copy(collection: Collection): Collection {
  return {
    team: [...collection.team],
    boxes: collection.boxes.map((box) => ({ ...box, slots: [...box.slots] })),
    companion: collection.companion,
  };
}

export function getAt(collection: Collection, place: Place): OwnedPokemon | null {
  return place.kind === 'team'
    ? collection.team[place.index] ?? null
    : collection.boxes[place.box]?.slots[place.index] ?? null;
}

export function locate(collection: Collection, uid: string): Place | null {
  const teamIndex = collection.team.findIndex((pokemon) => pokemon.uid === uid);
  if (teamIndex >= 0) return { kind: 'team', index: teamIndex };
  for (const [box, { slots }] of collection.boxes.entries()) {
    const index = slots.findIndex((slot) => slot?.uid === uid);
    if (index >= 0) return { kind: 'box', box, index };
  }
  return null;
}

export function samePlace(a: Place, b: Place) {
  return a.kind === 'team' ? b.kind === 'team' && a.index === b.index
    : b.kind === 'box' && a.box === b.box && a.index === b.index;
}

export function boxPokemon(collection: Collection) {
  return collection.boxes.flatMap((box, boxIndex) => box.slots.flatMap((pokemon, index) =>
    pokemon ? [{ pokemon, place: { kind: 'box', box: boxIndex, index } as Place }] : []));
}

export function freeSlots(box: PcBox) {
  return box.slots.reduce((total, slot) => total + (slot === null ? 1 : 0), 0);
}

/** O Pokémon que anda ao lado do treinador: o escolhido, se ainda estiver na equipe; senão, o primeiro. */
export function companionOf(collection: Collection): OwnedPokemon {
  return collection.team.find((pokemon) => pokemon.uid === collection.companion) ?? collection.team[0]!;
}

// ---------- Operações ----------

/** Define o companheiro entre os Pokémon da equipe. */
export function setCompanion(collection: Collection, uid: string): Result {
  if (!collection.team.some((pokemon) => pokemon.uid === uid)) return 'Só um Pokémon da equipe pode ser o companheiro.';
  return collection.companion === uid ? collection : { ...collection, companion: uid };
}

function openSlot(collection: Collection): { collection: Collection; place: Place } | string {
  for (const [box, { slots }] of collection.boxes.entries()) {
    const index = slots.indexOf(null);
    if (index >= 0) return { collection, place: { kind: 'box', box, index } };
  }
  if (collection.boxes.length >= maxBoxes) return `O PC está cheio (limite de ${maxBoxes} caixas).`;

  const next = copy(collection);
  next.boxes.push(emptyBox(`Caixa ${next.boxes.length + 1}`));
  return { collection: next, place: { kind: 'box', box: next.boxes.length - 1, index: 0 } };
}

export function applyLineup(collection: Collection, uids: readonly string[]): Result {
  if (!uids.length || uids.length > teamSize || new Set(uids).size !== uids.length) return 'Equipe inválida.';
  const roster = new Map([...collection.team, ...boxPokemon(collection).map(({ pokemon }) => pokemon)].map((pokemon) => [pokemon.uid, pokemon]));
  const team = uids.map((uid) => roster.get(uid));
  if (team.some((pokemon) => !pokemon)) return 'Um Pokémon desta equipe saiu da coleção.';
  const selected = new Set(uids);
  const next: Collection = { ...collection, team: team as OwnedPokemon[], boxes: collection.boxes.map((box) => ({
    ...box, slots: box.slots.map((pokemon) => pokemon && selected.has(pokemon.uid) ? null : pokemon),
  })) };
  for (const pokemon of collection.team) {
    if (selected.has(pokemon.uid)) continue;
    const slot = openSlot(next);
    if (typeof slot === 'string') return slot;
    next.boxes = slot.collection.boxes;
    if (slot.place.kind === 'box') next.boxes[slot.place.box]!.slots[slot.place.index] = pokemon;
  }
  if (next.companion && !selected.has(next.companion)) next.companion = null;
  return next;
}

/** Adiciona um Pokémon capturado: vai para a equipe se houver vaga; senão, para a primeira vaga livre do PC. */
export function addPokemon(collection: Collection, pokemon: OwnedPokemon): Result {
  if (collection.team.length < teamSize) return { ...collection, team: [...collection.team, pokemon] };

  const slot = openSlot(collection);
  if (typeof slot === 'string') return slot;
  const next = copy(slot.collection);
  if (slot.place.kind === 'box') next.boxes[slot.place.box]!.slots[slot.place.index] = pokemon;
  return next;
}

/** Move (ou troca) o Pokémon de uma vaga para outra, entre equipe e caixas. */
export function move(collection: Collection, from: Place, to: Place): Result {
  const subject = getAt(collection, from);
  if (!subject) return 'Não há Pokémon nessa vaga.';
  if (samePlace(from, to)) return collection;

  const next = copy(collection);

  if (from.kind === 'team') {
    if (to.kind === 'team') {
      const target = Math.min(to.index, next.team.length - 1);
      if (target === from.index) return collection;
      const other = next.team[target]!;
      next.team[target] = subject;
      next.team[from.index] = other;
      return next;
    }

    const destination = next.boxes[to.box]?.slots;
    if (!destination) return 'Caixa inexistente.';
    const occupant = destination[to.index] ?? null;
    if (!occupant && next.team.length <= 1) return 'A equipe precisa ter ao menos um Pokémon.';
    destination[to.index] = subject;
    if (occupant) next.team[from.index] = occupant;
    else next.team.splice(from.index, 1);
    return next;
  }

  const source = next.boxes[from.box]!.slots;
  if (to.kind === 'box') {
    const destination = next.boxes[to.box]?.slots;
    if (!destination) return 'Caixa inexistente.';
    const occupant = destination[to.index] ?? null;
    destination[to.index] = subject;
    source[from.index] = occupant;
    return next;
  }

  // Do PC para a equipe: vaga ocupada troca; vaga livre acrescenta ao fim da equipe.
  if (to.index < next.team.length) {
    const occupant = next.team[to.index]!;
    next.team[to.index] = subject;
    source[from.index] = occupant;
    return next;
  }
  if (next.team.length >= teamSize) return 'A equipe já tem 6 Pokémon. Troque com um deles.';
  source[from.index] = null;
  next.team.push(subject);
  return next;
}

export function sendToPc(collection: Collection, uid: string): Result {
  const from = locate(collection, uid);
  if (from?.kind !== 'team') return 'Esse Pokémon já está no PC.';
  if (collection.team.length <= 1) return 'A equipe precisa ter ao menos um Pokémon.';

  const slot = openSlot(collection);
  if (typeof slot === 'string') return slot;
  return move(slot.collection, from, slot.place);
}

export function withdraw(collection: Collection, uid: string): Result {
  const from = locate(collection, uid);
  if (from?.kind !== 'box') return 'Esse Pokémon já está na equipe.';
  if (collection.team.length >= teamSize) return 'A equipe já tem 6 Pokémon. Envie um ao PC ou troque com ele.';
  return move(collection, from, { kind: 'team', index: collection.team.length });
}

function mapPokemon(collection: Collection, change: (pokemon: OwnedPokemon) => OwnedPokemon): Collection {
  return {
    ...collection,
    team: collection.team.map(change),
    boxes: collection.boxes.map((box) => ({ ...box, slots: box.slots.map((slot) => slot && change(slot)) })),
  };
}

export function setFavorite(collection: Collection, uids: readonly string[], favorite: boolean): Collection {
  const targets = new Set(uids);
  return mapPokemon(collection, (pokemon) => targets.has(pokemon.uid) ? { ...pokemon, favorite } : pokemon);
}

export function setNickname(collection: Collection, uid: string, nickname: string): Collection {
  const clean = nickname.trim().slice(0, maxNicknameLength) || null;
  return mapPokemon(collection, (pokemon) => pokemon.uid === uid ? { ...pokemon, nickname: clean } : pokemon);
}

/** Troca os dados de um Pokémon (equipe ou PC) sem mexer em mais nada. */
export function updatePokemon(collection: Collection, uid: string, change: (pokemon: OwnedPokemon) => OwnedPokemon): Collection {
  return mapPokemon(collection, (pokemon) => pokemon.uid === uid ? change(pokemon) : pokemon);
}

export function replaceSpecies(collection: Collection, uid: string, species: number): Collection {
  return mapPokemon(collection, (pokemon) => pokemon.uid === uid ? { ...pokemon, species } : pokemon);
}

/**
 * Tira Pokémon da coleção (venda), tanto da equipe quanto do PC. Favoritos nunca saem,
 * e a equipe não pode ficar vazia. Devolve os Pokémon retirados, para somar o valor.
 */
export function removePokemon(collection: Collection, uids: readonly string[]): { collection: Collection; removed: OwnedPokemon[] } | string {
  const targets = new Set(uids);
  const removed: OwnedPokemon[] = [];
  const keep = (slot: OwnedPokemon | null) => {
    if (!slot || !targets.has(slot.uid)) return true;
    if (slot.favorite) return true;
    removed.push(slot);
    return false;
  };
  const team = collection.team.filter(keep);
  if (team.length === 0) return 'Mantenha pelo menos um Pokémon na equipe.';
  const boxes = collection.boxes.map((box) => ({ ...box, slots: box.slots.map((slot) => keep(slot) ? slot : null) }));
  const companion = collection.companion && team.some((pokemon) => pokemon.uid === collection.companion) ? collection.companion : null;
  return { collection: { ...collection, team, boxes, companion }, removed };
}

/** Quantos Pokémon o treinador tem, somando a equipe e o PC. */
export function pokemonCount(collection: Collection) {
  return collection.team.length + boxPokemon(collection).length;
}

/**
 * Morte permanente: apaga os Pokémon derrotados (favoritos também). Enquanto sobrar algum Pokémon, a equipe não fica vazia:
 * entra o de maior nível do PC. Sem nenhum Pokémon, a equipe fica vazia e quem chamou encerra o jogo.
 */
export function loseDefeated(collection: Collection, uids: readonly string[]): Collection {
  const dead = new Set(uids);
  const team = collection.team.filter((pokemon) => !dead.has(pokemon.uid));
  const boxes = collection.boxes.map((box) => ({ ...box, slots: box.slots.map((slot) => (slot && dead.has(slot.uid) ? null : slot)) }));
  if (team.length === 0) {
    let best: { box: number; index: number } | null = null;
    for (const [box, { slots }] of boxes.entries()) {
      for (const [index, slot] of slots.entries()) {
        if (slot && (!best || slot.level > boxes[best.box]!.slots[best.index]!.level)) best = { box, index };
      }
    }
    if (best) {
      team.push(boxes[best.box]!.slots[best.index]!);
      boxes[best.box]!.slots[best.index] = null;
    }
  }
  const companion = collection.companion && team.some((pokemon) => pokemon.uid === collection.companion) ? collection.companion : null;
  return { team, boxes, companion };
}

export function renameBox(collection: Collection, index: number, name: string): Collection {
  const clean = name.trim().slice(0, maxBoxNameLength) || `Caixa ${index + 1}`;
  return { ...collection, boxes: collection.boxes.map((box, i) => i === index ? { ...box, name: clean } : box) };
}

export function addBox(collection: Collection): Result {
  if (collection.boxes.length >= maxBoxes) return `O limite é de ${maxBoxes} caixas.`;
  return { ...collection, boxes: [...collection.boxes, emptyBox(`Caixa ${collection.boxes.length + 1}`)] };
}

/** Move vários Pokémon do PC para uma caixa que tenha vagas suficientes. */
export function moveToBox(collection: Collection, uids: readonly string[], boxIndex: number): Result {
  const target = collection.boxes[boxIndex];
  if (!target) return 'Caixa inexistente.';

  const wanted = new Set(uids);
  const moving = boxPokemon(collection).filter(({ pokemon, place }) =>
    wanted.has(pokemon.uid) && place.kind === 'box' && place.box !== boxIndex);
  if (moving.length === 0) return collection;

  const free = freeSlots(target);
  if (moving.length > free) {
    return `A caixa ${target.name} tem só ${free} ${free === 1 ? 'vaga livre' : 'vagas livres'} para ${moving.length} Pokémon.`;
  }

  const next = copy(collection);
  for (const { place } of moving) {
    if (place.kind === 'box') next.boxes[place.box]!.slots[place.index] = null;
  }
  const slots = next.boxes[boxIndex]!.slots;
  for (const { pokemon } of moving) slots[slots.indexOf(null)] = pokemon;
  return next;
}

/** Reordena todos os Pokémon do PC e os reagrupa nas caixas, do início ao fim. */
export function organize(collection: Collection, compare: (a: OwnedPokemon, b: OwnedPokemon) => number): Collection {
  const sorted = boxPokemon(collection).map(({ pokemon }) => pokemon).sort(compare);
  const boxes = collection.boxes.map((box, boxIndex) => ({
    ...box,
    slots: Array.from({ length: boxSize }, (_, index) => sorted[boxIndex * boxSize + index] ?? null),
  }));
  return { ...collection, boxes };
}
