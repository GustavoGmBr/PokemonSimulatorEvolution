import { drawGlyph, type GlyphKind, type Palette } from './glyphs';

/** Área lógica do efeito: 300x200 pixels, esticada por cima da arena (proporção 3:2). Cada pixel lógico = 2 da imagem. */
export const FX_W = 300;
export const FX_H = 200;

export type P = { x: number; y: number };
export type Rng = () => number;

export interface Env {
  /** centro do corpo de quem ataca e de quem apanha */
  src: P;
  tgt: P;
  /** pés (onde pisam), em pixels lógicos */
  srcFeet: P;
  tgtFeet: P;
  /** +1 quando o atacante está à esquerda (ataca para a direita) e -1 no caso contrário */
  dir: 1 | -1;
  pal: Palette;
  seed: number;
}

export interface ActorOut { dx: number; dy: number; rot: number; sx: number; sy: number; alpha: number; flash: number }
export interface Frame { src: ActorOut; tgt: ActorOut; screen: P }

export const newFrame = (): Frame => ({
  src: { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, alpha: 1, flash: 0 },
  tgt: { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, alpha: 1, flash: 0 },
  screen: { x: 0, y: 0 },
});

export interface Element {
  at: number;
  dur: number;
  draw?: (g: CanvasRenderingContext2D, p: number, env: Env) => void;
  actor?: (p: number, env: Env, frame: Frame) => void;
}
export type Spec = (env: Env, rnd: Rng) => Element;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const eIn = (t: number) => t * t;
const eOut = (t: number) => 1 - (1 - t) * (1 - t);
const eIO = (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
/** sobe rápido, segura, desce: bom para brilhos e opacidade */
const hump = (t: number, up = 0.2, down = 0.35) => Math.min(1, t / up, (1 - t) / down);
const frac = (v: number) => v - Math.floor(v);

export type Anchor = 'src' | 'tgt' | 'mid' | 'srcFeet' | 'tgtFeet' | 'sky' | 'skySrc' | 'left' | 'right' | 'center';
export type Ease = 'lin' | 'in' | 'out' | 'io';
const easers: Record<Ease, (t: number) => number> = { lin: (t) => t, in: eIn, out: eOut, io: eIO };

export function resolve(env: Env, a: Anchor, dx = 0, dy = 0): P {
  let p: P;
  switch (a) {
    case 'src': p = env.src; break;
    case 'tgt': p = env.tgt; break;
    case 'srcFeet': p = env.srcFeet; break;
    case 'tgtFeet': p = env.tgtFeet; break;
    case 'mid': p = { x: (env.src.x + env.tgt.x) / 2, y: (env.src.y + env.tgt.y) / 2 }; break;
    case 'sky': p = { x: env.tgt.x, y: -14 }; break;
    case 'skySrc': p = { x: env.src.x, y: -14 }; break;
    case 'left': p = { x: -12, y: env.tgt.y }; break;
    case 'right': p = { x: FX_W + 12, y: env.tgt.y }; break;
    default: p = { x: FX_W / 2, y: FX_H / 2 };
  }
  return { x: p.x + dx, y: p.y + dy };
}

/** Em que lado a ponta do desenho fica quando ele voa: 'fwd' aponta para onde vai, 'back' deixa a ponta para trás. */
const TIP: Partial<Record<GlyphKind, 'fwd' | 'back'>> = {
  flame: 'back', drop: 'back', wisp: 'back', bolt: 'fwd', shard: 'fwd', spike: 'fwd',
};
const headingRot = (kind: GlyphKind, heading: number) => {
  const tip = TIP[kind];
  if (tip === 'fwd') return heading + Math.PI / 2;
  if (tip === 'back') return heading - Math.PI / 2;
  return heading;
};

const pt = (a: P, b: P, t: number): P => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const hexA = (hex: string, a: number) => {
  const v = hex.replace('#', '');
  return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)},${a})`;
};

/* ----------------------------------------------------------------- elementos de desenho */

export interface ShotOpts {
  at: number; dur: number; glyph: GlyphKind; size: number;
  n?: number; stagger?: number; from?: Anchor; to?: Anchor; arc?: number; spread?: number; spreadStart?: number;
  spin?: number; trail?: number; ease?: Ease; grow?: number; face?: boolean; drop?: number;
}
/** Um ou vários projéteis que voam de um ponto a outro. */
export const shot = (o: ShotOpts): Spec => (env, rnd) => {
  const n = o.n ?? 1;
  const stagger = n > 1 ? (o.stagger ?? 0.5) : 0;
  const ease = easers[o.ease ?? 'lin'];
  const items = Array.from({ length: n }, () => ({
    a: resolve(env, o.from ?? 'src', (rnd() - 0.5) * (o.spreadStart ?? 0), (rnd() - 0.5) * (o.spreadStart ?? 0)),
    b: resolve(env, o.to ?? 'tgt', (rnd() - 0.5) * (o.spread ?? 0), (rnd() - 0.5) * (o.spread ?? 0) * 0.7),
    arc: (o.arc ?? 0) * (0.6 + rnd() * 0.8),
    rot: rnd() * 6.28,
  }));
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      items.forEach((it, i) => {
        const d = (i / Math.max(1, n)) * stagger;
        const q = (p - d) / (1 - stagger * ((n - 1) / Math.max(1, n)));
        if (q <= 0 || q >= 1) return;
        const at = (qq: number): P => {
          const e = ease(clamp01(qq));
          const base = pt(it.a, it.b, e);
          return { x: base.x, y: base.y - it.arc * 4 * e * (1 - e) + (o.drop ?? 0) * e * e };
        };
        const cur = at(q);
        const nxt = at(q + 0.02);
        const heading = Math.atan2(nxt.y - cur.y, nxt.x - cur.x);
        const rot = (o.face === false ? it.rot : headingRot(o.glyph, heading)) + (o.spin ?? 0) * q * Math.PI * 2;
        const size = o.size * (1 + (o.grow ?? 0) * q);
        for (let k = (o.trail ?? 0); k >= 1; k -= 1) {
          const qq = q - k * 0.04;
          if (qq < 0) continue;
          const tp = at(qq);
          drawGlyph(g, o.glyph, tp.x, tp.y, size * (1 - k * 0.1), rot, env.pal, (1 - k / ((o.trail ?? 0) + 1)) * 0.55);
        }
        drawGlyph(g, o.glyph, cur.x, cur.y, size, rot, env.pal, 1);
      });
    },
  };
};

export interface BeamOpts { at: number; dur: number; width: number; from?: Anchor; to?: Anchor; jitter?: number; flare?: boolean; fromDx?: number; toDx?: number }
/** Raio contínuo (com brilho em volta). `jitter` o deixa em zigue-zague, como eletricidade. */
export const beam = (o: BeamOpts): Spec => (env) => {
  const a = resolve(env, o.from ?? 'src', o.fromDx ?? 0);
  const b = resolve(env, o.to ?? 'tgt', o.toDx ?? 0);
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      const k = hump(p, 0.18, 0.3);
      if (k <= 0) return;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const segs = o.jitter ? Math.max(6, Math.round(len / 14)) : 1;
      const bucket = Math.floor(p * 28);
      const rr = mulberry32(bucket * 977 + 13);
      const normal = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
      const pts: P[] = [];
      for (let i = 0; i <= segs; i += 1) {
        const t = i / segs;
        const off = i === 0 || i === segs ? 0 : (rr() - 0.5) * (o.jitter ?? 0);
        pts.push({ x: lerp(a.x, b.x, t) + normal.x * off, y: lerp(a.y, b.y, t) + normal.y * off });
      }
      const stroke = (w: number, color: string, alpha: number) => {
        g.save();
        g.globalAlpha = alpha * k;
        g.strokeStyle = color;
        g.lineWidth = w * k;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        pts.forEach((q, i) => (i === 0 ? g.moveTo(q.x, q.y) : g.lineTo(q.x, q.y)));
        g.stroke();
        g.restore();
      };
      const pulse = 1 + 0.12 * Math.sin(p * 60);
      stroke(o.width * 2.4 * pulse, env.pal.glow, 0.35);
      stroke(o.width * 1.5 * pulse, env.pal.dark, 0.9);
      stroke(o.width * pulse, env.pal.mid, 1);
      stroke(o.width * 0.45 * pulse, env.pal.light, 1);
      if (o.flare !== false) {
        for (const c of [a, b]) {
          g.save();
          g.globalAlpha = 0.9 * k;
          drawGlyph(g, 'orb', c.x, c.y, o.width * 0.95 * pulse, 0, env.pal);
          g.restore();
        }
      }
    },
  };
};

export interface StreamOpts {
  at: number; dur: number; glyph: GlyphKind; n: number; size: number; from?: Anchor; to?: Anchor;
  spread?: number; rate?: number; wob?: number; grow?: number; spin?: number; arc?: number;
}
/** Jato contínuo de partículas, como um lança-chamas ou um jato d'água. */
export const stream = (o: StreamOpts): Spec => (env, rnd) => {
  const a = resolve(env, o.from ?? 'src');
  const b = resolve(env, o.to ?? 'tgt');
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const normal = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const items = Array.from({ length: o.n }, (_, i) => ({ ph: i / o.n, off: rnd() * 2 - 1, wob: rnd() * 6.28, rot: rnd() * 6.28, sz: 0.7 + rnd() * 0.6 }));
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      const env2 = hump(p, 0.12, 0.2);
      if (env2 <= 0) return;
      for (const it of items) {
        const q = frac(p * (o.rate ?? 1.8) + it.ph);
        const spread = (o.spread ?? 14) * q;
        const base = pt(a, b, q);
        const x = base.x + normal.x * (it.off * spread + Math.sin(it.wob + q * 9) * (o.wob ?? 0) * q);
        const y = base.y + normal.y * (it.off * spread + Math.sin(it.wob + q * 9) * (o.wob ?? 0) * q) - (o.arc ?? 0) * 4 * q * (1 - q);
        const fade = Math.min(1, q * 5, (1 - q) * 2.4) * env2;
        drawGlyph(g, o.glyph, x, y, o.size * it.sz * (1 + (o.grow ?? 0) * q), it.rot + (o.spin ?? 0) * q * 6.28, env.pal, fade);
      }
    },
  };
};

export interface BurstOpts {
  at: number; dur: number; glyph: GlyphKind; n: number; size: number; radius: number; where?: Anchor;
  gravity?: number; flash?: boolean; spin?: number; up?: boolean; dx?: number; dy?: number; ring?: boolean;
}
/** Explosão de partículas a partir de um ponto, com um clarão no centro. */
export const burst = (o: BurstOpts): Spec => (env, rnd) => {
  const c = resolve(env, o.where ?? 'tgt', o.dx ?? 0, o.dy ?? 0);
  const items = Array.from({ length: o.n }, (_, i) => {
    const ang = o.up ? -Math.PI / 2 + (rnd() - 0.5) * 2.2 : (i / o.n) * Math.PI * 2 + rnd() * 0.5;
    return { ang, speed: 0.55 + rnd() * 0.6, rot: rnd() * 6.28, sz: 0.65 + rnd() * 0.7 };
  });
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      if (o.flash !== false) {
        const k = hump(p, 0.12, 0.5);
        g.save();
        g.globalAlpha = 0.9 * k;
        g.fillStyle = env.pal.light;
        g.beginPath();
        g.arc(c.x, c.y, o.radius * 0.5 * eOut(Math.min(1, p * 2.4)), 0, 6.28);
        g.fill();
        g.globalAlpha = 0.4 * k;
        g.fillStyle = env.pal.glow;
        g.beginPath();
        g.arc(c.x, c.y, o.radius * 0.8 * eOut(Math.min(1, p * 2)), 0, 6.28);
        g.fill();
        g.restore();
      }
      if (o.ring) {
        g.save();
        g.globalAlpha = (1 - p) * 0.9;
        g.strokeStyle = env.pal.light;
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(c.x, c.y, o.radius * 1.1 * eOut(p), o.radius * 0.8 * eOut(p), 0, 0, 6.28);
        g.stroke();
        g.restore();
      }
      for (const it of items) {
        const e = eOut(p);
        const x = c.x + Math.cos(it.ang) * o.radius * it.speed * e;
        const y = c.y + Math.sin(it.ang) * o.radius * it.speed * e * 0.85 + (o.gravity ?? 0) * p * p * 30;
        drawGlyph(g, o.glyph, x, y, o.size * it.sz * (1 - p * 0.45), it.rot + (o.spin ?? 0) * p * 6.28, env.pal, Math.min(1, (1 - p) * 2.2));
      }
    },
  };
};

export interface RainOpts {
  at: number; dur: number; glyph: GlyphKind; n: number; size: number; spreadX?: number; to?: Anchor; drift?: number;
  spin?: number; puff?: boolean; fall?: number; stagger?: number;
}
/** Chuva de objetos que caem do alto sobre o alvo. */
export const rain = (o: RainOpts): Spec => (env, rnd) => {
  const c = resolve(env, o.to ?? 'tgtFeet');
  const fall = 0.42 / (1 + (o.stagger ?? 0));
  const items = Array.from({ length: o.n }, () => ({
    x: c.x + (rnd() - 0.5) * (o.spreadX ?? 60),
    y: c.y + (rnd() - 0.5) * 12,
    d: rnd() * (1 - (o.fall ?? 0.45)),
    rot: rnd() * 6.28,
    sz: 0.7 + rnd() * 0.6,
  }));
  const f = o.fall ?? 0.45;
  void fall;
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      for (const it of items) {
        const q = (p - it.d) / f;
        if (q <= 0) continue;
        if (q < 1) {
          const y = lerp(-16, it.y, eIn(q));
          const x = it.x - (o.drift ?? 0) * (1 - eIn(q));
          drawGlyph(g, o.glyph, x, y, o.size * it.sz, it.rot + (o.spin ?? 0) * q * 6.28 + (o.drift ? Math.atan2(1, (o.drift ?? 0) / 40) - Math.PI / 2 : 0), env.pal, 1);
        } else if (o.puff !== false && q < 1.6) {
          const t = (q - 1) / 0.6;
          g.save();
          g.globalAlpha = (1 - t) * 0.8;
          g.fillStyle = env.pal.light;
          g.beginPath();
          g.ellipse(it.x, it.y, 3 + t * 6, 1.5 + t * 2.5, 0, 0, 6.28);
          g.fill();
          g.restore();
        }
      }
    },
  };
};

export interface RiseOpts {
  at: number; dur: number; glyph: GlyphKind; n: number; size: number; height?: number; spreadX?: number; where?: Anchor; stagger?: number; dx?: number;
}
/** Coisas que brotam do chão (espinhos, colunas de fogo, raízes). */
export const rise = (o: RiseOpts): Spec => (env, rnd) => {
  const c = resolve(env, o.where ?? 'tgtFeet', o.dx ?? 0);
  const items = Array.from({ length: o.n }, (_, i) => ({
    x: c.x + (o.n === 1 ? 0 : (i / (o.n - 1) - 0.5) * (o.spreadX ?? 50)) + (rnd() - 0.5) * 6,
    y: c.y + (rnd() - 0.5) * 8,
    d: (i / o.n) * (o.stagger ?? 0.3),
    k: 0.75 + rnd() * 0.5,
  }));
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      for (const it of items) {
        const q = clamp01((p - it.d) / (1 - (o.stagger ?? 0.3)));
        if (q <= 0) continue;
        const grow = eOut(Math.min(1, q / 0.35));
        const fade = Math.min(1, (1 - q) * 3);
        const h = (o.height ?? 1.2) * it.k;
        g.save();
        g.translate(it.x, it.y);
        g.scale(1, Math.max(0.05, grow * h));
        drawGlyph(g, o.glyph, 0, -o.size * 1.3, o.size, 0, env.pal, fade);
        g.restore();
      }
    },
  };
};

export type SlashStyle = 'claw' | 'x' | 'arc' | 'cut' | 'bite' | 'cross';
export interface SlashOpts { at: number; dur: number; style: SlashStyle; size?: number; where?: Anchor; flip?: boolean; light?: boolean }
const taper = (g: CanvasRenderingContext2D, pts: P[], w: number, color: string, alpha: number) => {
  g.save();
  g.strokeStyle = color;
  g.globalAlpha = alpha;
  g.lineCap = 'round';
  for (let i = 0; i < pts.length - 1; i += 1) {
    const t = (i + 0.5) / (pts.length - 1);
    g.lineWidth = Math.max(0.6, w * Math.sin(Math.PI * t) * 1.15);
    g.beginPath();
    g.moveTo(pts[i]!.x, pts[i]!.y);
    g.lineTo(pts[i + 1]!.x, pts[i + 1]!.y);
    g.stroke();
  }
  g.restore();
};
/** Cortes, arranhões e mordidas sobre o alvo. */
export const slash = (o: SlashOpts): Spec => (env) => {
  const c = resolve(env, o.where ?? 'tgt');
  const s = o.size ?? 22;
  const flip = (o.flip ? -1 : 1) * env.dir;
  const line = (x0: number, y0: number, x1: number, y1: number, bend = 0): P[] => {
    const pts: P[] = [];
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      pts.push({ x: lerp(x0, x1, t) + bend * Math.sin(Math.PI * t) * (y1 - y0) / s * 0.2, y: lerp(y0, y1, t) - bend * Math.sin(Math.PI * t) * 0.6 * (x1 - x0) / s * 0.3 });
    }
    return pts;
  };
  const strokes: P[][] = [];
  if (o.style === 'claw') for (const k of [-1, 0, 1]) strokes.push(line(c.x + flip * (-s * 0.8 + k * s * 0.38), c.y - s * 0.95 + k * 2, c.x + flip * (s * 0.4 + k * s * 0.38), c.y + s * 0.95 + k * 2));
  if (o.style === 'x') { strokes.push(line(c.x - flip * s, c.y - s, c.x + flip * s, c.y + s)); strokes.push(line(c.x + flip * s, c.y - s, c.x - flip * s, c.y + s)); }
  if (o.style === 'cross') { strokes.push(line(c.x - s, c.y, c.x + s, c.y)); strokes.push(line(c.x, c.y - s, c.x, c.y + s)); }
  if (o.style === 'cut') strokes.push(line(c.x - flip * s, c.y - s * 0.9, c.x + flip * s, c.y + s * 0.9));
  if (o.style === 'arc') {
    const pts: P[] = [];
    for (let i = 0; i <= 16; i += 1) {
      const a = lerp(-2.4, 0.8, i / 16);
      pts.push({ x: c.x + Math.cos(a) * s * flip * 1.1, y: c.y + Math.sin(a) * s * 1.1 + s * 0.2 });
    }
    strokes.push(pts);
  }
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      if (o.style === 'bite') {
        const close = eOut(Math.min(1, p / 0.45));
        const fade = Math.min(1, (1 - p) * 3);
        const teeth = 6;
        for (const side of [-1, 1]) {
          const y0 = c.y + side * lerp(s * 1.3, s * 0.18, close);
          for (let i = 0; i < teeth; i += 1) {
            const x = c.x + (i / (teeth - 1) - 0.5) * s * 2;
            g.save();
            g.globalAlpha = fade;
            g.translate(x, y0);
            g.scale(1, -side);
            drawGlyph(g, 'spike', 0, 0, s * 0.2, 0, env.pal, 1);
            g.restore();
          }
        }
        return;
      }
      const head = clamp01(p / 0.45);
      const tail = clamp01((p - 0.35) / 0.65);
      const fade = Math.min(1, (1 - p) * 2.6);
      strokes.forEach((pts, si) => {
        const i0 = Math.floor(tail * (pts.length - 1) * 0.9);
        const i1 = Math.max(i0 + 2, Math.ceil(clamp01(head - si * 0.06) * (pts.length - 1)) + 1);
        const part = pts.slice(i0, i1);
        if (part.length < 2) return;
        taper(g, part, (o.style === 'arc' ? 7 : 5) * (s / 22), env.pal.glow, fade * 0.45);
        taper(g, part, (o.style === 'arc' ? 5 : 3.5) * (s / 22), env.pal.mid, fade);
        taper(g, part, (o.style === 'arc' ? 2.4 : 1.6) * (s / 22), env.pal.light, fade);
      });
    },
  };
};

export interface RingOpts { at: number; dur: number; where?: Anchor; n?: number; r0?: number; r1?: number; flat?: number; w?: number; stagger?: number; fill?: boolean; to?: Anchor; dy?: number; inward?: boolean }
/** Anéis que crescem (ondas de choque, ondas sonoras, poderes psíquicos). */
export const ring = (o: RingOpts): Spec => (env) => {
  const c = resolve(env, o.where ?? 'tgt', 0, o.dy ?? 0);
  const c2 = o.to ? resolve(env, o.to) : c;
  const n = o.n ?? 2;
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      for (let i = 0; i < n; i += 1) {
        const q = (p - (i / n) * (o.stagger ?? 0.4)) / (1 - (o.stagger ?? 0.4) * ((n - 1) / n));
        if (q <= 0 || q >= 1) continue;
        const e = o.inward ? 1 - eOut(q) : eOut(q);
        const r = lerp(o.r0 ?? 3, o.r1 ?? 30, e);
        const pos = pt(c, c2, q);
        g.save();
        g.globalAlpha = Math.min(1, (1 - q) * 1.6) * 0.95;
        g.lineWidth = (o.w ?? 2.2) * (1 - q * 0.5);
        g.strokeStyle = env.pal.dark;
        g.beginPath();
        g.ellipse(pos.x, pos.y, r + 1, r * (o.flat ?? 0.8) + 1, 0, 0, 6.28);
        g.stroke();
        g.strokeStyle = env.pal.light;
        g.lineWidth = Math.max(0.8, (o.w ?? 2.2) * 0.6 * (1 - q * 0.5));
        g.beginPath();
        g.ellipse(pos.x, pos.y, r, r * (o.flat ?? 0.8), 0, 0, 6.28);
        g.stroke();
        if (o.fill) {
          g.globalAlpha *= 0.25;
          g.fillStyle = env.pal.glow;
          g.fill();
        }
        g.restore();
      }
    },
  };
};

export interface OrbitOpts {
  at: number; dur: number; glyph: GlyphKind; n: number; size: number; r?: number; turns?: number; mode?: 'in' | 'out' | 'hold';
  where?: Anchor; flat?: number; spin?: number; dy?: number;
}
/** Partículas que giram em volta de um ponto, se fechando (carga), abrindo (redemoinho) ou mantendo a distância. */
export const orbit = (o: OrbitOpts): Spec => (env, rnd) => {
  const c = resolve(env, o.where ?? 'tgt', 0, o.dy ?? 0);
  const items = Array.from({ length: o.n }, (_, i) => ({ a: (i / o.n) * 6.28 + rnd() * 0.4, rr: 0.75 + rnd() * 0.5, rot: rnd() * 6.28, h: rnd() * 8 - 4 }));
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      const R = o.r ?? 24;
      const mode = o.mode ?? 'hold';
      const k = mode === 'in' ? 1 - eIn(p) : mode === 'out' ? eOut(p) : 1;
      const fade = Math.min(1, p * 5, (1 - p) * (mode === 'out' ? 2.2 : 4));
      for (const it of items) {
        const a = it.a + (o.turns ?? 1.5) * 6.28 * p;
        const x = c.x + Math.cos(a) * R * k * it.rr;
        const y = c.y + Math.sin(a) * R * k * it.rr * (o.flat ?? 0.6) + it.h * (mode === 'out' ? p : 0);
        drawGlyph(g, o.glyph, x, y, o.size * (0.8 + 0.4 * Math.sin(a)), it.rot + (o.spin ?? 0) * p * 6.28, env.pal, fade);
      }
      if (mode === 'in') {
        g.save();
        g.globalAlpha = 0.5 * fade;
        g.fillStyle = env.pal.glow;
        g.beginPath();
        g.arc(c.x, c.y, 3 + 8 * p, 0, 6.28);
        g.fill();
        g.restore();
      }
    },
  };
};

export type WaveStyle = 'water' | 'shock' | 'sand' | 'wind' | 'fire' | 'ice' | 'dark' | 'poison';
export interface WaveOpts { at: number; dur: number; height?: number; from?: 'left' | 'right' | 'src'; length?: number; style?: WaveStyle }
/** Uma parede que varre a arena de um lado ao outro (onda, nuvem de areia, rajada). */
export const wave = (o: WaveOpts): Spec => (env) => {
  const ltr = (o.from ?? (env.dir === 1 ? 'left' : 'right')) !== 'right';
  const baseY = Math.max(env.tgtFeet.y, env.srcFeet.y) + 6;
  const len = o.length ?? 120;
  const hgt = o.height ?? 60;
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      const front = lerp(-len * 0.2, FX_W + len * 1.1, p);
      const fade = Math.min(1, (1 - p) * 3, p * 6);
      g.save();
      g.globalAlpha = 0.9 * fade;
      if (!ltr) {
        g.translate(FX_W, 0);
        g.scale(-1, 1);
      }
      const top: P[] = [];
      for (let i = 0; i <= 28; i += 1) {
        const t = i / 28;
        const x = front - len + t * len;
        const ripple = 1 + 0.12 * Math.sin(x * 0.28 + p * 24) + 0.06 * Math.sin(x * 0.7 - p * 40);
        const style = o.style ?? 'water';
        const shape = style === 'wind' || style === 'sand' ? Math.sin(Math.PI * Math.min(1, t * 1.2)) : t ** 0.7 * (1 - 0.06 * (1 - t));
        top.push({ x, y: baseY - hgt * shape * ripple });
      }
      const pal = env.pal;
      const fillBand = (offset: number, color: string, alpha: number) => {
        g.globalAlpha = 0.9 * fade * alpha;
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(top[0]!.x, baseY + 4);
        top.forEach((q) => g.lineTo(q.x, q.y + offset));
        g.lineTo(top[top.length - 1]!.x, baseY + 4);
        g.closePath();
        g.fill();
      };
      fillBand(0, pal.dark, 1);
      fillBand(3, pal.mid, 1);
      fillBand(hgt * 0.35, pal.glow, 0.5);
      g.globalAlpha = 0.95 * fade;
      g.strokeStyle = pal.light;
      g.lineWidth = 2;
      g.beginPath();
      top.forEach((q, i) => (i === 0 ? g.moveTo(q.x, q.y + 1) : g.lineTo(q.x, q.y + 1)));
      g.stroke();
      for (let i = 4; i < top.length; i += 3) {
        const q = top[i]!;
        g.fillStyle = pal.light;
        g.fillRect(q.x, q.y - 2 - ((i * 7) % 4), 2, 2);
      }
      g.restore();
    },
  };
};

export interface AuraOpts { at: number; dur: number; where?: 'src' | 'tgt'; style?: 'up' | 'down' | 'pulse'; glyph?: GlyphKind; n?: number; size?: number; ring?: boolean }
/** Brilho em volta de um Pokémon com símbolos subindo (bônus) ou descendo (penalidade). */
export const aura = (o: AuraOpts): Spec => (env, rnd) => {
  const c = o.where === 'tgt' ? env.tgt : env.src;
  const n = o.n ?? 8;
  const items = Array.from({ length: n }, (_, i) => ({ x: (i / n - 0.5) * 38 + (rnd() - 0.5) * 8, ph: rnd(), rot: rnd() * 6.28 }));
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      const k = hump(p, 0.2, 0.25);
      const style = o.style ?? 'up';
      g.save();
      const grad = g.createRadialGradient(c.x, c.y, 2, c.x, c.y, 34);
      grad.addColorStop(0, hexA(env.pal.glow, 0.55 * k * (0.75 + 0.25 * Math.sin(p * 30))));
      grad.addColorStop(1, hexA(env.pal.glow, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(c.x, c.y, 36, 30, 0, 0, 6.28);
      g.fill();
      g.restore();
      if (o.ring !== false) {
        g.save();
        g.globalAlpha = 0.8 * k;
        g.strokeStyle = env.pal.light;
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(c.x, env.srcFeet.y === c.y ? c.y : (o.where === 'tgt' ? env.tgtFeet.y : env.srcFeet.y) - 2, 22 + 6 * Math.sin(p * 20), 7, 0, 0, 6.28);
        g.stroke();
        g.restore();
      }
      for (const it of items) {
        const q = frac(p * 1.6 + it.ph);
        const y = style === 'down' ? c.y - 28 + q * 56 : c.y + 26 - q * 56;
        const fade = Math.min(1, q * 4, (1 - q) * 3) * k;
        const glyph = o.glyph ?? 'arrow';
        drawGlyph(g, glyph, c.x + it.x, y, o.size ?? 3.4, glyph === 'arrow' && style === 'down' ? Math.PI : it.rot * (glyph === 'arrow' ? 0 : 1), env.pal, fade);
      }
    },
  };
};

export interface BoltOpts { at: number; dur: number; width?: number; from?: Anchor; to?: Anchor; branches?: number; n?: number; spreadX?: number }
/** Relâmpago em zigue-zague caindo do céu (ou saindo de quem ataca). */
export const bolt = (o: BoltOpts): Spec => (env, rnd) => {
  const n = o.n ?? 1;
  const strikes = Array.from({ length: n }, (_, i) => {
    const dx = n === 1 ? 0 : (rnd() - 0.5) * (o.spreadX ?? 70);
    return { dx, d: (i / n) * 0.6 };
  });
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      strikes.forEach((s, si) => {
        const q = (p - s.d) / (1 - 0.6 * ((n - 1) / n));
        if (q <= 0 || q >= 1) return;
        const flick = Math.sin(q * 38) > -0.35 ? 1 : 0.35;
        const a = resolve(env, o.from ?? 'sky', s.dx * 0.6);
        const b = resolve(env, o.to ?? 'tgtFeet', s.dx);
        const rr = mulberry32(Math.floor(q * 18) * 131 + si * 17 + 5);
        const pts: P[] = [a];
        const segs = 9;
        for (let i = 1; i < segs; i += 1) {
          const t = i / segs;
          pts.push({ x: lerp(a.x, b.x, t) + (rr() - 0.5) * 22, y: lerp(a.y, b.y, t) });
        }
        pts.push(b);
        const draw = (list: P[], w: number, color: string, alpha: number) => {
          g.save();
          g.globalAlpha = alpha * flick * Math.min(1, (1 - q) * 3);
          g.strokeStyle = color;
          g.lineWidth = w;
          g.lineJoin = 'miter';
          g.beginPath();
          list.forEach((pp, i) => (i === 0 ? g.moveTo(pp.x, pp.y) : g.lineTo(pp.x, pp.y)));
          g.stroke();
          g.restore();
        };
        draw(pts, (o.width ?? 4) * 2.6, env.pal.glow, 0.35);
        draw(pts, (o.width ?? 4) * 1.5, env.pal.dark, 0.9);
        draw(pts, o.width ?? 4, env.pal.mid, 1);
        draw(pts, (o.width ?? 4) * 0.4, env.pal.light, 1);
        for (let k = 0; k < (o.branches ?? 2); k += 1) {
          const i = 2 + Math.floor(rr() * (segs - 4));
          const from = pts[i]!;
          const br: P[] = [from];
          let x = from.x;
          let y = from.y;
          for (let j = 0; j < 3; j += 1) {
            x += (rr() - 0.4) * 22 * (k % 2 ? -1 : 1);
            y += 8 + rr() * 8;
            br.push({ x, y });
          }
          draw(br, (o.width ?? 4) * 0.55, env.pal.mid, 0.9);
        }
      });
    },
  };
};

export interface TintOpts { at: number; dur: number; color?: 'light' | 'mid' | 'dark' | 'glow' | string; alpha?: number; peak?: number }
/** Cobre a arena inteira com uma cor (clarão, escuridão, clima). */
export const tint = (o: TintOpts): Spec => (env) => {
  const color = o.color === 'light' || o.color === 'mid' || o.color === 'dark' || o.color === 'glow' ? env.pal[o.color] : o.color ?? env.pal.glow;
  return {
    at: o.at, dur: o.dur,
    draw(g, p) {
      g.save();
      g.globalAlpha = (o.alpha ?? 0.35) * hump(p, o.peak ?? 0.25, 0.35);
      g.fillStyle = color;
      g.fillRect(0, 0, FX_W, FX_H);
      g.restore();
    },
  };
};

export interface FieldOpts { at: number; dur: number; glyph: GlyphKind; n: number; size: number; vx?: number; vy?: number; spin?: number }
/** Partículas que atravessam a arena inteira (chuva, neve, areia, folhas). */
export const field = (o: FieldOpts): Spec => (_env, rnd) => {
  const items = Array.from({ length: o.n }, () => ({ x: rnd() * FX_W, y: rnd() * FX_H, sp: 0.7 + rnd() * 0.6, rot: rnd() * 6.28, sz: 0.7 + rnd() * 0.6 }));
  return {
    at: o.at, dur: o.dur,
    draw(g, p, env) {
      const k = hump(p, 0.15, 0.2);
      for (const it of items) {
        const x = (((it.x + (o.vx ?? 0) * it.sp * p * 3) % (FX_W + 20)) + FX_W + 20) % (FX_W + 20) - 10;
        const y = (((it.y + (o.vy ?? 90) * it.sp * p * 3) % (FX_H + 20)) + FX_H + 20) % (FX_H + 20) - 10;
        drawGlyph(g, o.glyph, x, y, o.size * it.sz, it.rot + (o.spin ?? 0) * p * 6.28, env.pal, k);
      }
    },
  };
};

/* ----------------------------------------------------------------- elementos que mexem nos Pokémon */

export type ActorMove = 'lunge' | 'shake' | 'hop' | 'spin' | 'sink' | 'recoil' | 'grow' | 'blink' | 'fade' | 'flash' | 'jitter' | 'dive' | 'wobble' | 'squash' | 'freeze';
export interface ActorOpts { at: number; dur: number; who: 'src' | 'tgt'; move: ActorMove; amt?: number }
const pulse = (p: number, peak = 0.35) => (p < peak ? eOut(p / peak) : 1 - eIn((p - peak) / (1 - peak)));
export const actor = (o: ActorOpts): Spec => () => ({
  at: o.at, dur: o.dur,
  actor(p, env, frame) {
    const a = o.who === 'src' ? frame.src : frame.tgt;
    const toward = o.who === 'src' ? env.dir : -env.dir;
    const amt = o.amt ?? 12;
    switch (o.move) {
      case 'lunge': a.dx += toward * amt * pulse(p, 0.4); a.dy += -amt * 0.12 * pulse(p, 0.4); break;
      case 'recoil': a.dx += -toward * amt * pulse(p, 0.25); break;
      case 'shake': a.dx += Math.sin(p * 46) * amt * (1 - p); break;
      case 'jitter': {
        const r = mulberry32(Math.floor(p * 40) * 73 + (o.who === 'src' ? 1 : 2));
        a.dx += (r() - 0.5) * amt;
        a.dy += (r() - 0.5) * amt * 0.6;
        break;
      }
      case 'hop': a.dy += -amt * Math.sin(Math.PI * p); break;
      case 'spin': a.rot += 360 * eIO(p) * (amt >= 0 ? 1 : -1); break;
      case 'sink': a.dy += amt * Math.sin(Math.PI * p); a.alpha *= 1 - 0.85 * Math.sin(Math.PI * p); break;
      case 'grow': a.sx *= 1 + amt * 0.01 * Math.sin(Math.PI * p); a.sy *= 1 + amt * 0.01 * Math.sin(Math.PI * p); break;
      case 'squash': a.sx *= 1 + amt * 0.01 * pulse(p, 0.3); a.sy *= 1 - amt * 0.01 * pulse(p, 0.3); break;
      case 'blink': a.alpha *= Math.floor(p * 14) % 2 === 0 ? 1 : 0.25; break;
      case 'fade': a.alpha *= 1 - 0.9 * Math.sin(Math.PI * p); break;
      case 'flash': a.flash = Math.max(a.flash, hump(p, 0.15, 0.5)); break;
      case 'freeze': a.flash = Math.max(a.flash, 0.4 * hump(p, 0.2, 0.2)); break;
      case 'wobble': a.rot += Math.sin(p * 30) * amt * (1 - p); break;
      case 'dive': {
        if (p < 0.45) a.dy += -amt * eOut(p / 0.45);
        else a.dy += -amt * (1 - eIn((p - 0.45) / 0.3 > 1 ? 1 : (p - 0.45) / 0.3));
        a.dx += toward * amt * 0.9 * eIn(clamp01((p - 0.45) / 0.3)) * (1 - clamp01((p - 0.8) / 0.2));
        break;
      }
    }
  },
});
export interface ScreenOpts { at: number; dur: number; amt?: number }
/** Treme a arena inteira. */
export const screen = (o: ScreenOpts): Spec => () => ({
  at: o.at, dur: o.dur,
  actor(p, _env, frame) {
    const r = mulberry32(Math.floor(p * 36) * 29 + 7);
    const k = (o.amt ?? 5) * (1 - p);
    frame.screen.x += (r() - 0.5) * 2 * k;
    frame.screen.y += (r() - 0.5) * 2 * k;
  },
});

/* ----------------------------------------------------------------- montagem e reprodução */

export interface FxAnimation {
  id: string;
  type: import('./glyphs').FxType;
  kind: 'physical' | 'special' | 'status';
  name: string;
  els: Spec[];
}

export interface Built { elements: Element[]; duration: number; env: Env }

export function buildAnimation(animation: FxAnimation, env: Env): Built {
  const rnd = mulberry32(env.seed * 31 + 7);
  const elements = animation.els.map((spec) => spec(env, mulberry32(Math.floor(rnd() * 4294967296))));
  const duration = elements.reduce((max, el) => Math.max(max, el.at + el.dur), 0);
  return { elements, duration, env };
}

/** Desenha o quadro do instante `t` (ms) e devolve o quanto cada Pokémon e a tela devem se mexer. */
export function renderFrame(built: Built, g: CanvasRenderingContext2D, t: number): Frame {
  const frame = newFrame();
  g.clearRect(0, 0, FX_W, FX_H);
  for (const el of built.elements) {
    const p = (t - el.at) / el.dur;
    if (p < 0 || p > 1) continue;
    el.actor?.(p, built.env, frame);
  }
  for (const el of built.elements) {
    const p = (t - el.at) / el.dur;
    if (p < 0 || p > 1) continue;
    g.save();
    el.draw?.(g, p, built.env);
    g.restore();
  }
  return frame;
}
