// Simulação do mapa de selvagens: posições em tiles (48 x 28), andar e correr do jogador, vaivém dos selvagens,
// colisão entre os personagens e o companheiro seguindo o rastro do jogador. Não toca no DOM nem no React, então dá para testar à parte.
import type { WildMapId } from '@pokesim-evolution/data/wild-maps';
import { wildGrid } from '@pokesim-evolution/data/wild-species';

export const cols = wildGrid.cols;
export const rows = wildGrid.rows;
/** Distância (em tiles) até a qual o jogador consegue interagir com um selvagem. */
export const interactRange = 1.5;
export const playerSpeed = 4.2;
/** Segurando Shift o jogador corre: mais rápido e com a animação de corrida. */
export const runMultiplier = 1.8;
/** Raio (em tiles) do corpo de cada personagem, usado na colisão. */
export const bodyRadius = { player: 0.35, companion: 0.35, wild: 0.5 } as const;
export const wildSpeed = 1;
/** Quantos tiles o companheiro fica atrás do jogador. */
export const companionGap = 1.3;

/** Linhas da folha de sprites: de frente, esquerda, direita e de costas. */
export type Facing = 0 | 1 | 2 | 3;
export type Point = { x: number; y: number };
export type Walker = Point & { facing: Facing; moving: boolean; clock: number };
export type Wanderer = Walker & { target: Point | null; wait: number };
export type Random = () => number;
/** Um corpo redondo no mapa que bloqueia quem tenta passar por ele. */
export type Obstacle = Point & { radius: number };

/** Um passo de `from` até `to` é barrado se entra no corpo de alguém (quem já está encostado pode se afastar). */
function collides(from: Point, to: Point, radius: number, obstacles: readonly Obstacle[]) {
  for (const other of obstacles) {
    const reach = radius + other.radius;
    const after = Math.hypot(to.x - other.x, to.y - other.y);
    if (after < reach && after < Math.hypot(from.x - other.x, from.y - other.y)) return true;
  }
  return false;
}

export function isWalkable(map: WildMapId, x: number, y: number) {
  const col = Math.floor(x);
  const row = Math.floor(y);
  return col >= 0 && row >= 0 && col < cols && row < rows && wildGrid.walkable[map][row]?.[col] === '1';
}

/** Água e lava: o jogador atravessa, mas os Pokémon selvagens não ficam ali. */
export function isLiquid(map: WildMapId, x: number, y: number) {
  const col = Math.floor(x);
  const row = Math.floor(y);
  return col >= 0 && row >= 0 && col < cols && row < rows && wildGrid.swim[map][row]?.[col] === '1';
}

/** O jogador pisa em chão firme ou na água/lava (nada o impede de entrar nelas). */
function playerCanWalk(map: WildMapId, x: number, y: number) {
  return isWalkable(map, x, y) || isLiquid(map, x, y);
}

/** Os pés do jogador ocupam um pouco de largura: os dois lados precisam estar livres (chão ou líquido). */
export function canPlayerStand(map: WildMapId, x: number, y: number) {
  return playerCanWalk(map, x, y) && playerCanWalk(map, x - 0.22, y) && playerCanWalk(map, x + 0.22, y);
}

/** Os pés ocupam um pouco de largura: os dois lados precisam estar livres. */
export function canStand(map: WildMapId, x: number, y: number) {
  return isWalkable(map, x, y) && isWalkable(map, x - 0.22, y) && isWalkable(map, x + 0.22, y);
}

function facingOf(dx: number, dy: number, previous: Facing): Facing {
  if (dx === 0 && dy === 0) return previous;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
}

/** Frame (coluna da folha) da animação de andar; parado, sempre o primeiro. */
export function frameColumn(walker: Walker) {
  return walker.moving ? Math.floor(walker.clock) % 4 : 0;
}

function freeTiles(map: WildMapId) {
  const tiles: Point[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (canStand(map, col + 0.5, row + 0.5)) tiles.push({ x: col + 0.5, y: row + 0.5 });
    }
  }
  return tiles;
}

/** Um ponto livre do mapa, de preferência longe de `from`. */
export function randomSpot(map: WildMapId, random: Random, from?: Point, minDistance = 0, others: readonly Point[] = []): Point {
  const tiles = freeTiles(map);
  const far = tiles.filter((tile) =>
    (!from || Math.hypot(tile.x - from.x, tile.y - from.y) >= minDistance) &&
    others.every((other) => Math.hypot(tile.x - other.x, tile.y - other.y) >= 3));
  const pool = far.length ? far : tiles;
  return pool[Math.floor(random() * pool.length)] ?? { x: cols / 2, y: rows / 2 };
}

/** O ponto livre mais próximo do centro do mapa, onde o jogador começa. */
export function startSpot(map: WildMapId): Point {
  const center = { x: cols / 2, y: rows / 2 };
  let best = center;
  let bestDistance = Infinity;
  for (const tile of freeTiles(map)) {
    const distance = Math.hypot(tile.x - center.x, tile.y - center.y);
    if (distance < bestDistance) { best = tile; bestDistance = distance; }
  }
  return best;
}

export function newWalker(spot: Point, facing: Facing = 0): Walker {
  return { ...spot, facing, moving: false, clock: 0 };
}

/** Anda ou corre na direção da entrada (-1..1 em cada eixo), deslizando nos obstáculos e nos Pokémon. */
export function movePlayer(
  map: WildMapId, walker: Walker, input: Point, dt: number, obstacles: readonly Obstacle[] = [], running = false,
) {
  const length = Math.hypot(input.x, input.y);
  if (length === 0) { walker.moving = false; return; }

  const speed = playerSpeed * (running ? runMultiplier : 1);
  const dx = (input.x / length) * speed * dt;
  const dy = (input.y / length) * speed * dt;
  const radius = bodyRadius.player;
  let moved = false;
  if (dx !== 0) {
    const to = { x: walker.x + dx, y: walker.y };
    if (canPlayerStand(map, to.x, to.y) && !collides(walker, to, radius, obstacles)) { walker.x = to.x; moved = true; }
  }
  if (dy !== 0) {
    const to = { x: walker.x, y: walker.y + dy };
    if (canPlayerStand(map, to.x, to.y) && !collides(walker, to, radius, obstacles)) { walker.y = to.y; moved = true; }
  }
  walker.moving = moved;
  walker.facing = facingOf(input.x, input.y, walker.facing);
  if (moved) walker.clock += dt * (running ? 12 : 8);
}

function clearLine(map: WildMapId, from: Point, to: Point) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.25);
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    if (!canStand(map, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)) return false;
  }
  return true;
}

export function newWanderer(spot: Point, random: Random): Wanderer {
  return { ...newWalker(spot), target: null, wait: random() * 2 };
}

/** Vaivém do selvagem: escolhe um ponto próximo, anda até lá, descansa um pouco e repete. */
export function stepWanderer(map: WildMapId, wanderer: Wanderer, dt: number, random: Random, obstacles: readonly Obstacle[] = []) {
  wanderer.moving = false;
  if (wanderer.wait > 0) { wanderer.wait -= dt; return; }

  if (!wanderer.target) {
    for (let attempt = 0; attempt < 8 && !wanderer.target; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const distance = 1.5 + random() * 2.5;
      const target = { x: wanderer.x + Math.cos(angle) * distance, y: wanderer.y + Math.sin(angle) * distance };
      if (clearLine(map, wanderer, target)) wanderer.target = target;
    }
    if (!wanderer.target) { wanderer.wait = 0.8 + random(); return; }
  }

  const dx = wanderer.target.x - wanderer.x;
  const dy = wanderer.target.y - wanderer.y;
  const distance = Math.hypot(dx, dy);
  const step = wildSpeed * dt;
  wanderer.facing = facingOf(dx, dy, wanderer.facing);

  if (distance <= step) {
    wanderer.target = null;
    wanderer.wait = 1 + random() * 2.5;
    return;
  }
  const x = wanderer.x + (dx / distance) * step;
  const y = wanderer.y + (dy / distance) * step;
  if (!canStand(map, x, y) || collides(wanderer, { x, y }, bodyRadius.wild, obstacles)) {
    wanderer.target = null;
    wanderer.wait = 0.3 + random() * 0.6;
    return;
  }

  wanderer.x = x;
  wanderer.y = y;
  wanderer.moving = true;
  wanderer.clock += dt * 5;
}

/** Rastro do jogador: o companheiro fica sempre `companionGap` tiles atrás, andando pelo mesmo caminho. */
export type Trail = { points: (Point & { at: number })[]; total: number };

export function newTrail(start: Point): Trail {
  return { points: [{ ...start, at: 0 }], total: 0 };
}

export function pushTrail(trail: Trail, point: Point) {
  const last = trail.points[trail.points.length - 1]!;
  const distance = Math.hypot(point.x - last.x, point.y - last.y);
  if (distance < 0.05) return;
  trail.total += distance;
  trail.points.push({ x: point.x, y: point.y, at: trail.total });
}

export function followTrail(trail: Trail, gap: number): Point {
  const target = Math.max(0, trail.total - gap);
  // Descarta o que já ficou para trás do companheiro.
  while (trail.points.length > 2 && trail.points[1]!.at <= target) trail.points.shift();

  const [from, to] = trail.points as [Trail['points'][number], Trail['points'][number]?];
  if (!to || to.at <= from.at) return { x: from.x, y: from.y };
  const t = Math.min(1, Math.max(0, (target - from.at) / (to.at - from.at)));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export function nearestWithin<T extends Point>(origin: Point, others: Iterable<T>, range = interactRange): T | null {
  let best: T | null = null;
  let bestDistance = range;
  for (const other of others) {
    const distance = Math.hypot(other.x - origin.x, other.y - origin.y);
    if (distance <= bestDistance) { best = other; bestDistance = distance; }
  }
  return best;
}
