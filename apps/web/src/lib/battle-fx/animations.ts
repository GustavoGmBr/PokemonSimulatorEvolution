import type { FxType, GlyphKind } from './glyphs';
import {
  actor, aura, beam, bolt, burst, field, orbit, rain, ring, rise, screen, shot, slash, stream, tint, wave,
  type FxAnimation, type Spec,
} from './engine';

/* Blocos reutilizados: o impacto no alvo (explosão + tremida + clarão) e a investida de quem ataca. */
const hit = (at: number, glyph: GlyphKind, n = 8, size = 4, radius = 30, shake = 5): Spec[] => [
  burst({ at, dur: 460, glyph, n, size, radius, where: 'tgt', ring: true }),
  actor({ at, dur: 380, who: 'tgt', move: 'shake', amt: shake }),
  actor({ at, dur: 320, who: 'tgt', move: 'flash' }),
];
const lunge = (at = 0, dur = 620, amt = 100): Spec => actor({ at, dur, who: 'src', move: 'lunge', amt });
const knock = (at: number, amt = 8): Spec => actor({ at, dur: 420, who: 'tgt', move: 'recoil', amt });

const def = (type: FxType, kind: FxAnimation['kind'], slug: string, name: string, els: Spec[]): FxAnimation => ({
  id: `${type}-${slug}`, type, kind, name, els,
});

/* ======================================================================== NORMAL */
const normal: FxAnimation[] = [
  def('normal', 'physical', 'investida', 'Investida', [lunge(), ...hit(240, 'star', 9, 4.5, 34, 6), knock(240)]),
  def('normal', 'physical', 'golpes-rapidos', 'Golpes rápidos', [
    lunge(0, 280, 96), ...hit(110, 'spark', 5, 3.5, 20, 3),
    lunge(300, 280, 96), ...hit(410, 'spark', 5, 3.5, 20, 3),
    lunge(600, 300, 100), ...hit(720, 'star', 8, 4, 30, 6),
  ]),
  def('normal', 'physical', 'arranhao', 'Arranhão', [
    lunge(0, 520, 84), slash({ at: 200, dur: 480, style: 'claw', size: 24 }), ...hit(320, 'spark', 6, 3, 22, 4),
  ]),
  def('normal', 'physical', 'pancada', 'Pancada', [
    actor({ at: 0, dur: 500, who: 'src', move: 'hop', amt: 26 }), actor({ at: 380, dur: 420, who: 'src', move: 'lunge', amt: 100 }),
    ...hit(640, 'star', 10, 5, 38, 8), screen({ at: 640, dur: 320, amt: 3 }), knock(640, 12),
  ]),
  def('normal', 'special', 'hiper-raio', 'Hiper-raio', [
    orbit({ at: 0, dur: 600, glyph: 'spark', n: 10, size: 3, r: 30, mode: 'in', where: 'src', turns: 1 }),
    beam({ at: 560, dur: 700, width: 11 }), ...hit(700, 'star', 12, 5, 46, 7),
    tint({ at: 640, dur: 500, color: 'light', alpha: 0.4 }), screen({ at: 640, dur: 560, amt: 4 }),
  ]),
  def('normal', 'special', 'grito', 'Grito', [
    shot({ at: 0, dur: 900, glyph: 'ring', size: 7, n: 4, stagger: 0.7, face: false, grow: 1.4 }),
    ring({ at: 760, dur: 520, n: 3, r1: 40, w: 2.6 }), actor({ at: 760, dur: 600, who: 'tgt', move: 'shake', amt: 5 }), screen({ at: 760, dur: 500, amt: 2 }),
  ]),
  def('normal', 'special', 'estrelas', 'Chuva de estrelas', [
    shot({ at: 0, dur: 820, glyph: 'star', size: 4.2, n: 7, stagger: 0.55, arc: 26, spread: 22, spin: 1.5, trail: 3, spreadStart: 14 }),
    ...hit(520, 'spark', 10, 3.5, 34, 4),
  ]),
  def('normal', 'special', 'onda-de-impacto', 'Onda de impacto', [
    ring({ at: 0, dur: 700, where: 'src', n: 3, r1: 54, flat: 0.5, w: 2.4 }),
    wave({ at: 220, dur: 760, style: 'shock', height: 22, length: 70 }), ...hit(620, 'star', 7, 4, 30, 6),
  ]),
  def('normal', 'status', 'energizar', 'Energizar', [
    aura({ at: 0, dur: 1200, where: 'src', style: 'up', glyph: 'arrow', n: 8 }), actor({ at: 0, dur: 1200, who: 'src', move: 'grow', amt: 6 }),
    orbit({ at: 100, dur: 1000, glyph: 'spark', n: 6, size: 2.6, r: 26, where: 'src', mode: 'hold', turns: 1.2 }),
  ]),
  def('normal', 'status', 'encarar', 'Encarar', [
    ring({ at: 0, dur: 800, where: 'tgt', n: 3, r0: 36, r1: 6, inward: true, w: 2.4 }),
    aura({ at: 150, dur: 1000, where: 'tgt', style: 'down', glyph: 'arrow', n: 7 }), tint({ at: 100, dur: 900, color: 'dark', alpha: 0.28 }),
    actor({ at: 300, dur: 700, who: 'tgt', move: 'squash', amt: 14 }),
  ]),
];

/* ======================================================================== FOGO */
const fire: FxAnimation[] = [
  def('fire', 'physical', 'soco-de-fogo', 'Soco de fogo', [
    lunge(0, 580, 100), shot({ at: 160, dur: 200, glyph: 'fist', size: 6, from: 'src', to: 'tgt', ease: 'in' }),
    ...hit(300, 'flame', 9, 4.5, 36, 6), rise({ at: 300, dur: 520, glyph: 'flame', n: 4, size: 6, height: 1.3, spreadX: 30 }), knock(300),
  ]),
  def('fire', 'physical', 'investida-flamejante', 'Investida flamejante', [
    stream({ at: 0, dur: 620, glyph: 'flame', n: 14, size: 5, from: 'src', to: 'srcFeet', spread: 26, rate: 2.4, wob: 4, spin: 0 }),
    lunge(60, 640, 108), ...hit(330, 'flame', 12, 5.5, 46, 8), screen({ at: 330, dur: 380, amt: 3 }), knock(330, 12),
  ]),
  def('fire', 'physical', 'garra-incandescente', 'Garra incandescente', [
    lunge(0, 520, 86), slash({ at: 200, dur: 520, style: 'claw', size: 26 }), burst({ at: 300, dur: 560, glyph: 'flame', n: 8, size: 3.4, radius: 30, up: true, gravity: -1 }),
    ...hit(320, 'spark', 4, 3, 16, 4),
  ]),
  def('fire', 'special', 'bola-de-fogo', 'Bola de fogo', [
    shot({ at: 0, dur: 700, glyph: 'flame', size: 8.5, from: 'src', to: 'tgt', arc: 24, trail: 5, spin: 0 }),
    ...hit(660, 'flame', 12, 5, 44, 6), rise({ at: 700, dur: 560, glyph: 'flame', n: 5, size: 6.5, height: 1.4, spreadX: 36 }),
  ]),
  def('fire', 'special', 'lanca-chamas', 'Lança-chamas', [
    stream({ at: 0, dur: 1250, glyph: 'flame', n: 30, size: 6, from: 'src', to: 'tgt', spread: 34, rate: 2.2, wob: 5, grow: 0.6 }),
    actor({ at: 500, dur: 800, who: 'tgt', move: 'jitter', amt: 3 }), tint({ at: 400, dur: 900, color: 'glow', alpha: 0.22 }),
  ]),
  def('fire', 'special', 'rajada-de-fogo', 'Rajada de fogo', [
    shot({ at: 0, dur: 620, glyph: 'flame', size: 5.5, n: 5, stagger: 0.4, spread: 40, arc: 18, trail: 3, from: 'src', to: 'tgt' }),
    burst({ at: 620, dur: 700, glyph: 'flame', n: 5, size: 11, radius: 34, where: 'tgt', gravity: -0.5, flash: true, ring: true }),
    ring({ at: 650, dur: 600, n: 3, r1: 58, w: 3 }), tint({ at: 620, dur: 600, color: 'glow', alpha: 0.3 }), screen({ at: 640, dur: 520, amt: 4 }),
    actor({ at: 640, dur: 520, who: 'tgt', move: 'shake', amt: 7 }),
  ]),
  def('fire', 'special', 'chuva-de-brasas', 'Chuva de brasas', [
    rain({ at: 0, dur: 1100, glyph: 'flame', n: 22, size: 4.5, spreadX: 70, fall: 0.38, drift: 16 }),
    rise({ at: 600, dur: 600, glyph: 'flame', n: 4, size: 5, height: 1.2, spreadX: 48 }), actor({ at: 500, dur: 600, who: 'tgt', move: 'shake', amt: 4 }),
  ]),
  def('fire', 'special', 'redemoinho-de-fogo', 'Redemoinho de fogo', [
    orbit({ at: 0, dur: 1300, glyph: 'flame', n: 14, size: 5, r: 34, mode: 'out', turns: 2.4, where: 'tgt', flat: 0.55 }),
    orbit({ at: 200, dur: 1100, glyph: 'flame', n: 8, size: 4, r: 22, mode: 'hold', turns: -2, where: 'tgt', flat: 0.5 }),
    actor({ at: 300, dur: 900, who: 'tgt', move: 'jitter', amt: 4 }), tint({ at: 200, dur: 1000, color: 'glow', alpha: 0.2 }),
  ]),
  def('fire', 'status', 'chama-interior', 'Chama interior', [
    aura({ at: 0, dur: 1300, where: 'src', style: 'up', glyph: 'flame', n: 9, size: 4.2 }), actor({ at: 0, dur: 1300, who: 'src', move: 'grow', amt: 7 }),
    tint({ at: 100, dur: 1000, color: 'glow', alpha: 0.2 }),
  ]),
  def('fire', 'status', 'fogo-fatuo', 'Fogo-fátuo', [
    shot({ at: 0, dur: 760, glyph: 'wisp', size: 5, n: 3, stagger: 0.5, arc: 22, spread: 14, trail: 3 }),
    orbit({ at: 700, dur: 900, glyph: 'flame', n: 6, size: 3.6, r: 24, mode: 'hold', turns: 1.5, where: 'tgt' }), aura({ at: 800, dur: 800, where: 'tgt', style: 'pulse', glyph: 'flame', n: 6, size: 3.6 }),
    actor({ at: 800, dur: 700, who: 'tgt', move: 'blink' }),
  ]),
];

/* ======================================================================== ÁGUA */
const water: FxAnimation[] = [
  def('water', 'physical', 'cabecada-aquatica', 'Cabeçada aquática', [
    stream({ at: 0, dur: 560, glyph: 'drop', n: 12, size: 4, from: 'src', to: 'srcFeet', spread: 24, rate: 2.2 }),
    lunge(40, 600, 100), ...hit(320, 'drop', 12, 4.5, 40, 6), ring({ at: 330, dur: 500, n: 2, where: 'tgtFeet', r1: 40, flat: 0.35 }), knock(330, 10),
  ]),
  def('water', 'physical', 'cascata', 'Cascata', [
    lunge(0, 520, 90), rise({ at: 280, dur: 700, glyph: 'drop', n: 7, size: 6, height: 2.2, spreadX: 30, stagger: 0.25 }),
    ...hit(360, 'bubble', 9, 3.5, 38, 6), knock(360, 10),
  ]),
  def('water', 'physical', 'mergulho-aquatico', 'Mergulho aquático', [
    actor({ at: 0, dur: 900, who: 'src', move: 'dive', amt: 70 }), orbit({ at: 0, dur: 700, glyph: 'drop', n: 8, size: 4, r: 28, where: 'src', mode: 'hold', turns: 1.5 }),
    ...hit(640, 'drop', 14, 4.5, 50, 8), wave({ at: 600, dur: 700, style: 'water', height: 26, length: 80 }), screen({ at: 650, dur: 400, amt: 3 }),
  ]),
  def('water', 'special', 'jato-d-agua', 'Jato d’água', [
    shot({ at: 0, dur: 700, glyph: 'drop', size: 4.5, n: 5, stagger: 0.5, spread: 8, trail: 4, ease: 'in', from: 'src', to: 'tgt' }),
    ...hit(420, 'drop', 10, 4, 34, 5),
  ]),
  def('water', 'special', 'hidro-bomba', 'Hidro-bomba', [
    actor({ at: 0, dur: 300, who: 'src', move: 'squash', amt: 8 }),
    stream({ at: 200, dur: 1100, glyph: 'drop', n: 34, size: 5, from: 'src', to: 'tgt', spread: 22, rate: 2.8, wob: 2 }),
    beam({ at: 300, dur: 900, width: 6 }), ...hit(520, 'bubble', 14, 4, 52, 8), screen({ at: 520, dur: 700, amt: 4 }), knock(520, 14),
  ]),
  def('water', 'special', 'surfar', 'Surfar', [
    wave({ at: 0, dur: 1400, style: 'water', height: 78, length: 150 }),
    actor({ at: 660, dur: 600, who: 'tgt', move: 'shake', amt: 8 }), actor({ at: 700, dur: 600, who: 'src', move: 'shake', amt: 3 }),
    screen({ at: 600, dur: 800, amt: 3 }),
    burst({ at: 700, dur: 700, glyph: 'drop', n: 14, size: 3.5, radius: 50, where: 'tgt', up: true, gravity: 1, flash: false }),
  ]),
  def('water', 'special', 'bolhas', 'Bolhas', [
    shot({ at: 0, dur: 1100, glyph: 'bubble', size: 6, n: 9, stagger: 0.7, arc: 30, spread: 22, spreadStart: 10, face: false, spin: 0.3 }),
    ...hit(780, 'bubble', 12, 4, 40, 3),
  ]),
  def('water', 'special', 'redemoinho-d-agua', 'Redemoinho d’água', [
    orbit({ at: 0, dur: 1300, glyph: 'drop', n: 16, size: 4.2, r: 36, mode: 'out', turns: 2.5, where: 'tgt', flat: 0.5 }),
    ring({ at: 100, dur: 1000, where: 'tgtFeet', n: 3, r1: 36, flat: 0.35, stagger: 0.6 }), actor({ at: 300, dur: 900, who: 'tgt', move: 'wobble', amt: 8 }),
  ]),
  def('water', 'special', 'chuva', 'Chuva', [
    field({ at: 0, dur: 1500, glyph: 'drop', n: 60, size: 2.2, vy: 220, vx: -30 }), tint({ at: 0, dur: 1500, color: 'dark', alpha: 0.2 }),
    rain({ at: 300, dur: 1100, glyph: 'drop', n: 12, size: 3.2, spreadX: 60, fall: 0.3 }), actor({ at: 700, dur: 600, who: 'tgt', move: 'shake', amt: 3 }),
  ]),
  def('water', 'status', 'dança-da-chuva', 'Dança da chuva', [
    field({ at: 0, dur: 1400, glyph: 'drop', n: 50, size: 2.2, vy: 200, vx: -20 }), aura({ at: 100, dur: 1200, where: 'src', style: 'up', glyph: 'drop', n: 8, size: 3.6 }),
    tint({ at: 0, dur: 1400, color: 'mid', alpha: 0.16 }),
  ]),
  def('water', 'status', 'encharcar', 'Encharcar', [
    rain({ at: 0, dur: 800, glyph: 'drop', n: 14, size: 3.6, spreadX: 36, fall: 0.35 }), aura({ at: 300, dur: 1000, where: 'tgt', style: 'down', glyph: 'drop', n: 8, size: 3.4 }),
    tint({ at: 300, dur: 900, color: 'mid', alpha: 0.22 }), actor({ at: 500, dur: 700, who: 'tgt', move: 'squash', amt: 10 }),
  ]),
];

/* ======================================================================== ELÉTRICO */
const electric: FxAnimation[] = [
  def('electric', 'physical', 'soco-trovao', 'Soco trovão', [
    lunge(0, 560, 100), bolt({ at: 200, dur: 360, width: 3, from: 'src', to: 'tgt', branches: 3 }), ...hit(300, 'bolt', 8, 4.5, 34, 6),
    actor({ at: 300, dur: 400, who: 'tgt', move: 'jitter', amt: 5 }), knock(300),
  ]),
  def('electric', 'physical', 'investida-eletrica', 'Investida elétrica', [
    orbit({ at: 0, dur: 600, glyph: 'spark', n: 10, size: 3, r: 24, where: 'src', mode: 'hold', turns: 2 }),
    bolt({ at: 100, dur: 420, width: 2.4, from: 'src', to: 'srcFeet', branches: 2, n: 2, spreadX: 40 }),
    lunge(120, 620, 106), ...hit(400, 'bolt', 10, 4.5, 42, 7), screen({ at: 400, dur: 360, amt: 3 }), knock(400, 12),
  ]),
  def('electric', 'physical', 'presa-eletrica', 'Presa elétrica', [
    lunge(0, 520, 92), slash({ at: 220, dur: 420, style: 'bite', size: 22 }), bolt({ at: 360, dur: 380, width: 3, from: 'tgt', to: 'tgtFeet', branches: 3, spreadX: 20 }),
    ...hit(380, 'spark', 8, 3.5, 30, 5), actor({ at: 380, dur: 500, who: 'tgt', move: 'jitter', amt: 5 }),
  ]),
  def('electric', 'special', 'choque-do-trovao', 'Choque do trovão', [
    tint({ at: 0, dur: 500, color: 'dark', alpha: 0.28 }), bolt({ at: 300, dur: 520, width: 5, from: 'sky', to: 'tgtFeet', branches: 3 }),
    ...hit(380, 'spark', 12, 4, 40, 6), tint({ at: 380, dur: 400, color: 'light', alpha: 0.5 }), actor({ at: 380, dur: 600, who: 'tgt', move: 'jitter', amt: 6 }),
  ]),
  def('electric', 'special', 'raio', 'Raio', [
    orbit({ at: 0, dur: 480, glyph: 'spark', n: 8, size: 3, r: 26, where: 'src', mode: 'in', turns: 1 }),
    beam({ at: 440, dur: 760, width: 6, jitter: 16 }), ...hit(560, 'bolt', 10, 4.5, 42, 6),
    actor({ at: 560, dur: 600, who: 'tgt', move: 'jitter', amt: 5 }), tint({ at: 560, dur: 400, color: 'glow', alpha: 0.28 }),
  ]),
  def('electric', 'special', 'onda-de-choque', 'Onda de choque', [
    shot({ at: 0, dur: 800, glyph: 'ring', size: 6, n: 3, stagger: 0.5, face: false, grow: 1.1, from: 'src', to: 'tgt' }),
    ring({ at: 700, dur: 500, n: 2, r1: 40 }), burst({ at: 700, dur: 500, glyph: 'spark', n: 10, size: 3, radius: 38, where: 'tgt' }),
    actor({ at: 700, dur: 600, who: 'tgt', move: 'jitter', amt: 6 }),
  ]),
  def('electric', 'special', 'tempestade-eletrica', 'Tempestade elétrica', [
    tint({ at: 0, dur: 1500, color: 'dark', alpha: 0.38 }), field({ at: 0, dur: 1500, glyph: 'drop', n: 40, size: 1.8, vy: 240, vx: -40 }),
    bolt({ at: 250, dur: 1100, width: 4, from: 'sky', to: 'tgtFeet', n: 5, spreadX: 90, branches: 2 }),
    tint({ at: 600, dur: 220, color: 'light', alpha: 0.5 }), tint({ at: 1000, dur: 220, color: 'light', alpha: 0.5 }),
    actor({ at: 400, dur: 1000, who: 'tgt', move: 'jitter', amt: 5 }), screen({ at: 500, dur: 800, amt: 2 }),
  ]),
  def('electric', 'special', 'bola-eletrica', 'Bola elétrica', [
    orbit({ at: 0, dur: 500, glyph: 'spark', n: 7, size: 2.8, r: 18, where: 'src', mode: 'in', turns: 1.5 }),
    shot({ at: 480, dur: 640, glyph: 'orb', size: 7, from: 'src', to: 'tgt', trail: 4, arc: 8 }),
    stream({ at: 500, dur: 600, glyph: 'spark', n: 12, size: 2.6, from: 'src', to: 'tgt', spread: 22, rate: 2 }),
    ...hit(1060, 'spark', 12, 4, 44, 6),
  ]),
  def('electric', 'status', 'carga', 'Carga', [
    aura({ at: 0, dur: 1300, where: 'src', style: 'up', glyph: 'arrow', n: 7 }), bolt({ at: 100, dur: 1100, width: 2, from: 'src', to: 'srcFeet', n: 3, spreadX: 36, branches: 1 }),
    orbit({ at: 0, dur: 1300, glyph: 'spark', n: 6, size: 2.6, r: 26, where: 'src', mode: 'hold', turns: 2 }), actor({ at: 0, dur: 1300, who: 'src', move: 'grow', amt: 6 }),
  ]),
  def('electric', 'status', 'onda-trovao', 'Onda trovão', [
    shot({ at: 0, dur: 700, glyph: 'bolt', size: 4.5, n: 4, stagger: 0.6, spread: 14, arc: 10, trail: 2, from: 'src', to: 'tgt' }),
    aura({ at: 650, dur: 1000, where: 'tgt', style: 'pulse', glyph: 'spark', n: 8, size: 3.4 }), bolt({ at: 700, dur: 800, width: 2, from: 'tgt', to: 'tgtFeet', n: 3, spreadX: 30, branches: 1 }),
    actor({ at: 700, dur: 900, who: 'tgt', move: 'jitter', amt: 4 }),
  ]),
];

/* ======================================================================== PLANTA */
const grass: FxAnimation[] = [
  def('grass', 'physical', 'chicote-de-vinha', 'Chicote de vinha', [
    actor({ at: 0, dur: 360, who: 'src', move: 'squash', amt: 6 }), slash({ at: 140, dur: 520, style: 'arc', size: 34 }),
    burst({ at: 300, dur: 560, glyph: 'leaf', n: 10, size: 4, radius: 40, where: 'tgt', gravity: 1, spin: 1.2 }), ...hit(300, 'leaf', 3, 3, 10, 6), knock(300),
  ]),
  def('grass', 'physical', 'investida-de-folhas', 'Investida de folhas', [
    stream({ at: 0, dur: 600, glyph: 'leaf', n: 14, size: 4, from: 'src', to: 'srcFeet', spread: 30, rate: 2, spin: 1 }),
    lunge(40, 600, 100), ...hit(320, 'leaf', 12, 4.5, 42, 6), knock(320, 10),
  ]),
  def('grass', 'physical', 'raizes', 'Raízes', [
    rise({ at: 100, dur: 900, glyph: 'spike', n: 6, size: 5, height: 2.2, spreadX: 56, stagger: 0.5, where: 'tgtFeet' }), actor({ at: 400, dur: 600, who: 'tgt', move: 'shake', amt: 4 }),
    burst({ at: 560, dur: 480, glyph: 'leaf', n: 8, size: 3.4, radius: 34, where: 'tgt', gravity: 1, flash: false }), actor({ at: 500, dur: 400, who: 'tgt', move: 'flash' }),
  ]),
  def('grass', 'special', 'folha-navalha', 'Folha navalha', [
    shot({ at: 0, dur: 700, glyph: 'leaf', size: 4.5, n: 6, stagger: 0.6, spread: 24, arc: 16, spin: 4, trail: 2, face: false }),
    slash({ at: 520, dur: 420, style: 'x', size: 24 }), ...hit(560, 'leaf', 8, 3.4, 34, 4),
  ]),
  def('grass', 'special', 'raio-solar', 'Raio solar', [
    tint({ at: 0, dur: 700, color: 'light', alpha: 0.22 }), orbit({ at: 0, dur: 760, glyph: 'spark', n: 12, size: 3, r: 34, where: 'src', mode: 'in', turns: 1.2 }),
    beam({ at: 720, dur: 700, width: 10 }), ...hit(860, 'leaf', 12, 4, 46, 7), tint({ at: 840, dur: 500, color: 'light', alpha: 0.4 }), screen({ at: 840, dur: 500, amt: 3 }),
  ]),
  def('grass', 'special', 'tempestade-de-folhas', 'Tempestade de folhas', [
    orbit({ at: 0, dur: 1300, glyph: 'leaf', n: 18, size: 4.4, r: 38, mode: 'out', turns: 2.6, where: 'tgt', flat: 0.55, spin: 2 }),
    orbit({ at: 100, dur: 1200, glyph: 'leaf', n: 8, size: 3.6, r: 20, mode: 'hold', turns: -2, where: 'tgt', flat: 0.5, spin: 2 }),
    actor({ at: 300, dur: 900, who: 'tgt', move: 'jitter', amt: 4 }),
  ]),
  def('grass', 'special', 'bomba-de-sementes', 'Bomba de sementes', [
    shot({ at: 0, dur: 700, glyph: 'orb', size: 5, n: 3, stagger: 0.5, arc: 28, spread: 12, spin: 1, trail: 2, from: 'src', to: 'tgt' }),
    ...hit(600, 'leaf', 10, 4, 38, 6), burst({ at: 620, dur: 560, glyph: 'dot', n: 12, size: 1.8, radius: 30, where: 'tgt', gravity: 1, flash: false }),
  ]),
  def('grass', 'special', 'dreno-de-vida', 'Dreno de vida', [
    stream({ at: 0, dur: 1200, glyph: 'leaf', n: 14, size: 3.6, from: 'tgt', to: 'src', spread: 20, rate: 1.6, wob: 4, spin: 1 }),
    actor({ at: 100, dur: 1000, who: 'tgt', move: 'shake', amt: 3 }), aura({ at: 700, dur: 700, where: 'src', style: 'up', glyph: 'spark', n: 6, size: 3, ring: false }),
  ]),
  def('grass', 'special', 'chuva-de-petalas', 'Chuva de pétalas', [
    field({ at: 0, dur: 1500, glyph: 'petal', n: 36, size: 3, vy: 70, vx: 30, spin: 1.5 }),
    shot({ at: 300, dur: 900, glyph: 'petal', size: 4, n: 8, stagger: 0.6, arc: 20, spread: 26, spin: 2, face: false, from: 'src', to: 'tgt' }), ...hit(900, 'petal', 10, 3.6, 36, 4),
  ]),
  def('grass', 'status', 'crescer', 'Crescer', [
    rise({ at: 0, dur: 1100, glyph: 'leaf', n: 5, size: 4.5, height: 1.2, spreadX: 44, where: 'srcFeet' }),
    aura({ at: 100, dur: 1200, where: 'src', style: 'up', glyph: 'arrow', n: 7 }), actor({ at: 100, dur: 1100, who: 'src', move: 'grow', amt: 9 }),
  ]),
  def('grass', 'status', 'esporos', 'Esporos', [
    shot({ at: 0, dur: 600, glyph: 'blob', size: 4, n: 3, stagger: 0.5, arc: 18, spread: 10, from: 'src', to: 'tgt' }),
    burst({ at: 560, dur: 900, glyph: 'dot', n: 24, size: 2, radius: 34, where: 'tgt', gravity: 0.4, flash: false }), aura({ at: 600, dur: 1000, where: 'tgt', style: 'down', glyph: 'note', n: 5, size: 3, ring: false }),
    actor({ at: 700, dur: 800, who: 'tgt', move: 'sink', amt: 6 }),
  ]),
];

/* ======================================================================== GELO */
const ice: FxAnimation[] = [
  def('ice', 'physical', 'soco-de-gelo', 'Soco de gelo', [
    lunge(0, 580, 100), ...hit(250, 'shard', 10, 4.5, 38, 6), ring({ at: 260, dur: 520, n: 2, r1: 44, flat: 0.5 }), actor({ at: 260, dur: 600, who: 'tgt', move: 'freeze' }), knock(260),
  ]),
  def('ice', 'physical', 'estalactite', 'Estalactite', [
    rise({ at: 80, dur: 900, glyph: 'shard', n: 7, size: 5, height: 2.4, spreadX: 52, stagger: 0.5 }), actor({ at: 420, dur: 500, who: 'tgt', move: 'shake', amt: 4 }),
    burst({ at: 520, dur: 500, glyph: 'shard', n: 8, size: 3, radius: 36, where: 'tgt', gravity: 1, flash: false }), actor({ at: 460, dur: 400, who: 'tgt', move: 'flash' }),
  ]),
  def('ice', 'physical', 'cabecada-glacial', 'Cabeçada glacial', [
    stream({ at: 0, dur: 540, glyph: 'snow', n: 12, size: 3.4, from: 'src', to: 'srcFeet', spread: 24, rate: 2 }),
    lunge(40, 580, 104), ...hit(300, 'shard', 12, 4.5, 44, 7), screen({ at: 300, dur: 300, amt: 3 }), knock(300, 12),
  ]),
  def('ice', 'special', 'raio-de-gelo', 'Raio de gelo', [
    orbit({ at: 0, dur: 420, glyph: 'snow', n: 8, size: 3, r: 24, where: 'src', mode: 'in' }), beam({ at: 400, dur: 760, width: 6 }),
    ...hit(540, 'shard', 10, 4, 40, 4), actor({ at: 560, dur: 900, who: 'tgt', move: 'freeze' }), field({ at: 500, dur: 900, glyph: 'snow', n: 18, size: 2.2, vy: 40, vx: 10 }),
  ]),
  def('ice', 'special', 'nevasca', 'Nevasca', [
    field({ at: 0, dur: 1500, glyph: 'snow', n: 70, size: 2.4, vy: 70, vx: -160 }), tint({ at: 0, dur: 1500, color: 'light', alpha: 0.24 }),
    wave({ at: 200, dur: 1100, style: 'wind', height: 34, length: 140 }), actor({ at: 600, dur: 800, who: 'tgt', move: 'shake', amt: 5 }), actor({ at: 700, dur: 700, who: 'tgt', move: 'freeze' }),
  ]),
  def('ice', 'special', 'bola-de-neve', 'Bola de neve', [
    shot({ at: 0, dur: 760, glyph: 'orb', size: 7, from: 'src', to: 'tgt', arc: 26, trail: 3, spin: 1 }), ...hit(700, 'snow', 12, 3.6, 44, 6),
    burst({ at: 720, dur: 600, glyph: 'dot', n: 16, size: 2, radius: 34, where: 'tgt', gravity: 1.2, flash: false }),
  ]),
  def('ice', 'special', 'granizo', 'Granizo', [
    rain({ at: 0, dur: 1200, glyph: 'shard', n: 18, size: 3.6, spreadX: 74, fall: 0.35, drift: 10 }), tint({ at: 0, dur: 1100, color: 'dark', alpha: 0.14 }),
    actor({ at: 500, dur: 700, who: 'tgt', move: 'shake', amt: 4 }),
  ]),
  def('ice', 'special', 'vento-gelado', 'Vento gelado', [
    stream({ at: 0, dur: 1200, glyph: 'snow', n: 28, size: 3, from: 'src', to: 'tgt', spread: 40, rate: 1.8, wob: 6, spin: 1 }),
    wave({ at: 100, dur: 1100, style: 'ice', height: 22, length: 110 }), actor({ at: 600, dur: 700, who: 'tgt', move: 'freeze' }),
  ]),
  def('ice', 'special', 'prisma-congelante', 'Prisma congelante', [
    rise({ at: 0, dur: 1100, glyph: 'shard', n: 9, size: 6, height: 2.6, spreadX: 44, stagger: 0.6, where: 'tgtFeet' }), ring({ at: 100, dur: 900, where: 'tgtFeet', n: 3, r1: 42, flat: 0.35 }),
    tint({ at: 400, dur: 800, color: 'glow', alpha: 0.24 }), actor({ at: 500, dur: 800, who: 'tgt', move: 'freeze' }),
  ]),
  def('ice', 'status', 'neve', 'Neve', [
    field({ at: 0, dur: 1500, glyph: 'snow', n: 50, size: 2.6, vy: 50, vx: -20 }), tint({ at: 0, dur: 1500, color: 'light', alpha: 0.2 }),
    aura({ at: 200, dur: 1100, where: 'src', style: 'up', glyph: 'snow', n: 7, size: 3 }),
  ]),
  def('ice', 'status', 'congelar', 'Congelar', [
    shot({ at: 0, dur: 600, glyph: 'snow', size: 4, n: 4, stagger: 0.5, spread: 14, arc: 14, from: 'src', to: 'tgt' }), ring({ at: 560, dur: 800, where: 'tgt', n: 3, r0: 34, r1: 6, inward: true }),
    aura({ at: 600, dur: 1000, where: 'tgt', style: 'pulse', glyph: 'shard', n: 8, size: 3.4 }), actor({ at: 640, dur: 900, who: 'tgt', move: 'freeze' }),
  ]),
];

/* ======================================================================== LUTADOR */
const fighting: FxAnimation[] = [
  def('fighting', 'physical', 'soco-direto', 'Soco direto', [
    lunge(0, 520, 100), shot({ at: 180, dur: 180, glyph: 'fist', size: 7, from: 'src', to: 'tgt', ease: 'in' }), ...hit(300, 'star', 9, 5, 38, 8), ring({ at: 300, dur: 400, n: 2, r1: 40 }), knock(300, 14),
  ]),
  def('fighting', 'physical', 'chute-giratorio', 'Chute giratório', [
    actor({ at: 0, dur: 620, who: 'src', move: 'spin' }), lunge(100, 600, 98), slash({ at: 300, dur: 460, style: 'arc', size: 30 }), ...hit(380, 'star', 8, 4.5, 36, 7), knock(380, 12),
  ]),
  def('fighting', 'physical', 'combo-de-socos', 'Combo de socos', [
    lunge(0, 760, 94), ...hit(120, 'spark', 4, 3.4, 20, 3), ...hit(260, 'spark', 4, 3.4, 20, 3), ...hit(400, 'spark', 4, 3.4, 20, 3),
    ...hit(540, 'spark', 4, 3.4, 20, 3), ...hit(680, 'star', 10, 5, 40, 8), knock(680, 14),
  ]),
  def('fighting', 'physical', 'golpe-de-karate', 'Golpe de caratê', [
    actor({ at: 0, dur: 420, who: 'src', move: 'hop', amt: 20 }), lunge(300, 480, 96), slash({ at: 520, dur: 400, style: 'cut', size: 28 }), ring({ at: 560, dur: 520, where: 'tgtFeet', n: 2, r1: 40, flat: 0.35 }),
    ...hit(540, 'spark', 8, 4, 30, 6), knock(540),
  ]),
  def('fighting', 'physical', 'voadora', 'Voadora', [
    actor({ at: 0, dur: 900, who: 'src', move: 'dive', amt: 60 }), ...hit(650, 'star', 12, 5.5, 46, 9), screen({ at: 650, dur: 420, amt: 4 }), knock(650, 16),
  ]),
  def('fighting', 'special', 'esfera-de-aura', 'Esfera de aura', [
    orbit({ at: 0, dur: 560, glyph: 'spark', n: 10, size: 3, r: 26, where: 'src', mode: 'in' }), shot({ at: 540, dur: 600, glyph: 'orb', size: 8, from: 'src', to: 'tgt', trail: 5, ease: 'in' }),
    ...hit(1100, 'star', 12, 5, 44, 7), ring({ at: 1110, dur: 500, n: 3, r1: 50 }),
  ]),
  def('fighting', 'special', 'onda-de-forca', 'Onda de força', [
    shot({ at: 0, dur: 800, glyph: 'crescent', size: 7, n: 3, stagger: 0.6, spread: 10, from: 'src', to: 'tgt', face: true }), ...hit(620, 'spark', 8, 3.6, 34, 5),
    wave({ at: 80, dur: 800, style: 'shock', height: 16, length: 70 }),
  ]),
  def('fighting', 'special', 'explosao-de-chi', 'Explosão de chi', [
    aura({ at: 0, dur: 700, where: 'src', style: 'pulse', glyph: 'spark', n: 8, size: 3 }), ring({ at: 600, dur: 800, where: 'src', n: 4, r1: 70, flat: 0.6, w: 3 }),
    burst({ at: 660, dur: 700, glyph: 'star', n: 6, size: 8, radius: 70, where: 'src', ring: true }), screen({ at: 640, dur: 600, amt: 5 }),
    actor({ at: 760, dur: 500, who: 'tgt', move: 'shake', amt: 8 }), actor({ at: 760, dur: 300, who: 'tgt', move: 'flash' }), knock(760, 18),
  ]),
  def('fighting', 'status', 'foco', 'Foco', [
    aura({ at: 0, dur: 1200, where: 'src', style: 'up', glyph: 'arrow', n: 7 }), ring({ at: 100, dur: 1000, where: 'src', n: 3, r0: 36, r1: 6, inward: true }),
    actor({ at: 0, dur: 1200, who: 'src', move: 'grow', amt: 7 }),
  ]),
  def('fighting', 'status', 'dobrar-forca', 'Dobrar força', [
    aura({ at: 0, dur: 1300, where: 'src', style: 'up', glyph: 'fist', n: 6, size: 3.6 }), tint({ at: 100, dur: 1000, color: 'glow', alpha: 0.2 }),
    actor({ at: 100, dur: 1100, who: 'src', move: 'squash', amt: 10 }),
  ]),
];

/* ======================================================================== VENENO */
const poison: FxAnimation[] = [
  def('poison', 'physical', 'ferrao-venenoso', 'Ferrão venenoso', [
    lunge(0, 520, 96), shot({ at: 150, dur: 240, glyph: 'spike', size: 5, from: 'src', to: 'tgt', ease: 'in' }), ...hit(330, 'blob', 8, 3.8, 30, 5),
    burst({ at: 340, dur: 600, glyph: 'bubble', n: 5, size: 3, radius: 24, where: 'tgt', up: true, flash: false }), knock(330),
  ]),
  def('poison', 'physical', 'garra-venenosa', 'Garra venenosa', [
    lunge(0, 520, 86), slash({ at: 200, dur: 520, style: 'claw', size: 26 }), rain({ at: 330, dur: 700, glyph: 'blob', n: 6, size: 3, to: 'tgtFeet', spreadX: 30, fall: 0.5 }),
    ...hit(320, 'blob', 5, 3.2, 22, 4),
  ]),
  def('poison', 'physical', 'cauda-de-veneno', 'Cauda de veneno', [
    actor({ at: 0, dur: 320, who: 'src', move: 'squash', amt: 6 }), slash({ at: 180, dur: 520, style: 'arc', size: 34 }), ...hit(340, 'blob', 10, 4, 38, 6), knock(340, 10),
  ]),
  def('poison', 'special', 'bomba-de-lodo', 'Bomba de lodo', [
    shot({ at: 0, dur: 760, glyph: 'blob', size: 7.5, from: 'src', to: 'tgt', arc: 28, trail: 2, spin: 0.5 }), ...hit(700, 'blob', 12, 5, 44, 6),
    rise({ at: 720, dur: 600, glyph: 'blob', n: 4, size: 5, height: 1, spreadX: 30 }),
  ]),
  def('poison', 'special', 'acido', 'Ácido', [
    stream({ at: 0, dur: 1100, glyph: 'blob', n: 20, size: 4, from: 'src', to: 'tgt', spread: 24, rate: 1.8, wob: 4, arc: 8 }),
    ...hit(520, 'drop', 8, 3.6, 30, 3), actor({ at: 600, dur: 700, who: 'tgt', move: 'squash', amt: 10 }),
  ]),
  def('poison', 'special', 'nevoa-toxica', 'Névoa tóxica', [
    tint({ at: 0, dur: 1500, color: 'mid', alpha: 0.26 }), orbit({ at: 0, dur: 1400, glyph: 'bubble', n: 14, size: 5, r: 40, mode: 'out', turns: 1, where: 'tgt', flat: 0.6 }),
    rise({ at: 200, dur: 1200, glyph: 'bubble', n: 8, size: 4, height: 1.2, spreadX: 70, stagger: 0.7, where: 'tgtFeet' }), actor({ at: 500, dur: 800, who: 'tgt', move: 'sink', amt: 5 }),
  ]),
  def('poison', 'special', 'onda-venenosa', 'Onda venenosa', [
    wave({ at: 0, dur: 1200, style: 'poison', height: 44, length: 130 }), actor({ at: 600, dur: 600, who: 'tgt', move: 'shake', amt: 5 }),
    burst({ at: 700, dur: 600, glyph: 'blob', n: 10, size: 3.6, radius: 40, where: 'tgt', up: true, gravity: 1, flash: false }),
  ]),
  def('poison', 'special', 'agulhas', 'Agulhas', [
    shot({ at: 0, dur: 600, glyph: 'spike', size: 3.4, n: 10, stagger: 0.7, spread: 30, arc: 4, from: 'src', to: 'tgt', spreadStart: 14, ease: 'in' }), ...hit(520, 'spark', 8, 3, 30, 4),
  ]),
  def('poison', 'status', 'toxico', 'Tóxico', [
    shot({ at: 0, dur: 620, glyph: 'blob', size: 4.5, n: 3, stagger: 0.5, arc: 20, spread: 8, from: 'src', to: 'tgt' }),
    aura({ at: 560, dur: 1100, where: 'tgt', style: 'pulse', glyph: 'bubble', n: 9, size: 3.6 }), tint({ at: 600, dur: 900, color: 'mid', alpha: 0.26 }), actor({ at: 700, dur: 900, who: 'tgt', move: 'sink', amt: 5 }),
  ]),
  def('poison', 'status', 'gas', 'Gás venenoso', [
    stream({ at: 0, dur: 1100, glyph: 'bubble', n: 18, size: 4.5, from: 'src', to: 'tgt', spread: 38, rate: 1.4, wob: 8 }), tint({ at: 400, dur: 800, color: 'mid', alpha: 0.22 }),
    actor({ at: 700, dur: 700, who: 'tgt', move: 'squash', amt: 8 }),
  ]),
];

/* ======================================================================== TERRA */
const ground: FxAnimation[] = [
  def('ground', 'physical', 'soco-de-terra', 'Soco de terra', [
    lunge(0, 560, 100), ...hit(250, 'rock', 9, 4.5, 38, 7), ring({ at: 260, dur: 520, where: 'tgtFeet', n: 2, r1: 44, flat: 0.35 }), knock(250, 12),
  ]),
  def('ground', 'physical', 'escavar', 'Escavar', [
    actor({ at: 0, dur: 500, who: 'src', move: 'sink', amt: 40 }), burst({ at: 120, dur: 500, glyph: 'rock', n: 8, size: 3.4, radius: 30, where: 'srcFeet', up: true, gravity: 1.4, flash: false }),
    rise({ at: 700, dur: 500, glyph: 'rock', n: 3, size: 6, height: 1.4, spreadX: 24, where: 'tgtFeet' }), actor({ at: 720, dur: 500, who: 'tgt', move: 'hop', amt: 18 }), ...hit(720, 'rock', 10, 4, 40, 6),
  ]),
  def('ground', 'physical', 'batida-de-osso', 'Batida de osso', [
    shot({ at: 0, dur: 700, glyph: 'bone', size: 6, from: 'src', to: 'tgt', arc: 18, spin: 2, face: false, trail: 2 }), ...hit(640, 'rock', 8, 4, 34, 6), knock(640),
  ]),
  def('ground', 'special', 'terremoto', 'Terremoto', [
    screen({ at: 0, dur: 1500, amt: 6 }), ring({ at: 0, dur: 1300, where: 'srcFeet', n: 4, r1: 110, flat: 0.28, w: 3, stagger: 0.6 }),
    wave({ at: 0, dur: 1200, style: 'shock', height: 14, length: 120 }), rise({ at: 500, dur: 900, glyph: 'rock', n: 6, size: 5, height: 1.2, spreadX: 70, stagger: 0.6 }),
    actor({ at: 500, dur: 900, who: 'tgt', move: 'hop', amt: 14 }), actor({ at: 700, dur: 400, who: 'tgt', move: 'flash' }),
  ]),
  def('ground', 'special', 'tiro-de-lama', 'Tiro de lama', [
    shot({ at: 0, dur: 640, glyph: 'blob', size: 5.4, n: 4, stagger: 0.5, spread: 14, arc: 16, trail: 2, from: 'src', to: 'tgt' }), ...hit(560, 'blob', 10, 4, 34, 5),
    actor({ at: 600, dur: 800, who: 'tgt', move: 'squash', amt: 8 }),
  ]),
  def('ground', 'special', 'tempestade-de-areia', 'Tempestade de areia', [
    field({ at: 0, dur: 1600, glyph: 'dot', n: 90, size: 1.6, vy: 10, vx: 260 }), tint({ at: 0, dur: 1600, color: 'mid', alpha: 0.3 }),
    wave({ at: 100, dur: 1300, style: 'sand', height: 54, length: 150 }), actor({ at: 500, dur: 900, who: 'tgt', move: 'jitter', amt: 4 }),
  ]),
  def('ground', 'special', 'poder-da-terra', 'Poder da terra', [
    ring({ at: 0, dur: 800, where: 'tgtFeet', n: 3, r1: 40, flat: 0.3 }), rise({ at: 250, dur: 900, glyph: 'rock', n: 6, size: 5.5, height: 1.8, spreadX: 46, stagger: 0.5 }),
    actor({ at: 500, dur: 600, who: 'tgt', move: 'hop', amt: 16 }), ...hit(550, 'rock', 10, 4, 38, 6),
  ]),
  def('ground', 'special', 'fissura', 'Fissura', [
    wave({ at: 0, dur: 900, style: 'shock', height: 10, length: 60 }), shot({ at: 0, dur: 800, glyph: 'rock', size: 3.4, n: 10, stagger: 0.9, from: 'srcFeet', to: 'tgtFeet', arc: 10, spread: 8, spreadStart: 6 }),
    rise({ at: 700, dur: 700, glyph: 'spike', n: 4, size: 6, height: 2, spreadX: 28 }), ...hit(720, 'rock', 8, 3.6, 34, 7), screen({ at: 700, dur: 500, amt: 5 }),
  ]),
  def('ground', 'status', 'ataque-areia', 'Ataque areia', [
    burst({ at: 0, dur: 900, glyph: 'dot', n: 30, size: 2, radius: 40, where: 'tgt', gravity: 0.5, flash: false }), tint({ at: 0, dur: 900, color: 'mid', alpha: 0.3 }),
    aura({ at: 100, dur: 900, where: 'tgt', style: 'down', glyph: 'arrow', n: 6 }), actor({ at: 100, dur: 700, who: 'tgt', move: 'shake', amt: 3 }),
  ]),
  def('ground', 'status', 'endurecer-terra', 'Endurecer', [
    aura({ at: 0, dur: 1300, where: 'src', style: 'up', glyph: 'rock', n: 7, size: 3.4 }), ring({ at: 100, dur: 1000, where: 'srcFeet', n: 2, r1: 34, flat: 0.35 }),
    actor({ at: 100, dur: 1000, who: 'src', move: 'squash', amt: 8 }),
  ]),
];

/* ======================================================================== VOADOR */
const flying: FxAnimation[] = [
  def('flying', 'physical', 'bicada', 'Bicada', [
    lunge(0, 480, 98), shot({ at: 170, dur: 180, glyph: 'spike', size: 4.4, from: 'src', to: 'tgt', ease: 'in' }), ...hit(290, 'feather', 7, 4, 30, 5), knock(290),
  ]),
  def('flying', 'physical', 'ataque-de-asa', 'Ataque de asa', [
    lunge(0, 560, 96), slash({ at: 230, dur: 460, style: 'x', size: 26 }), burst({ at: 320, dur: 700, glyph: 'feather', n: 10, size: 4, radius: 44, where: 'tgt', gravity: 0.6, spin: 1, flash: false }),
    ...hit(320, 'spark', 4, 3, 16, 5),
  ]),
  def('flying', 'physical', 'mergulho-aereo', 'Mergulho aéreo', [
    actor({ at: 0, dur: 980, who: 'src', move: 'dive', amt: 80 }), stream({ at: 450, dur: 360, glyph: 'wind', n: 6, size: 4, from: 'src', to: 'tgt', spread: 6 }),
    ...hit(690, 'feather', 12, 4.4, 46, 8), screen({ at: 700, dur: 420, amt: 4 }), knock(700, 14),
  ]),
  def('flying', 'special', 'ar-cortante', 'Ar cortante', [
    shot({ at: 0, dur: 720, glyph: 'crescent', size: 7, n: 3, stagger: 0.6, spread: 18, from: 'src', to: 'tgt', arc: 10 }), slash({ at: 580, dur: 380, style: 'x', size: 24 }), ...hit(600, 'spark', 6, 3, 26, 4),
  ]),
  def('flying', 'special', 'furacao', 'Furacão', [
    orbit({ at: 0, dur: 1300, glyph: 'wind', n: 10, size: 5, r: 36, mode: 'out', turns: 2.4, where: 'tgt', flat: 0.5, spin: 0 }),
    orbit({ at: 100, dur: 1200, glyph: 'feather', n: 8, size: 4, r: 22, mode: 'hold', turns: -2, where: 'tgt', flat: 0.5, spin: 2 }), actor({ at: 300, dur: 900, who: 'tgt', move: 'wobble', amt: 8 }),
    field({ at: 0, dur: 1400, glyph: 'wind', n: 14, size: 3, vy: 0, vx: 260 }),
  ]),
  def('flying', 'special', 'rajada', 'Rajada', [
    stream({ at: 0, dur: 1150, glyph: 'wind', n: 16, size: 5, from: 'src', to: 'tgt', spread: 30, rate: 2.2, wob: 5 }), wave({ at: 100, dur: 1000, style: 'wind', height: 30, length: 100 }),
    actor({ at: 500, dur: 700, who: 'tgt', move: 'shake', amt: 5 }),
  ]),
  def('flying', 'special', 'ciclone', 'Ciclone', [
    rise({ at: 0, dur: 1300, glyph: 'wind', n: 5, size: 7, height: 2.4, spreadX: 20, where: 'tgtFeet', stagger: 0.5 }),
    orbit({ at: 100, dur: 1200, glyph: 'dot', n: 14, size: 1.8, r: 24, mode: 'hold', turns: 3, where: 'tgt', flat: 0.4 }), actor({ at: 300, dur: 900, who: 'tgt', move: 'spin' }),
    actor({ at: 300, dur: 900, who: 'tgt', move: 'hop', amt: 14 }),
  ]),
  def('flying', 'special', 'chuva-de-penas', 'Chuva de penas', [
    shot({ at: 0, dur: 900, glyph: 'feather', size: 4.6, n: 9, stagger: 0.7, arc: 24, spread: 30, spreadStart: 12, spin: 1.5, face: false, trail: 2, from: 'src', to: 'tgt' }), ...hit(700, 'feather', 8, 3.6, 36, 4),
  ]),
  def('flying', 'status', 'dança-do-vento', 'Dança do vento', [
    aura({ at: 0, dur: 1300, where: 'src', style: 'up', glyph: 'feather', n: 8, size: 4 }), orbit({ at: 0, dur: 1300, glyph: 'wind', n: 5, size: 4, r: 28, where: 'src', mode: 'hold', turns: 2 }),
    actor({ at: 0, dur: 1300, who: 'src', move: 'hop', amt: 8 }),
  ]),
  def('flying', 'status', 'rajada-fraca', 'Vento contrário', [
    stream({ at: 0, dur: 900, glyph: 'wind', n: 10, size: 4, from: 'src', to: 'tgt', spread: 20, rate: 1.8 }), aura({ at: 400, dur: 900, where: 'tgt', style: 'down', glyph: 'arrow', n: 6 }),
    actor({ at: 400, dur: 800, who: 'tgt', move: 'shake', amt: 4 }),
  ]),
];

/* ======================================================================== PSÍQUICO */
const psychic: FxAnimation[] = [
  def('psychic', 'physical', 'cabecada-zen', 'Cabeçada zen', [
    ring({ at: 0, dur: 500, where: 'src', n: 2, r0: 26, r1: 6, inward: true }), lunge(280, 520, 98), ...hit(520, 'spark', 8, 4, 38, 6), ring({ at: 540, dur: 520, n: 2, r1: 42 }), knock(520),
  ]),
  def('psychic', 'physical', 'golpe-psiquico', 'Golpe psíquico', [
    lunge(0, 520, 92), slash({ at: 200, dur: 440, style: 'arc', size: 30 }), ring({ at: 300, dur: 520, n: 3, r1: 46 }), ...hit(320, 'star', 7, 4, 30, 5),
  ]),
  def('psychic', 'physical', 'investida-mental', 'Investida mental', [
    actor({ at: 0, dur: 600, who: 'src', move: 'fade' }), lunge(100, 560, 100), stream({ at: 100, dur: 520, glyph: 'spark', n: 10, size: 3, from: 'src', to: 'srcFeet', spread: 20, rate: 2 }),
    ...hit(380, 'star', 10, 4.4, 40, 7), knock(380, 12),
  ]),
  def('psychic', 'special', 'psiquico', 'Psíquico', [
    orbit({ at: 0, dur: 500, glyph: 'spark', n: 8, size: 3, r: 28, where: 'tgt', mode: 'in', turns: 1 }), ring({ at: 300, dur: 1100, where: 'tgt', n: 4, r0: 8, r1: 46, flat: 0.9, w: 2.6, stagger: 0.7 }),
    shot({ at: 450, dur: 600, glyph: 'eye', size: 5, from: 'tgt', to: 'tgt', spread: 0, grow: 1.6 }), tint({ at: 400, dur: 1000, color: 'mid', alpha: 0.25 }),
    actor({ at: 500, dur: 900, who: 'tgt', move: 'jitter', amt: 5 }),
  ]),
  def('psychic', 'special', 'confusao', 'Confusão', [
    orbit({ at: 0, dur: 1300, glyph: 'star', n: 8, size: 3.6, r: 30, mode: 'hold', turns: 3, where: 'tgt', flat: 0.4, dy: -22 }),
    ring({ at: 100, dur: 1100, where: 'tgt', n: 3, r0: 6, r1: 38, flat: 0.8, stagger: 0.8 }), actor({ at: 200, dur: 1100, who: 'tgt', move: 'wobble', amt: 10 }),
  ]),
  def('psychic', 'special', 'psiraio', 'Psicorraio', [
    beam({ at: 0, dur: 1000, width: 7, jitter: 8 }), ring({ at: 0, dur: 1000, where: 'src', n: 3, r1: 28 }), ...hit(300, 'spark', 10, 4, 40, 6), ring({ at: 320, dur: 800, n: 3, r1: 48, stagger: 0.7 }),
    tint({ at: 300, dur: 700, color: 'glow', alpha: 0.24 }), actor({ at: 400, dur: 700, who: 'tgt', move: 'jitter', amt: 5 }),
  ]),
  def('psychic', 'special', 'onda-mental', 'Onda mental', [
    shot({ at: 0, dur: 900, glyph: 'ring', size: 6, n: 5, stagger: 0.8, face: false, grow: 1.6, from: 'src', to: 'tgt' }), ring({ at: 780, dur: 700, n: 3, r1: 44 }),
    actor({ at: 780, dur: 700, who: 'tgt', move: 'squash', amt: 12 }), tint({ at: 700, dur: 700, color: 'glow', alpha: 0.2 }),
  ]),
  def('psychic', 'special', 'chuva-de-estrelas-psi', 'Chuva cósmica', [
    tint({ at: 0, dur: 1500, color: 'dark', alpha: 0.28 }), rain({ at: 100, dur: 1200, glyph: 'star', n: 16, size: 4, spreadX: 70, fall: 0.35, drift: 30, spin: 1 }),
    actor({ at: 600, dur: 700, who: 'tgt', move: 'shake', amt: 5 }),
  ]),
  def('psychic', 'status', 'meditacao', 'Meditação', [
    aura({ at: 0, dur: 1400, where: 'src', style: 'up', glyph: 'arrow', n: 7 }), ring({ at: 0, dur: 1300, where: 'src', n: 4, r0: 30, r1: 6, inward: true, flat: 0.8, stagger: 0.7 }),
    actor({ at: 0, dur: 1300, who: 'src', move: 'hop', amt: 10 }),
  ]),
  def('psychic', 'status', 'hipnose', 'Hipnose', [
    orbit({ at: 0, dur: 1300, glyph: 'eye', n: 4, size: 3.4, r: 30, where: 'tgt', mode: 'hold', turns: 1, flat: 0.5, dy: -18 }), ring({ at: 100, dur: 1100, where: 'tgt', n: 4, r0: 4, r1: 34, flat: 0.9, stagger: 0.8 }),
    aura({ at: 500, dur: 900, where: 'tgt', style: 'up', glyph: 'note', n: 4, size: 3.4, ring: false }), actor({ at: 600, dur: 800, who: 'tgt', move: 'sink', amt: 6 }),
  ]),
];

/* ======================================================================== INSETO */
const bug: FxAnimation[] = [
  def('bug', 'physical', 'ferrao-duplo', 'Ferrão duplo', [
    lunge(0, 420, 96), shot({ at: 130, dur: 160, glyph: 'spike', size: 4, from: 'src', to: 'tgt', ease: 'in' }), ...hit(260, 'spark', 5, 3.4, 22, 4),
    lunge(380, 420, 96), shot({ at: 510, dur: 160, glyph: 'spike', size: 4, from: 'src', to: 'tgt', ease: 'in' }), ...hit(640, 'blob', 8, 3.8, 30, 6), knock(640),
  ]),
  def('bug', 'physical', 'sugar-vida', 'Sugar vida', [
    lunge(0, 480, 90), slash({ at: 180, dur: 420, style: 'bite', size: 22 }), stream({ at: 440, dur: 900, glyph: 'orb', n: 8, size: 3.2, from: 'tgt', to: 'src', spread: 12, rate: 1.6, wob: 3 }),
    ...hit(300, 'spark', 5, 3, 20, 4), aura({ at: 900, dur: 600, where: 'src', style: 'up', glyph: 'spark', n: 5, size: 2.8, ring: false }),
  ]),
  def('bug', 'physical', 'investida-de-inseto', 'Investida de inseto', [
    stream({ at: 0, dur: 520, glyph: 'dot', n: 12, size: 1.8, from: 'src', to: 'srcFeet', spread: 20, rate: 2 }), lunge(40, 560, 100), ...hit(300, 'spark', 8, 3.8, 34, 6), knock(300, 10),
  ]),
  def('bug', 'special', 'zumbido', 'Zumbido', [
    shot({ at: 0, dur: 900, glyph: 'ring', size: 5, n: 4, stagger: 0.8, face: false, grow: 1.4, from: 'src', to: 'tgt' }), shot({ at: 100, dur: 900, glyph: 'note', size: 3.4, n: 5, stagger: 0.8, arc: 10, spread: 14, face: false, from: 'src', to: 'tgt' }),
    ring({ at: 780, dur: 520, n: 2, r1: 40 }), actor({ at: 800, dur: 600, who: 'tgt', move: 'shake', amt: 4 }), screen({ at: 800, dur: 500, amt: 2 }),
  ]),
  def('bug', 'special', 'enxame', 'Enxame', [
    orbit({ at: 0, dur: 1400, glyph: 'dot', n: 26, size: 2.2, r: 34, mode: 'out', turns: 3.2, where: 'tgt', flat: 0.8 }), orbit({ at: 200, dur: 1200, glyph: 'dot', n: 14, size: 1.8, r: 20, mode: 'hold', turns: -3, where: 'tgt', flat: 0.7 }),
    actor({ at: 300, dur: 1000, who: 'tgt', move: 'jitter', amt: 5 }),
  ]),
  def('bug', 'special', 'teia', 'Teia', [
    shot({ at: 0, dur: 700, glyph: 'web', size: 6, from: 'src', to: 'tgt', arc: 14, spin: 1.2, grow: 1.4, face: false }), burst({ at: 660, dur: 900, glyph: 'web', n: 3, size: 9, radius: 12, where: 'tgt', flash: false }),
    actor({ at: 680, dur: 800, who: 'tgt', move: 'squash', amt: 12 }), tint({ at: 650, dur: 800, color: 'light', alpha: 0.16 }),
  ]),
  def('bug', 'special', 'sinal-de-inseto', 'Sinal de inseto', [
    shot({ at: 0, dur: 700, glyph: 'orb', size: 4.4, n: 6, stagger: 0.7, arc: 20, spread: 26, spreadStart: 14, trail: 2, from: 'src', to: 'tgt' }), ...hit(520, 'spark', 8, 3.4, 34, 4),
  ]),
  def('bug', 'special', 'nuvem-de-po', 'Nuvem de pó', [
    stream({ at: 0, dur: 1100, glyph: 'dot', n: 30, size: 2, from: 'src', to: 'tgt', spread: 40, rate: 1.5, wob: 7 }), tint({ at: 300, dur: 900, color: 'mid', alpha: 0.2 }), actor({ at: 700, dur: 700, who: 'tgt', move: 'wobble', amt: 6 }),
  ]),
  def('bug', 'status', 'teia-pegajosa', 'Teia pegajosa', [
    burst({ at: 0, dur: 900, glyph: 'web', n: 4, size: 8, radius: 22, where: 'tgt', flash: false }), aura({ at: 200, dur: 1000, where: 'tgt', style: 'down', glyph: 'arrow', n: 6 }),
    actor({ at: 200, dur: 900, who: 'tgt', move: 'squash', amt: 10 }),
  ]),
  def('bug', 'status', 'danca-da-borboleta', 'Dança da borboleta', [
    aura({ at: 0, dur: 1400, where: 'src', style: 'up', glyph: 'spark', n: 9, size: 3 }), orbit({ at: 0, dur: 1400, glyph: 'petal', n: 6, size: 3.4, r: 30, where: 'src', mode: 'hold', turns: 2, spin: 1 }),
    actor({ at: 0, dur: 1400, who: 'src', move: 'hop', amt: 8 }),
  ]),
];

/* ======================================================================== PEDRA */
const rock: FxAnimation[] = [
  def('rock', 'physical', 'cabecada-de-pedra', 'Cabeçada de pedra', [
    lunge(0, 560, 100), ...hit(250, 'rock', 10, 5, 42, 8), screen({ at: 250, dur: 340, amt: 3 }), knock(250, 14),
  ]),
  def('rock', 'physical', 'pedrada', 'Pedrada', [
    shot({ at: 0, dur: 700, glyph: 'rock', size: 7.5, from: 'src', to: 'tgt', arc: 22, spin: 2, face: false }), ...hit(650, 'rock', 10, 4.4, 40, 7), knock(650, 10),
  ]),
  def('rock', 'physical', 'lamina-de-pedra', 'Lâmina de pedra', [
    rise({ at: 0, dur: 900, glyph: 'spike', n: 7, size: 6, height: 2.2, spreadX: 50, stagger: 0.55, where: 'tgtFeet' }), actor({ at: 400, dur: 500, who: 'tgt', move: 'hop', amt: 12 }), ...hit(450, 'rock', 8, 3.6, 36, 6),
  ]),
  def('rock', 'physical', 'desabamento', 'Desabamento', [
    actor({ at: 0, dur: 700, who: 'src', move: 'hop', amt: 30 }), rain({ at: 400, dur: 900, glyph: 'rock', n: 6, size: 8, spreadX: 36, fall: 0.38 }), ...hit(780, 'rock', 12, 4.6, 46, 9), screen({ at: 780, dur: 440, amt: 4 }),
  ]),
  def('rock', 'special', 'deslizamento-de-pedras', 'Deslizamento de pedras', [
    rain({ at: 0, dur: 1300, glyph: 'rock', n: 16, size: 6, spreadX: 74, fall: 0.35, drift: 20, spin: 1 }), screen({ at: 500, dur: 800, amt: 3 }), actor({ at: 600, dur: 800, who: 'tgt', move: 'shake', amt: 6 }),
  ]),
  def('rock', 'special', 'rocha-afiada', 'Rocha afiada', [
    ring({ at: 0, dur: 700, where: 'tgtFeet', n: 2, r1: 36, flat: 0.3 }), rise({ at: 200, dur: 1000, glyph: 'shard', n: 8, size: 6, height: 2.6, spreadX: 46, stagger: 0.5, where: 'tgtFeet' }),
    actor({ at: 500, dur: 700, who: 'tgt', move: 'hop', amt: 18 }), ...hit(540, 'rock', 10, 4, 40, 7), screen({ at: 540, dur: 600, amt: 4 }),
  ]),
  def('rock', 'special', 'joia-de-poder', 'Joia de poder', [
    orbit({ at: 0, dur: 600, glyph: 'shard', n: 6, size: 3.6, r: 26, where: 'src', mode: 'hold', turns: 1.2 }), shot({ at: 520, dur: 600, glyph: 'shard', size: 4.4, n: 6, stagger: 0.6, spread: 20, spreadStart: 14, spin: 2, trail: 2, from: 'src', to: 'tgt' }),
    ...hit(1000, 'shard', 12, 4, 42, 6), tint({ at: 1000, dur: 400, color: 'light', alpha: 0.3 }),
  ]),
  def('rock', 'special', 'tempestade-de-pedras', 'Tempestade de pedras', [
    field({ at: 0, dur: 1600, glyph: 'rock', n: 36, size: 3, vy: 80, vx: -240, spin: 2 }), tint({ at: 0, dur: 1600, color: 'dark', alpha: 0.2 }), actor({ at: 400, dur: 1000, who: 'tgt', move: 'jitter', amt: 5 }),
    burst({ at: 700, dur: 500, glyph: 'rock', n: 8, size: 3.4, radius: 36, where: 'tgt', gravity: 1, flash: false }),
  ]),
  def('rock', 'status', 'afiar-pedra', 'Afiar', [
    aura({ at: 0, dur: 1300, where: 'src', style: 'up', glyph: 'rock', n: 7, size: 3.4 }), orbit({ at: 100, dur: 1100, glyph: 'rock', n: 5, size: 3.6, r: 26, where: 'src', mode: 'hold', turns: 1.5, spin: 1 }),
    actor({ at: 100, dur: 1100, who: 'src', move: 'squash', amt: 8 }),
  ]),
  def('rock', 'status', 'rolar-e-poeira', 'Nuvem de poeira', [
    burst({ at: 0, dur: 1000, glyph: 'dot', n: 28, size: 2.6, radius: 44, where: 'tgtFeet', up: true, gravity: 0.3, flash: false }), tint({ at: 0, dur: 1000, color: 'mid', alpha: 0.24 }),
    aura({ at: 200, dur: 900, where: 'tgt', style: 'down', glyph: 'arrow', n: 6 }),
  ]),
];

/* ======================================================================== FANTASMA */
const ghost: FxAnimation[] = [
  def('ghost', 'physical', 'lambida', 'Lambida', [
    lunge(0, 520, 92), slash({ at: 200, dur: 440, style: 'cut', size: 26 }), burst({ at: 300, dur: 700, glyph: 'wisp', n: 6, size: 4, radius: 34, where: 'tgt', up: true, gravity: -0.8, flash: false }),
    ...hit(300, 'spark', 3, 3, 14, 4),
  ]),
  def('ghost', 'physical', 'garra-sombria', 'Garra sombria', [
    actor({ at: 0, dur: 420, who: 'src', move: 'fade' }), lunge(100, 440, 94), slash({ at: 260, dur: 520, style: 'claw', size: 26 }), ...hit(330, 'wisp', 6, 4, 28, 5), knock(330),
  ]),
  def('ghost', 'physical', 'ataque-surpresa', 'Ataque surpresa', [
    actor({ at: 0, dur: 700, who: 'src', move: 'sink', amt: 0 }), actor({ at: 360, dur: 560, who: 'src', move: 'lunge', amt: 104 }), tint({ at: 100, dur: 600, color: 'dark', alpha: 0.3 }),
    ...hit(620, 'wisp', 8, 4.4, 36, 7), knock(620, 12),
  ]),
  def('ghost', 'special', 'bola-sombria', 'Bola sombria', [
    orbit({ at: 0, dur: 520, glyph: 'wisp', n: 6, size: 3, r: 20, where: 'src', mode: 'in', turns: 1 }), shot({ at: 480, dur: 700, glyph: 'orb', size: 8.5, from: 'src', to: 'tgt', arc: 14, trail: 5, spin: 0 }),
    ...hit(1100, 'wisp', 10, 4.6, 42, 6), tint({ at: 1100, dur: 500, color: 'dark', alpha: 0.3 }),
  ]),
  def('ghost', 'special', 'fogo-fatuo-sombrio', 'Chamas fantasmas', [
    shot({ at: 0, dur: 800, glyph: 'wisp', size: 5, n: 5, stagger: 0.6, arc: 22, spread: 20, trail: 3, from: 'src', to: 'tgt' }), orbit({ at: 700, dur: 900, glyph: 'wisp', n: 7, size: 4, r: 28, mode: 'in', turns: 1.2, where: 'tgt' }),
    ...hit(1350, 'wisp', 8, 4, 36, 5),
  ]),
  def('ghost', 'special', 'maldicao', 'Maldição', [
    tint({ at: 0, dur: 1400, color: 'dark', alpha: 0.38 }), rise({ at: 100, dur: 1100, glyph: 'wisp', n: 5, size: 5, height: 1.4, spreadX: 40, where: 'tgtFeet' }),
    orbit({ at: 200, dur: 1100, glyph: 'eye', n: 3, size: 3.8, r: 26, where: 'tgt', mode: 'hold', turns: 1, flat: 0.5, dy: -10 }), actor({ at: 500, dur: 800, who: 'tgt', move: 'sink', amt: 6 }),
    actor({ at: 500, dur: 800, who: 'tgt', move: 'blink' }),
  ]),
  def('ghost', 'special', 'pesadelo', 'Pesadelo', [
    tint({ at: 0, dur: 1500, color: 'dark', alpha: 0.42 }), field({ at: 0, dur: 1500, glyph: 'eye', n: 10, size: 4, vy: 6, vx: 8 }), ring({ at: 200, dur: 1200, where: 'tgt', n: 3, r0: 4, r1: 40, flat: 0.9, stagger: 0.7 }),
    actor({ at: 400, dur: 1000, who: 'tgt', move: 'jitter', amt: 5 }),
  ]),
  def('ghost', 'special', 'grito-fantasma', 'Grito fantasma', [
    shot({ at: 0, dur: 900, glyph: 'ring', size: 7, n: 4, stagger: 0.8, face: false, grow: 1.5, from: 'src', to: 'tgt' }), wave({ at: 100, dur: 900, style: 'dark', height: 26, length: 80 }),
    ring({ at: 780, dur: 600, n: 3, r1: 44 }), actor({ at: 780, dur: 700, who: 'tgt', move: 'shake', amt: 6 }),
  ]),
  def('ghost', 'status', 'assombrar', 'Assombrar', [
    orbit({ at: 0, dur: 1300, glyph: 'wisp', n: 6, size: 4, r: 30, where: 'tgt', mode: 'hold', turns: 1.5, flat: 0.5 }), aura({ at: 100, dur: 1100, where: 'tgt', style: 'down', glyph: 'arrow', n: 6 }),
    tint({ at: 100, dur: 1100, color: 'dark', alpha: 0.32 }), actor({ at: 300, dur: 900, who: 'tgt', move: 'shake', amt: 3 }),
  ]),
  def('ghost', 'status', 'invisibilidade', 'Sumiço', [
    actor({ at: 0, dur: 1300, who: 'src', move: 'fade' }), aura({ at: 0, dur: 1200, where: 'src', style: 'up', glyph: 'wisp', n: 7, size: 3.6 }), tint({ at: 100, dur: 1000, color: 'dark', alpha: 0.22 }),
  ]),
];

/* ======================================================================== DRAGÃO */
const dragon: FxAnimation[] = [
  def('dragon', 'physical', 'garra-de-dragao', 'Garra de dragão', [
    lunge(0, 520, 90), slash({ at: 200, dur: 520, style: 'claw', size: 28 }), burst({ at: 300, dur: 560, glyph: 'spike', n: 8, size: 3.4, radius: 38, where: 'tgt', flash: false }), ...hit(320, 'spark', 4, 3, 16, 6), knock(320),
  ]),
  def('dragon', 'physical', 'cauda-de-dragao', 'Cauda de dragão', [
    actor({ at: 0, dur: 320, who: 'src', move: 'squash', amt: 6 }), slash({ at: 180, dur: 500, style: 'arc', size: 38 }), ring({ at: 320, dur: 520, where: 'tgtFeet', n: 2, r1: 46, flat: 0.35 }),
    ...hit(330, 'star', 9, 4.4, 40, 8), screen({ at: 330, dur: 300, amt: 3 }), knock(330, 14),
  ]),
  def('dragon', 'physical', 'investida-draconica', 'Investida dracônica', [
    stream({ at: 0, dur: 600, glyph: 'flame', n: 14, size: 5, from: 'src', to: 'srcFeet', spread: 28, rate: 2.2 }), lunge(60, 640, 108), ...hit(340, 'star', 12, 5, 48, 9),
    ring({ at: 350, dur: 560, n: 3, r1: 54 }), screen({ at: 350, dur: 400, amt: 4 }), knock(350, 16),
  ]),
  def('dragon', 'special', 'sopro-do-dragao', 'Sopro do dragão', [
    stream({ at: 0, dur: 1250, glyph: 'flame', n: 32, size: 6.4, from: 'src', to: 'tgt', spread: 36, rate: 2.2, wob: 4, grow: 0.5 }), tint({ at: 300, dur: 900, color: 'glow', alpha: 0.22 }),
    actor({ at: 500, dur: 800, who: 'tgt', move: 'jitter', amt: 3 }),
  ]),
  def('dragon', 'special', 'pulso-do-dragao', 'Pulso do dragão', [
    shot({ at: 0, dur: 800, glyph: 'ring', size: 8, n: 3, stagger: 0.6, face: false, grow: 1.2, from: 'src', to: 'tgt' }), beam({ at: 500, dur: 500, width: 8 }), ...hit(700, 'spark', 10, 4, 44, 7),
    ring({ at: 720, dur: 700, n: 3, r1: 52 }), screen({ at: 700, dur: 500, amt: 3 }),
  ]),
  def('dragon', 'special', 'meteoro-draconico', 'Meteoro dracônico', [
    tint({ at: 0, dur: 1500, color: 'dark', alpha: 0.28 }), rain({ at: 100, dur: 1300, glyph: 'flame', n: 6, size: 9, spreadX: 60, fall: 0.34, drift: 60 }),
    burst({ at: 700, dur: 600, glyph: 'flame', n: 8, size: 5, radius: 44, where: 'tgt', gravity: 0.5, ring: true }), screen({ at: 700, dur: 700, amt: 4 }), actor({ at: 700, dur: 700, who: 'tgt', move: 'shake', amt: 7 }),
  ]),
  def('dragon', 'special', 'furia-do-dragao', 'Fúria do dragão', [
    orbit({ at: 0, dur: 600, glyph: 'spark', n: 12, size: 3.2, r: 32, where: 'src', mode: 'in', turns: 1.5 }), shot({ at: 560, dur: 640, glyph: 'orb', size: 9, from: 'src', to: 'tgt', trail: 6, ease: 'in' }),
    burst({ at: 1180, dur: 760, glyph: 'star', n: 6, size: 9, radius: 58, where: 'tgt', ring: true }), tint({ at: 1180, dur: 600, color: 'glow', alpha: 0.4 }), screen({ at: 1180, dur: 600, amt: 6 }),
    actor({ at: 1180, dur: 600, who: 'tgt', move: 'shake', amt: 9 }),
  ]),
  def('dragon', 'special', 'tempestade-draconica', 'Tempestade dracônica', [
    orbit({ at: 0, dur: 1400, glyph: 'flame', n: 14, size: 5, r: 40, mode: 'out', turns: 2.6, where: 'tgt', flat: 0.55 }), orbit({ at: 100, dur: 1300, glyph: 'spark', n: 12, size: 3, r: 24, mode: 'hold', turns: -3, where: 'tgt', flat: 0.5 }),
    tint({ at: 100, dur: 1200, color: 'glow', alpha: 0.24 }), actor({ at: 300, dur: 1000, who: 'tgt', move: 'wobble', amt: 8 }), screen({ at: 400, dur: 900, amt: 3 }),
  ]),
  def('dragon', 'status', 'danca-do-dragao', 'Dança do dragão', [
    orbit({ at: 0, dur: 1400, glyph: 'flame', n: 8, size: 4.4, r: 32, where: 'src', mode: 'hold', turns: 2.4, flat: 0.5 }), aura({ at: 0, dur: 1400, where: 'src', style: 'up', glyph: 'arrow', n: 7 }),
    actor({ at: 0, dur: 1400, who: 'src', move: 'hop', amt: 10 }),
  ]),
  def('dragon', 'status', 'rugido', 'Rugido', [
    ring({ at: 0, dur: 1200, where: 'src', n: 4, r1: 80, flat: 0.6, w: 3, stagger: 0.6 }), screen({ at: 100, dur: 1000, amt: 4 }), aura({ at: 500, dur: 900, where: 'tgt', style: 'down', glyph: 'arrow', n: 6 }),
    actor({ at: 500, dur: 800, who: 'tgt', move: 'squash', amt: 12 }), tint({ at: 400, dur: 800, color: 'dark', alpha: 0.24 }),
  ]),
];

/* ======================================================================== SOMBRIO */
const dark: FxAnimation[] = [
  def('dark', 'physical', 'mordida', 'Mordida', [
    lunge(0, 500, 92), slash({ at: 200, dur: 420, style: 'bite', size: 24 }), ...hit(360, 'spark', 7, 3.6, 30, 6), knock(360),
  ]),
  def('dark', 'physical', 'golpe-baixo', 'Golpe baixo', [
    actor({ at: 0, dur: 420, who: 'src', move: 'fade' }), lunge(100, 460, 96), slash({ at: 260, dur: 420, style: 'x', size: 26 }), ...hit(330, 'star', 7, 4, 32, 6), knock(330, 10),
  ]),
  def('dark', 'physical', 'perseguicao', 'Perseguição', [
    shot({ at: 0, dur: 520, glyph: 'orb', size: 5.5, n: 5, stagger: 0.6, from: 'src', to: 'tgt', ease: 'in', spread: 8, trail: 3 }), lunge(100, 500, 100), ...hit(380, 'spark', 8, 3.8, 34, 6), knock(380),
  ]),
  def('dark', 'physical', 'corte-noturno', 'Corte noturno', [
    lunge(0, 480, 90), slash({ at: 180, dur: 540, style: 'arc', size: 36 }), tint({ at: 200, dur: 500, color: 'dark', alpha: 0.28 }), ...hit(320, 'star', 8, 4, 34, 7), knock(320, 12),
  ]),
  def('dark', 'special', 'pulso-negro', 'Pulso negro', [
    ring({ at: 0, dur: 800, where: 'src', n: 3, r1: 44, flat: 0.6 }), shot({ at: 300, dur: 800, glyph: 'ring', size: 7, n: 3, stagger: 0.6, face: false, grow: 1.4, from: 'src', to: 'tgt' }),
    ...hit(1000, 'star', 8, 4, 36, 6), tint({ at: 900, dur: 600, color: 'dark', alpha: 0.4 }),
  ]),
  def('dark', 'special', 'rajada-sombria', 'Rajada sombria', [
    tint({ at: 0, dur: 1200, color: 'dark', alpha: 0.36 }), beam({ at: 100, dur: 900, width: 8, jitter: 10 }), ...hit(350, 'orb', 8, 4, 38, 6), actor({ at: 400, dur: 600, who: 'tgt', move: 'jitter', amt: 4 }),
  ]),
  def('dark', 'special', 'maldade', 'Maldade', [
    tint({ at: 0, dur: 1400, color: 'dark', alpha: 0.4 }), rain({ at: 100, dur: 1100, glyph: 'orb', n: 14, size: 4.4, spreadX: 60, fall: 0.35, drift: 20 }), actor({ at: 600, dur: 700, who: 'tgt', move: 'shake', amt: 5 }),
  ]),
  def('dark', 'special', 'vazio', 'Vazio', [
    orbit({ at: 0, dur: 1100, glyph: 'orb', n: 14, size: 3.6, r: 40, mode: 'in', turns: 2, where: 'tgt', flat: 0.7 }), tint({ at: 100, dur: 1100, color: 'dark', alpha: 0.5 }),
    actor({ at: 500, dur: 700, who: 'tgt', move: 'squash', amt: 14 }), burst({ at: 1000, dur: 500, glyph: 'star', n: 6, size: 6, radius: 40, where: 'tgt', ring: true }),
  ]),
  def('dark', 'status', 'truque-sujo', 'Truque sujo', [
    aura({ at: 0, dur: 1100, where: 'tgt', style: 'down', glyph: 'arrow', n: 7 }), tint({ at: 0, dur: 1000, color: 'dark', alpha: 0.34 }), actor({ at: 200, dur: 800, who: 'tgt', move: 'squash', amt: 10 }),
  ]),
  def('dark', 'status', 'ameaca', 'Ameaça', [
    rise({ at: 0, dur: 1200, glyph: 'wisp', n: 6, size: 5, height: 1.4, spreadX: 50, where: 'srcFeet' }), aura({ at: 100, dur: 1200, where: 'src', style: 'up', glyph: 'arrow', n: 6 }),
    tint({ at: 100, dur: 1100, color: 'dark', alpha: 0.3 }), actor({ at: 100, dur: 1000, who: 'src', move: 'grow', amt: 8 }),
  ]),
];

/* ======================================================================== AÇO */
const steel: FxAnimation[] = [
  def('steel', 'physical', 'cabeca-de-ferro', 'Cabeça de ferro', [
    lunge(0, 560, 100), ...hit(250, 'spark', 10, 4, 40, 8), ring({ at: 260, dur: 480, n: 2, r1: 42 }), screen({ at: 250, dur: 320, amt: 3 }), knock(250, 14),
  ]),
  def('steel', 'physical', 'garra-metalica', 'Garra metálica', [
    lunge(0, 520, 88), slash({ at: 200, dur: 480, style: 'claw', size: 26 }), burst({ at: 320, dur: 500, glyph: 'spark', n: 10, size: 3, radius: 36, where: 'tgt', flash: false }), ...hit(320, 'spark', 3, 3, 14, 5),
  ]),
  def('steel', 'physical', 'soco-de-aco', 'Soco de aço', [
    lunge(0, 520, 100), shot({ at: 170, dur: 180, glyph: 'fist', size: 6.4, from: 'src', to: 'tgt', ease: 'in' }), ...hit(300, 'gear', 6, 3.6, 34, 8), knock(300, 14),
  ]),
  def('steel', 'physical', 'cauda-de-ferro', 'Cauda de ferro', [
    actor({ at: 0, dur: 320, who: 'src', move: 'squash', amt: 6 }), slash({ at: 160, dur: 480, style: 'arc', size: 36 }), ...hit(320, 'spark', 10, 3.8, 38, 8), ring({ at: 330, dur: 480, n: 2, r1: 44 }), knock(320, 12),
  ]),
  def('steel', 'special', 'canhao-de-luz', 'Canhão de luz', [
    orbit({ at: 0, dur: 700, glyph: 'spark', n: 12, size: 3.2, r: 34, where: 'src', mode: 'in', turns: 1.2 }), tint({ at: 400, dur: 500, color: 'light', alpha: 0.28 }),
    beam({ at: 680, dur: 700, width: 12 }), ...hit(820, 'star', 12, 5, 48, 8), tint({ at: 800, dur: 500, color: 'light', alpha: 0.45 }), screen({ at: 800, dur: 500, amt: 4 }),
  ]),
  def('steel', 'special', 'bala-de-aco', 'Bala de aço', [
    shot({ at: 0, dur: 520, glyph: 'orb', size: 5.4, from: 'src', to: 'tgt', ease: 'in', trail: 5 }), ...hit(480, 'spark', 10, 3.6, 36, 7), ring({ at: 500, dur: 400, n: 2, r1: 36 }), knock(480, 12),
  ]),
  def('steel', 'special', 'lasca-metalica', 'Lasca metálica', [
    shot({ at: 0, dur: 700, glyph: 'shard', size: 4.4, n: 8, stagger: 0.7, spread: 26, spreadStart: 14, arc: 6, from: 'src', to: 'tgt', ease: 'in', trail: 1 }), ...hit(620, 'spark', 8, 3.4, 34, 5),
  ]),
  def('steel', 'special', 'chuva-de-engrenagens', 'Chuva de engrenagens', [
    rain({ at: 0, dur: 1100, glyph: 'gear', n: 10, size: 5, spreadX: 60, fall: 0.38, spin: 2 }), burst({ at: 500, dur: 600, glyph: 'spark', n: 12, size: 3, radius: 40, where: 'tgt', flash: false }), actor({ at: 500, dur: 700, who: 'tgt', move: 'shake', amt: 5 }),
  ]),
  def('steel', 'status', 'endurecer-ferro', 'Endurecer', [
    aura({ at: 0, dur: 1300, where: 'src', style: 'up', glyph: 'gear', n: 6, size: 3.6 }), ring({ at: 0, dur: 1200, where: 'src', n: 3, r0: 30, r1: 6, inward: true }),
    tint({ at: 100, dur: 900, color: 'light', alpha: 0.16 }), actor({ at: 100, dur: 1100, who: 'src', move: 'squash', amt: 8 }),
  ]),
  def('steel', 'status', 'brilho-metalico', 'Brilho metálico', [
    orbit({ at: 0, dur: 1200, glyph: 'spark', n: 8, size: 3.4, r: 30, where: 'src', mode: 'hold', turns: 1.5 }), actor({ at: 200, dur: 800, who: 'src', move: 'flash' }), aura({ at: 100, dur: 1100, where: 'src', style: 'up', glyph: 'arrow', n: 6 }),
  ]),
];

/* ======================================================================== FADA */
const fairy: FxAnimation[] = [
  def('fairy', 'physical', 'brincadeira', 'Brincadeira', [
    actor({ at: 0, dur: 420, who: 'src', move: 'hop', amt: 14 }), lunge(260, 460, 96), ...hit(500, 'heart', 8, 4, 36, 6), knock(500, 10),
  ]),
  def('fairy', 'physical', 'garra-de-fada', 'Garra de fada', [
    lunge(0, 520, 88), slash({ at: 200, dur: 500, style: 'claw', size: 26 }), burst({ at: 300, dur: 600, glyph: 'spark', n: 10, size: 3, radius: 36, where: 'tgt', flash: false }), ...hit(320, 'heart', 3, 3, 14, 4),
  ]),
  def('fairy', 'physical', 'cabecada-fofa', 'Cabeçada fofa', [
    stream({ at: 0, dur: 540, glyph: 'spark', n: 12, size: 2.8, from: 'src', to: 'srcFeet', spread: 22, rate: 2 }), lunge(40, 580, 100), ...hit(310, 'star', 9, 4.4, 40, 7),
    burst({ at: 320, dur: 560, glyph: 'heart', n: 5, size: 3.6, radius: 30, where: 'tgt', up: true, gravity: -1, flash: false }), knock(310, 12),
  ]),
  def('fairy', 'special', 'brilho-lunar', 'Brilho lunar', [
    tint({ at: 0, dur: 1300, color: 'dark', alpha: 0.26 }), orbit({ at: 0, dur: 600, glyph: 'spark', n: 10, size: 3, r: 30, where: 'src', mode: 'in', turns: 1 }), beam({ at: 560, dur: 700, width: 9 }),
    ...hit(700, 'star', 12, 4.6, 46, 7), tint({ at: 700, dur: 500, color: 'light', alpha: 0.38 }), ring({ at: 720, dur: 700, n: 3, r1: 54 }),
  ]),
  def('fairy', 'special', 'ventania-de-fadas', 'Ventania de fadas', [
    stream({ at: 0, dur: 1200, glyph: 'spark', n: 24, size: 3, from: 'src', to: 'tgt', spread: 34, rate: 1.8, wob: 6 }), stream({ at: 100, dur: 1100, glyph: 'heart', n: 8, size: 3.4, from: 'src', to: 'tgt', spread: 30, rate: 1.4, wob: 5 }),
    actor({ at: 500, dur: 700, who: 'tgt', move: 'shake', amt: 4 }), tint({ at: 300, dur: 800, color: 'glow', alpha: 0.18 }),
  ]),
  def('fairy', 'special', 'estrelas-magicas', 'Estrelas mágicas', [
    shot({ at: 0, dur: 800, glyph: 'star', size: 4.6, n: 8, stagger: 0.6, arc: 24, spread: 22, spreadStart: 14, spin: 1.5, trail: 3, from: 'src', to: 'tgt' }), ...hit(620, 'spark', 10, 3.6, 38, 5),
  ]),
  def('fairy', 'special', 'beijo-drenador', 'Beijo drenador', [
    shot({ at: 0, dur: 800, glyph: 'heart', size: 6.4, from: 'src', to: 'tgt', arc: 22, face: false, trail: 2 }), ...hit(700, 'heart', 10, 4, 38, 5),
    stream({ at: 900, dur: 800, glyph: 'heart', n: 6, size: 3, from: 'tgt', to: 'src', spread: 10, rate: 1.4, wob: 3 }), aura({ at: 1300, dur: 500, where: 'src', style: 'up', glyph: 'spark', n: 5, size: 2.8, ring: false }),
  ]),
  def('fairy', 'special', 'voz-encantada', 'Voz encantada', [
    shot({ at: 0, dur: 900, glyph: 'note', size: 4.4, n: 7, stagger: 0.8, arc: 14, spread: 18, spreadStart: 10, face: false, from: 'src', to: 'tgt' }), ring({ at: 760, dur: 700, n: 3, r1: 44 }),
    actor({ at: 780, dur: 600, who: 'tgt', move: 'shake', amt: 5 }), tint({ at: 700, dur: 700, color: 'glow', alpha: 0.2 }),
  ]),
  def('fairy', 'status', 'charme', 'Charme', [
    rise({ at: 0, dur: 1100, glyph: 'heart', n: 6, size: 4.4, height: 1.2, spreadX: 44, where: 'tgtFeet', stagger: 0.6 }), aura({ at: 300, dur: 1000, where: 'tgt', style: 'down', glyph: 'arrow', n: 6 }),
    actor({ at: 400, dur: 800, who: 'tgt', move: 'squash', amt: 10 }),
  ]),
  def('fairy', 'status', 'luz-curativa', 'Luz curativa', [
    aura({ at: 0, dur: 1400, where: 'src', style: 'up', glyph: 'spark', n: 9, size: 3.2 }), orbit({ at: 0, dur: 1400, glyph: 'heart', n: 5, size: 3.4, r: 30, where: 'src', mode: 'hold', turns: 1.5 }),
    tint({ at: 100, dur: 1000, color: 'glow', alpha: 0.2 }),
  ]),
];

export const fxAnimations: readonly FxAnimation[] = [
  ...normal, ...fire, ...water, ...electric, ...grass, ...ice, ...fighting, ...poison, ...ground,
  ...flying, ...psychic, ...bug, ...rock, ...ghost, ...dragon, ...dark, ...steel, ...fairy,
];
