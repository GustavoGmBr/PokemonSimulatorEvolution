/** Formas e cores usadas pelas animações de golpes. Tudo é desenhado por código, sem imagens. */

export type FxType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice' | 'fighting' | 'poison' | 'ground'
  | 'flying' | 'psychic' | 'bug' | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export const fxTypes: readonly FxType[] = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

/** `dark` contorna, `mid` preenche, `light` é o brilho e `glow` é a luz que sai do efeito. */
export type Palette = { dark: string; mid: string; light: string; glow: string };

export const palettes: Record<FxType, Palette> = {
  normal: { dark: '#7a7462', mid: '#d6cfb8', light: '#fffbe6', glow: '#fff3b8' },
  fire: { dark: '#9a2a08', mid: '#f4701c', light: '#ffe070', glow: '#ff9a3a' },
  water: { dark: '#1a4aa0', mid: '#3c8cf0', light: '#c8ecff', glow: '#70c4ff' },
  electric: { dark: '#9a7400', mid: '#f8d030', light: '#fffbd0', glow: '#fff070' },
  grass: { dark: '#1c6228', mid: '#58c048', light: '#d0f8a0', glow: '#9ae86a' },
  ice: { dark: '#2a6a90', mid: '#7ed0f2', light: '#f0fdff', glow: '#bff0ff' },
  fighting: { dark: '#7a1a10', mid: '#d84a38', light: '#ffd8b0', glow: '#ff8a5a' },
  poison: { dark: '#5a1a7a', mid: '#a050c8', light: '#ecb8ff', glow: '#c874f0' },
  ground: { dark: '#6a4a22', mid: '#c09850', light: '#f2dea6', glow: '#e6c47a' },
  flying: { dark: '#5a68aa', mid: '#a8b8f0', light: '#f6f9ff', glow: '#dfe8ff' },
  psychic: { dark: '#8a1a50', mid: '#f85888', light: '#ffd6e8', glow: '#ff90b8' },
  bug: { dark: '#4a6a10', mid: '#98c030', light: '#e8f8a0', glow: '#c0e060' },
  rock: { dark: '#5a5848', mid: '#aaa28a', light: '#e4dcc4', glow: '#dcd4b4' },
  ghost: { dark: '#2e2060', mid: '#7a60c0', light: '#dccaff', glow: '#a890f0' },
  dragon: { dark: '#34169a', mid: '#7038f8', light: '#dcccff', glow: '#a070ff' },
  dark: { dark: '#100a1c', mid: '#5a4878', light: '#c0a8e0', glow: '#8a70b8' },
  steel: { dark: '#4a5868', mid: '#a8b8c8', light: '#f2f8fe', glow: '#e0eaf6' },
  fairy: { dark: '#a0407a', mid: '#f4a0d0', light: '#fff2fb', glow: '#ffc8e8' },
};

export type GlyphKind =
  | 'orb' | 'flame' | 'drop' | 'leaf' | 'bolt' | 'shard' | 'rock' | 'star' | 'spark' | 'note' | 'spike'
  | 'heart' | 'bubble' | 'feather' | 'crescent' | 'eye' | 'gear' | 'web' | 'blob' | 'snow' | 'fist'
  | 'wind' | 'ring' | 'arrow' | 'dot' | 'wisp' | 'bone' | 'petal';

type G = CanvasRenderingContext2D;

function poly(g: G, points: number[][], fill: string) {
  g.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? g.moveTo(x!, y!) : g.lineTo(x!, y!)));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

function circle(g: G, x: number, y: number, r: number, fill: string) {
  g.beginPath();
  g.arc(x, y, Math.max(0.3, r), 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

/** Desenha uma forma centrada em (x, y). `s` é o "raio" em pixels lógicos e `rot` o ângulo em radianos. */
export function drawGlyph(g: G, kind: GlyphKind, x: number, y: number, s: number, rot: number, pal: Palette, alpha = 1) {
  if (alpha <= 0.01 || s <= 0.2) return;
  g.save();
  g.globalAlpha *= Math.min(1, alpha);
  g.translate(x, y);
  g.rotate(rot);
  switch (kind) {
    case 'orb':
      circle(g, 0, 0, s, pal.dark);
      circle(g, 0, 0, s * 0.8, pal.mid);
      circle(g, -s * 0.22, -s * 0.22, s * 0.42, pal.light);
      break;
    case 'dot':
      circle(g, 0, 0, s, pal.light);
      break;
    case 'flame': {
      const drop = (k: number, fill: string) => {
        g.beginPath();
        g.moveTo(0, -1.4 * s * k);
        g.quadraticCurveTo(0.9 * s * k, -0.2 * s * k, 0.7 * s * k, 0.45 * s * k);
        g.quadraticCurveTo(0.4 * s * k, 1.05 * s * k, 0, 1.05 * s * k);
        g.quadraticCurveTo(-0.4 * s * k, 1.05 * s * k, -0.7 * s * k, 0.45 * s * k);
        g.quadraticCurveTo(-0.9 * s * k, -0.2 * s * k, 0, -1.4 * s * k);
        g.fillStyle = fill;
        g.fill();
      };
      drop(1, pal.dark);
      drop(0.74, pal.mid);
      drop(0.42, pal.light);
      break;
    }
    case 'drop': {
      const shape = (k: number, fill: string) => {
        g.beginPath();
        g.moveTo(0, -1.4 * s * k);
        g.quadraticCurveTo(0.75 * s * k, -0.1 * s * k, 0.8 * s * k, 0.35 * s * k);
        g.arc(0, 0.35 * s * k, 0.8 * s * k, 0, Math.PI);
        g.quadraticCurveTo(-0.75 * s * k, -0.1 * s * k, 0, -1.4 * s * k);
        g.fillStyle = fill;
        g.fill();
      };
      shape(1, pal.dark);
      shape(0.8, pal.mid);
      circle(g, -0.25 * s, 0.35 * s, s * 0.22, pal.light);
      break;
    }
    case 'leaf': {
      const shape = (k: number, fill: string) => {
        g.beginPath();
        g.moveTo(-1.3 * s * k, 0);
        g.quadraticCurveTo(0, -1.05 * s * k, 1.3 * s * k, 0);
        g.quadraticCurveTo(0, 1.05 * s * k, -1.3 * s * k, 0);
        g.fillStyle = fill;
        g.fill();
      };
      shape(1, pal.dark);
      shape(0.82, pal.mid);
      g.strokeStyle = pal.light;
      g.lineWidth = Math.max(0.6, s * 0.14);
      g.beginPath();
      g.moveTo(-1.1 * s, 0);
      g.lineTo(1.0 * s, 0);
      g.stroke();
      break;
    }
    case 'petal': {
      g.beginPath();
      g.moveTo(0, 1.1 * s);
      g.quadraticCurveTo(1.0 * s, 0, 0, -1.2 * s);
      g.quadraticCurveTo(-1.0 * s, 0, 0, 1.1 * s);
      g.fillStyle = pal.mid;
      g.fill();
      circle(g, 0, -0.2 * s, s * 0.3, pal.light);
      break;
    }
    case 'bolt': {
      const pts = [[0.35, -1.5], [-0.75, 0.1], [-0.05, 0.1], [-0.4, 1.5], [0.8, -0.35], [0.1, -0.35]];
      poly(g, pts.map(([a, b]) => [a! * s * 1.15, b! * s * 1.15]), pal.dark);
      poly(g, pts.map(([a, b]) => [a! * s * 0.85, b! * s * 0.85]), pal.mid);
      poly(g, pts.map(([a, b]) => [a! * s * 0.45 - s * 0.05, b! * s * 0.5]), pal.light);
      break;
    }
    case 'shard': {
      poly(g, [[0, -1.5 * s], [0.6 * s, 0], [0, 1.5 * s], [-0.6 * s, 0]], pal.dark);
      poly(g, [[0, -1.3 * s], [0.46 * s, 0], [0, 1.3 * s], [-0.46 * s, 0]], pal.mid);
      poly(g, [[0, -1.2 * s], [0.14 * s, -0.1 * s], [0, 1.0 * s], [-0.3 * s, -0.1 * s]], pal.light);
      break;
    }
    case 'rock': {
      const pts = [[-1, -0.3], [-0.5, -0.95], [0.4, -1], [1, -0.2], [0.8, 0.7], [-0.1, 1], [-0.9, 0.6]];
      poly(g, pts.map(([a, b]) => [a! * s, b! * s]), pal.dark);
      poly(g, pts.map(([a, b]) => [a! * s * 0.78, b! * s * 0.78]), pal.mid);
      poly(g, [[-0.5, -0.5], [0.15, -0.65], [0.3, -0.1], [-0.35, 0.1]].map(([a, b]) => [a! * s, b! * s]), pal.light);
      break;
    }
    case 'star': {
      const pts: number[][] = [];
      for (let i = 0; i < 10; i += 1) {
        const r = i % 2 === 0 ? 1.35 * s : 0.58 * s;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      poly(g, pts, pal.dark);
      poly(g, pts.map(([a, b]) => [a! * 0.72, b! * 0.72]), pal.mid);
      circle(g, 0, 0, s * 0.22, pal.light);
      break;
    }
    case 'spark': {
      const pts = [[0, -1.5], [0.22, -0.22], [1.5, 0], [0.22, 0.22], [0, 1.5], [-0.22, 0.22], [-1.5, 0], [-0.22, -0.22]];
      poly(g, pts.map(([a, b]) => [a! * s, b! * s]), pal.light);
      circle(g, 0, 0, s * 0.3, pal.glow);
      break;
    }
    case 'note': {
      circle(g, -0.35 * s, 0.75 * s, s * 0.5, pal.dark);
      circle(g, -0.35 * s, 0.75 * s, s * 0.34, pal.mid);
      g.strokeStyle = pal.dark;
      g.lineWidth = Math.max(0.8, s * 0.22);
      g.beginPath();
      g.moveTo(0.05 * s, 0.6 * s);
      g.lineTo(0.05 * s, -1.3 * s);
      g.lineTo(0.9 * s, -0.7 * s);
      g.stroke();
      break;
    }
    case 'spike':
      poly(g, [[0, -1.5 * s], [0.62 * s, 1.1 * s], [-0.62 * s, 1.1 * s]], pal.dark);
      poly(g, [[0, -1.25 * s], [0.42 * s, 1.0 * s], [-0.42 * s, 1.0 * s]], pal.mid);
      poly(g, [[0, -1.1 * s], [0.12 * s, 0.9 * s], [-0.24 * s, 0.9 * s]], pal.light);
      break;
    case 'heart': {
      const shape = (k: number, fill: string) => {
        g.beginPath();
        g.moveTo(0, 1.1 * s * k);
        g.bezierCurveTo(-1.5 * s * k, 0.1 * s * k, -0.9 * s * k, -1.1 * s * k, 0, -0.4 * s * k);
        g.bezierCurveTo(0.9 * s * k, -1.1 * s * k, 1.5 * s * k, 0.1 * s * k, 0, 1.1 * s * k);
        g.fillStyle = fill;
        g.fill();
      };
      shape(1, pal.dark);
      shape(0.82, pal.mid);
      circle(g, -0.45 * s, -0.25 * s, s * 0.2, pal.light);
      break;
    }
    case 'bubble':
      g.globalAlpha *= 0.55;
      circle(g, 0, 0, s, pal.mid);
      g.globalAlpha /= 0.55;
      g.strokeStyle = pal.light;
      g.lineWidth = Math.max(0.7, s * 0.14);
      g.beginPath();
      g.arc(0, 0, s, 0, Math.PI * 2);
      g.stroke();
      circle(g, -s * 0.35, -s * 0.35, s * 0.2, pal.light);
      break;
    case 'feather': {
      g.beginPath();
      g.moveTo(-1.5 * s, 0.2 * s);
      g.quadraticCurveTo(-0.2 * s, -1.1 * s, 1.5 * s, -0.1 * s);
      g.quadraticCurveTo(0.1 * s, 0.9 * s, -1.5 * s, 0.2 * s);
      g.fillStyle = pal.light;
      g.fill();
      g.strokeStyle = pal.mid;
      g.lineWidth = Math.max(0.6, s * 0.16);
      g.stroke();
      break;
    }
    case 'crescent': {
      g.beginPath();
      g.arc(0, 0, 1.4 * s, -Math.PI * 0.62, Math.PI * 0.62);
      g.arc(-0.55 * s, 0, 1.2 * s, Math.PI * 0.55, -Math.PI * 0.55, true);
      g.closePath();
      g.fillStyle = pal.dark;
      g.fill();
      g.beginPath();
      g.arc(0.05 * s, 0, 1.2 * s, -Math.PI * 0.55, Math.PI * 0.55);
      g.arc(-0.5 * s, 0, 1.0 * s, Math.PI * 0.5, -Math.PI * 0.5, true);
      g.closePath();
      g.fillStyle = pal.light;
      g.fill();
      break;
    }
    case 'eye': {
      g.beginPath();
      g.moveTo(-1.5 * s, 0);
      g.quadraticCurveTo(0, -1.4 * s, 1.5 * s, 0);
      g.quadraticCurveTo(0, 1.4 * s, -1.5 * s, 0);
      g.fillStyle = pal.dark;
      g.fill();
      g.beginPath();
      g.moveTo(-1.3 * s, 0);
      g.quadraticCurveTo(0, -1.15 * s, 1.3 * s, 0);
      g.quadraticCurveTo(0, 1.15 * s, -1.3 * s, 0);
      g.fillStyle = pal.light;
      g.fill();
      circle(g, 0, 0, s * 0.62, pal.mid);
      circle(g, 0, 0, s * 0.3, pal.dark);
      break;
    }
    case 'gear': {
      const teeth = 8;
      const pts: number[][] = [];
      for (let i = 0; i < teeth * 2; i += 1) {
        const a = (i * Math.PI) / teeth;
        const r = i % 2 === 0 ? 1.25 * s : 0.9 * s;
        pts.push([Math.cos(a) * r, Math.sin(a) * r], [Math.cos(a + Math.PI / (teeth * 2.4)) * r, Math.sin(a + Math.PI / (teeth * 2.4)) * r]);
      }
      poly(g, pts, pal.dark);
      circle(g, 0, 0, s * 0.8, pal.mid);
      circle(g, 0, 0, s * 0.32, pal.dark);
      circle(g, -s * 0.3, -s * 0.3, s * 0.18, pal.light);
      break;
    }
    case 'web': {
      g.strokeStyle = pal.light;
      g.lineWidth = Math.max(0.6, s * 0.12);
      for (let i = 0; i < 8; i += 1) {
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos((i * Math.PI) / 4) * s * 1.3, Math.sin((i * Math.PI) / 4) * s * 1.3);
        g.stroke();
      }
      for (const k of [0.4, 0.75, 1.1]) {
        g.beginPath();
        for (let i = 0; i <= 8; i += 1) {
          const a = (i * Math.PI) / 4;
          const r = s * k * (i % 2 === 0 ? 1 : 0.88);
          if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.stroke();
      }
      break;
    }
    case 'blob': {
      const pts: number[][] = [];
      for (let i = 0; i < 10; i += 1) {
        const a = (i * Math.PI * 2) / 10;
        const r = s * (0.8 + 0.28 * Math.sin(i * 2.3 + 1));
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      poly(g, pts, pal.dark);
      poly(g, pts.map(([a, b]) => [a! * 0.8, b! * 0.8]), pal.mid);
      circle(g, -s * 0.28, -s * 0.28, s * 0.22, pal.light);
      circle(g, s * 0.3, s * 0.2, s * 0.12, pal.light);
      break;
    }
    case 'snow': {
      g.strokeStyle = pal.light;
      g.lineWidth = Math.max(0.7, s * 0.2);
      for (let i = 0; i < 3; i += 1) {
        const a = (i * Math.PI) / 3;
        g.beginPath();
        g.moveTo(Math.cos(a) * s * 1.3, Math.sin(a) * s * 1.3);
        g.lineTo(-Math.cos(a) * s * 1.3, -Math.sin(a) * s * 1.3);
        g.stroke();
      }
      circle(g, 0, 0, s * 0.3, pal.mid);
      break;
    }
    case 'fist': {
      g.fillStyle = pal.dark;
      g.beginPath();
      g.roundRect(-1.1 * s, -0.9 * s, 2.2 * s, 1.8 * s, s * 0.45);
      g.fill();
      g.fillStyle = pal.mid;
      g.beginPath();
      g.roundRect(-0.9 * s, -0.7 * s, 1.8 * s, 1.4 * s, s * 0.35);
      g.fill();
      g.strokeStyle = pal.dark;
      g.lineWidth = Math.max(0.6, s * 0.12);
      for (const k of [-0.3, 0.3]) {
        g.beginPath();
        g.moveTo(k * s, -0.6 * s);
        g.lineTo(k * s, 0.1 * s);
        g.stroke();
      }
      circle(g, -0.5 * s, -0.45 * s, s * 0.2, pal.light);
      break;
    }
    case 'wind': {
      g.strokeStyle = pal.light;
      g.lineCap = 'round';
      g.lineWidth = Math.max(0.8, s * 0.2);
      g.beginPath();
      g.moveTo(-1.5 * s, -0.4 * s);
      g.bezierCurveTo(-0.5 * s, -1.0 * s, 0.9 * s, -0.8 * s, 0.9 * s, -0.1 * s);
      g.bezierCurveTo(0.9 * s, 0.35 * s, 0.2 * s, 0.4 * s, 0.25 * s, 0);
      g.stroke();
      g.strokeStyle = pal.mid;
      g.beginPath();
      g.moveTo(-1.3 * s, 0.5 * s);
      g.bezierCurveTo(-0.3 * s, 0.1 * s, 0.7 * s, 0.4 * s, 1.5 * s, 0.9 * s);
      g.stroke();
      break;
    }
    case 'ring':
      g.strokeStyle = pal.dark;
      g.lineWidth = Math.max(1, s * 0.34);
      g.beginPath();
      g.arc(0, 0, s, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = pal.light;
      g.lineWidth = Math.max(0.6, s * 0.16);
      g.stroke();
      break;
    case 'arrow': {
      poly(g, [[0, -1.3 * s], [1.0 * s, -0.1 * s], [0.4 * s, -0.1 * s], [0.4 * s, 1.2 * s], [-0.4 * s, 1.2 * s], [-0.4 * s, -0.1 * s], [-1.0 * s, -0.1 * s]], pal.dark);
      poly(g, [[0, -1.0 * s], [0.7 * s, -0.1 * s], [0.22 * s, -0.1 * s], [0.22 * s, 0.95 * s], [-0.22 * s, 0.95 * s], [-0.22 * s, -0.1 * s], [-0.7 * s, -0.1 * s]], pal.light);
      break;
    }
    case 'wisp': {
      g.beginPath();
      g.moveTo(0, -1.5 * s);
      g.quadraticCurveTo(1.0 * s, -0.2 * s, 0.85 * s, 0.5 * s);
      g.quadraticCurveTo(0.7 * s, 1.2 * s, 0, 1.0 * s);
      g.quadraticCurveTo(-0.7 * s, 1.2 * s, -0.85 * s, 0.5 * s);
      g.quadraticCurveTo(-1.0 * s, -0.2 * s, 0, -1.5 * s);
      g.fillStyle = pal.mid;
      g.fill();
      circle(g, -0.3 * s, 0.1 * s, s * 0.16, pal.dark);
      circle(g, 0.3 * s, 0.1 * s, s * 0.16, pal.dark);
      break;
    }
    case 'bone': {
      g.strokeStyle = pal.dark;
      g.lineCap = 'round';
      g.lineWidth = Math.max(1.4, s * 0.55);
      g.beginPath();
      g.moveTo(-s, 0);
      g.lineTo(s, 0);
      g.stroke();
      g.strokeStyle = pal.light;
      g.lineWidth = Math.max(0.8, s * 0.32);
      g.stroke();
      for (const [bx, by] of [[-1.1, -0.35], [-1.1, 0.35], [1.1, -0.35], [1.1, 0.35]]) circle(g, bx! * s, by! * s, s * 0.34, pal.light);
      break;
    }
  }
  g.restore();
}
