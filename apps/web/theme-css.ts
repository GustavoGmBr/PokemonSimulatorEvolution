// Plugin do PostCSS que dá aos estilos duas coisas sem mexer nos arquivos .css:
//
// 1. Temas de cor. Cada cor hexadecimal de fundo, texto ou borda vira `var(--c-<papel>-<cor>, <cor>)`, e no fim do arquivo
//    são escritas as cores de cada tema (`html[data-theme="noturno"] { --c-bg-fbfcf7: …; }`). Cores novas que alguém
//    escrever nos .css entram nos temas sozinhas. O tema padrão (Floresta) não precisa de nada: vale a cor do fallback.
// 2. Velocidade das animações. As durações de `animation` e `transition` são divididas por `--anim-speed`, que o
//    jogo ajusta em Opções (1 = normal).
import type { Declaration, Document, Helpers, Plugin, Root } from 'postcss';

type Role = 'bg' | 'fg' | 'bd';
type Rgba = { r: number; g: number; b: number; a: number };
type Hsl = { h: number; s: number; l: number };

const roleOf = (prop: string): Role | null => {
  if (/^background(-color|-image)?$/.test(prop)) return 'bg';
  if (/^(color|fill|stroke|caret-color|text-decoration-color)$/.test(prop)) return 'fg';
  if (/^(border(-(top|right|bottom|left|inline|block))?(-color)?|outline(-color)?|column-rule(-color)?)$/.test(prop)) return 'bd';
  return null;
};

/** Lê "#rgb", "#rrggbb", "#rrggbbaa", "rgb(r g b / a)" e "rgba(r, g, b, a)"; qualquer outra coisa (porcentagens em rgb) volta null. */
function parseColor(value: string): Rgba | null {
  if (value.startsWith('#')) return parseHex(value);
  const parts = value.slice(value.indexOf('(') + 1, -1).trim().split(/\s*[\s,/]\s*/);
  if (parts.length < 3 || parts.length > 4 || parts.some((part) => part.includes('%') && parts.indexOf(part) < 3)) return null;
  const [r, g, b] = parts.slice(0, 3).map(Number) as [number, number, number];
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3]);
  if ([r, g, b, alpha].some((n) => !Number.isFinite(n))) return null;
  const channel = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
  return { r: channel(r), g: channel(g), b: channel(b), a: Math.round(Math.min(1, Math.max(0, alpha)) * 255) };
}

function parseHex(hex: string): Rgba | null {
  let digits = hex.slice(1);
  if (digits.length === 3) digits = [...digits].map((c) => c + c).join('');
  if (digits.length !== 6 && digits.length !== 8) return null;
  const n = (i: number) => parseInt(digits.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) : 255 };
}

function toHsl({ r, g, b }: Rgba): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255] as const;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function fromHsl({ h, s, l }: Hsl, a: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}${a === 255 ? '' : hex(a / 255)}`;
}

/** Só as cores esverdeadas (a paleta do jogo) e os neutros mudam de tema; amarelos, vermelhos e azuis de alerta ficam. */
const isPalette = ({ h, s }: Hsl) => s < 0.06 || (h >= 60 && h <= 170);

const hueThemes: Record<string, { hue: number; saturation: number }> = {
  oceano: { hue: 212, saturation: 1 },
  vulcao: { hue: 6, saturation: 1.05 },
  eletrico: { hue: 46, saturation: 1.1 },
};

/** Cor de um papel (fundo, texto, borda) em um tema; null = não muda. */
function themed(theme: string, role: Role, rgba: Rgba): string | null {
  const hsl = toHsl(rgba);
  if (!isPalette(hsl)) return null;
  if (theme === 'noturno') {
    // Escurece o que é claro e clareia o texto escuro; o que já é escuro (cartões, menu) continua como está.
    // Claros muito saturados em HSL viram escuros esverdeados demais: a saturação cai junto com a luz.
    if (role === 'bg' && hsl.l > 0.75) return fromHsl({ h: hsl.h, s: Math.min(hsl.s * 0.3, 0.14), l: 0.085 + (1 - hsl.l) * 0.62 }, rgba.a);
    if (role === 'fg' && hsl.l < 0.55) return fromHsl({ h: hsl.h, s: Math.min(hsl.s * 0.5, 0.2), l: 0.96 - hsl.l * 0.65 }, rgba.a);
    if (role === 'bd' && hsl.l > 0.65) return fromHsl({ h: hsl.h, s: Math.min(hsl.s * 0.3, 0.14), l: 0.085 + (1 - hsl.l) * 0.9 }, rgba.a);
    return null;
  }
  const target = hueThemes[theme];
  if (!target || hsl.s < 0.02) return null;
  return fromHsl({ h: target.hue + (hsl.h - 105) * 0.25, s: Math.min(1, hsl.s * target.saturation), l: hsl.l }, rgba.a);
}

export const cssThemes = ['oceano', 'vulcao', 'eletrico', 'noturno'] as const;

// Cores em hexadecimal e em rgb()/rgba() (com vírgulas ou a sintaxe nova "rgb(20 28 20 / .8)").
const colorPattern = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])|rgba?\(\s*\d{1,3}(?:\.\d+)?%?[\s,]+\d{1,3}(?:\.\d+)?%?[\s,]+\d{1,3}(?:\.\d+)?%?(?:\s*[,/]\s*\d*\.?\d+%?)?\s*\)/g;
const timePattern = /(?<![\w.#-])(\d*\.?\d+)(ms|s)(?![\w-])/g;
const durationProps = /^(animation|animation-duration|animation-delay|transition|transition-duration|transition-delay)$/;

/** Uma regra com a declaração `--theme-keep: 1` também mantém as próprias cores (ex.: legenda sobre a foto). Um .css cujo primeiro comentário é `theme-css: off` fica com as cores que tem (cenas de jogo, como a batalha, que não mudam de tema). */
const themeOff = new WeakMap<Root, boolean>();
function isThemeOff(decl: Declaration): boolean {
  let keep = false;
  decl.parent?.each((node) => { if (node.type === 'decl' && node.prop === '--theme-keep') keep = true; });
  if (keep) return true;
  const root = decl.root();
  let off = themeOff.get(root);
  if (off === undefined) {
    const first = root.first;
    off = first?.type === 'comment' && /theme-css:\s*off/.test(first.text);
    themeOff.set(root, off);
  }
  return off;
}

export function themeCss(): Plugin {
  const used = new Map<string, { role: Role; color: string }>();
  return {
    postcssPlugin: 'pokesim-theme-css',
    Declaration(decl: Declaration) {
      const { prop } = decl;
      if (prop.startsWith('--') || decl.value.includes('var(--c-')) return;
      for (let node: Declaration['parent'] | Document | undefined = decl.parent; node; node = (node as { parent?: typeof node }).parent) {
        if ((node.type === 'rule' && /^(:root|html)\b/.test(node.selector)) || (node.type === 'atrule' && node.name === 'theme')) return;
      }

      if (durationProps.test(prop)) {
        if (!/(var|calc)\(/.test(decl.value)) decl.value = decl.value.replace(timePattern, 'calc($1$2 / var(--anim-speed, 1))');
        return;
      }
      const role = roleOf(prop);
      if (!role || isThemeOff(decl)) return;
      decl.value = decl.value.replace(colorPattern, (color) => {
        const rgba = parseColor(color);
        if (!rgba) return color;
        // O nome da variável vem dos canais já lidos, então "#fff" e "rgb(255 255 255)" dividem a mesma cor de cada tema.
        const hex = [rgba.r, rgba.g, rgba.b, rgba.a].map((n) => n.toString(16).padStart(2, '0')).join('');
        const name = `${role}-${hex}`;
        used.set(name, { role, color });
        return `var(--c-${name}, ${color})`;
      });
    },
    OnceExit(root: Root, { Rule, Declaration: NewDeclaration }: Helpers) {
      if (used.size === 0) return;
      for (const theme of cssThemes) {
        const rule = new Rule({ selector: `html[data-theme="${theme}"]` });
        for (const [name, { role, color }] of used) {
          const rgba = parseColor(color);
          const value = rgba && themed(theme, role, rgba);
          if (value) rule.append(new NewDeclaration({ prop: `--c-${name}`, value }));
        }
        root.append(rule);
      }
      used.clear();
    },
  };
}
