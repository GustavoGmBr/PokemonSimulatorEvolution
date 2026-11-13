#!/usr/bin/env python3
"""Gera as imagens dos 9 mapas de selvagens (pixel art) e a máscara de áreas onde os Pokémon podem ficar.

Uso (na raiz do projeto): python scripts/gerar-mapas.py     (precisa do Pillow: pip install pillow)
Saída: recursos/Mapas/<id>.png e packages/data/catalog/wild-maps-grid.json (grade de tiles andáveis).

Cada mapa tem 48x28 tiles de 16 px, ampliados 3x sem suavizar (2304x1344).
"""
import json
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

T = 16          # pixels por tile
S = 2           # fator de tamanho em relação ao desenho original de 24x14 tiles
W, H = 24 * S, 14 * S   # tiles
SCALE = 3
BORDER = 2      # espessura (em tiles) da faixa de borda que barra o jogador
ROOT = Path(__file__).resolve().parent.parent


def rgb(hexcolor, alpha=255):
    hexcolor = hexcolor.lstrip('#')
    return (int(hexcolor[0:2], 16), int(hexcolor[2:4], 16), int(hexcolor[4:6], 16), alpha)


class Board:
    def __init__(self, ident, seed):
        self.id = ident
        self.rng = random.Random(seed)
        self.img = Image.new('RGBA', (W * T, H * T), (0, 0, 0, 255))
        self.d = ImageDraw.Draw(self.img)
        self.blocked = [[False] * W for _ in range(H)]
        self.used = [[False] * W for _ in range(H)]
        # Tiles de água/lava: o jogador atravessa, mas os Pokémon selvagens não ficam ali.
        self.wet = [[False] * W for _ in range(H)]
        # Paredes e construções coladas na borda: só elas (e a faixa da borda) barram o jogador.
        self.wall = [[False] * W for _ in range(H)]

    # ---------- básicos ----------
    def px(self, x, y, color):
        if 0 <= x < W * T and 0 <= y < H * T:
            self.d.point((x, y), fill=color)

    def rect(self, x0, y0, x1, y1, color):
        self.d.rectangle((x0, y0, x1, y1), fill=color)

    def ellipse(self, cx, cy, rx, ry, fill, outline=None):
        self.d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=fill, outline=outline)

    def layer(self):
        return Image.new('RGBA', self.img.size, (0, 0, 0, 0))

    def composite(self, layer):
        self.img = Image.alpha_composite(self.img, layer)
        self.d = ImageDraw.Draw(self.img)

    def texture(self, colors, weights=None, detail=None, detail_chance=0.06, region=None):
        """Preenche o chão tile a tile com ruído de cores e pequenos detalhes."""
        x0, y0, x1, y1 = region or (0, 0, W * T, H * T)
        for y in range(y0, y1):
            for x in range(x0, x1):
                self.px(x, y, self.rng.choices(colors, weights)[0])
        if detail:
            for y in range(y0, y1):
                for x in range(x0, x1):
                    if self.rng.random() < detail_chance:
                        self.px(x, y, self.rng.choice(detail))

    def block(self, c0, r0, c1, r1):
        for r in range(max(0, r0), min(H, r1 + 1)):
            for c in range(max(0, c0), min(W, c1 + 1)):
                self.blocked[r][c] = True
                self.used[r][c] = True
                self.wet[r][c] = False

    def structure(self, c0, r0, c1, r1):
        """Construção que faz parte da borda do mapa (celeiro, capela, caverna de gelo...): sempre barra."""
        self.block(c0, r0, c1, r1)
        for r in range(max(0, r0), min(H, r1 + 1)):
            for c in range(max(0, c0), min(W, c1 + 1)):
                self.wall[r][c] = True

    def water(self, c0, r0, c1, r1):
        """Marca uma faixa de água: fora do alcance dos Pokémon, mas o jogador pode andar nela."""
        for r in range(max(0, r0), min(H, r1 + 1)):
            for c in range(max(0, c0), min(W, c1 + 1)):
                if not self.blocked[r][c]:
                    self.wet[r][c] = True
                self.blocked[r][c] = True
                self.used[r][c] = True

    def free(self, c0, r0, c1, r1, margin=0):
        for r in range(r0 - margin, r1 + 1 + margin):
            for c in range(c0 - margin, c1 + 1 + margin):
                if 0 <= r < H and 0 <= c < W and self.used[r][c]:
                    return False
        return True

    def spots(self, count, w=1, h=1, area=None, margin=0, tries=400):
        """Sorteia posições livres (em tiles) para decorações e as reserva."""
        c_lo, r_lo, c_hi, r_hi = area or (0, 0, W - 1, H - 1)
        found = []
        for _ in range(tries):
            if len(found) >= count:
                break
            c = self.rng.randint(c_lo, c_hi - w + 1)
            r = self.rng.randint(r_lo, r_hi - h + 1)
            if self.free(c, r, c + w - 1, r + h - 1, margin):
                for rr in range(r, r + h):
                    for cc in range(c, c + w):
                        self.used[rr][cc] = True
                found.append((c, r))
        return found

    def shadow(self, cx, cy, rx, ry, alpha=60):
        lay = self.layer()
        ImageDraw.Draw(lay).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=(0, 0, 0, alpha))
        self.composite(lay)

    # ---------- objetos ----------
    def round_tree(self, c, r, palette, size=2):
        """Árvore redonda; ocupa size x size tiles e marca só o tile da base (no interior ela não barra ninguém)."""
        dark, mid, light, trunk, outline = palette
        cx = c * T + (size * T) // 2
        base = (r + size) * T - 1
        self.shadow(cx, base - 1, size * 7, 3, 70)
        self.rect(cx - 2, base - 7, cx + 1, base - 1, rgb(trunk))
        self.rect(cx - 2, base - 7, cx - 2, base - 1, rgb('#3b2a1a'))
        rx, ry = size * 7, size * 6
        cy = base - 5 - ry
        self.ellipse(cx, cy, rx, ry, rgb(outline))
        self.ellipse(cx, cy, rx - 1, ry - 1, rgb(dark))
        self.ellipse(cx - 1, cy - 1, rx - 3, ry - 3, rgb(mid))
        self.ellipse(cx - 3, cy - 3, rx // 2, ry // 2 - 1, rgb(light))
        for _ in range(size * 4):
            x = cx + self.rng.randint(-rx + 3, rx - 3)
            y = cy + self.rng.randint(-ry + 3, ry - 3)
            self.px(x, y, rgb(dark))
        self.block(c, r + size - 1, c + size - 1, r + size - 1)

    def pine(self, c, r, snow=False, size=2):
        cx = c * T + (size * T) // 2
        base = (r + size) * T - 2
        self.shadow(cx, base - 1, size * 6, 3, 70)
        self.rect(cx - 1, base - 4, cx + 1, base - 1, rgb('#4a3322'))
        body = [('#1f5a3a', '#12402a'), ('#2a7048', '#1a5436'), ('#35855a', '#236a45')]
        for i in range(3):
            y1 = base - 3 - i * (size * 4)
            half = size * 7 - i * size * 2
            col, edge = body[i]
            self.d.polygon([(cx, y1 - size * 6), (cx - half, y1), (cx + half, y1)], fill=rgb(edge))
            self.d.polygon([(cx, y1 - size * 6 + 2), (cx - half + 2, y1 - 1), (cx + half - 2, y1 - 1)], fill=rgb(col))
            if snow:
                self.d.polygon([(cx, y1 - size * 6), (cx - half // 2 - 1, y1 - size * 3), (cx + half // 2 + 1, y1 - size * 3)],
                               fill=rgb('#f4fbff'))
                self.rect(cx - half + 1, y1 - 2, cx + half - 1, y1 - 1, rgb('#e3f1fa'))
        self.block(c, r + size - 1, c + size - 1, r + size - 1)

    def bush(self, c, r, palette):
        dark, mid, light = palette
        cx, cy = c * T + 8, r * T + 9
        self.shadow(cx, cy + 5, 7, 2, 60)
        self.ellipse(cx, cy, 7, 5, rgb(dark))
        self.ellipse(cx - 1, cy - 1, 6, 4, rgb(mid))
        self.ellipse(cx - 2, cy - 2, 3, 2, rgb(light))
        self.block(c, r, c, r)

    def rock(self, c, r, palette, big=False):
        dark, mid, light = palette
        s = 2 if big else 1
        cx, cy = c * T + (s * T) // 2, r * T + (s * T) // 2 + 2
        rx, ry = (s * 6) + 1, (s * 4) + 2
        self.shadow(cx, cy + ry - 1, rx, 2, 70)
        self.ellipse(cx, cy, rx, ry, rgb(dark))
        self.ellipse(cx - 1, cy - 1, rx - 1, ry - 1, rgb(mid))
        self.ellipse(cx - 2, cy - 2, max(2, rx // 2), max(1, ry // 2), rgb(light))
        self.block(c, r, c + s - 1, r + s - 1)

    def flower(self, c, r, color):
        x, y = c * T + self.rng.randint(3, 11), r * T + self.rng.randint(3, 11)
        self.px(x, y + 1, rgb('#2f7a3a'))
        self.px(x, y + 2, rgb('#2f7a3a'))
        for dx, dy in ((0, 0), (-1, 0), (1, 0), (0, -1)):
            self.px(x + dx, y + dy, rgb(color))
        self.px(x, y, rgb('#ffe27a'))

    def mushroom(self, c, r, cap='#c0392b', dots='#ffffff', scale=1):
        cx, cy = c * T + 8, r * T + 9
        self.shadow(cx, cy + 4, 4 * scale, 2, 60)
        self.rect(cx - scale, cy, cx + scale, cy + 4 * scale, rgb('#efe3c8'))
        self.ellipse(cx, cy, 5 * scale, 3 * scale, rgb(cap))
        self.d.rectangle((cx - 5 * scale, cy, cx + 5 * scale, cy + scale), fill=rgb(cap))
        for dx, dy in ((-2, -1), (2, -1), (0, -2)):
            self.px(cx + dx * scale, cy + dy * scale, rgb(dots))
        self.block(c, r, c, r)

    def crate(self, c, r, color='#8a5a2b'):
        x, y = c * T + 2, r * T + 3
        self.rect(x, y, x + 11, y + 11, rgb('#4a2d12'))
        self.rect(x + 1, y + 1, x + 10, y + 10, rgb(color))
        self.d.line((x + 1, y + 1, x + 10, y + 10), fill=rgb('#5e3b18'))
        self.d.line((x + 10, y + 1, x + 1, y + 10), fill=rgb('#5e3b18'))
        self.block(c, r, c, r)

    def liquid(self, shapes, painter, edge, rim=None, block_ratio=0.3):
        """Pinta uma poça de contorno orgânico (união de elipses com ondulação) e bloqueia os tiles cobertos.

        shapes: lista de (cx, cy, rx, ry) em pixels; painter(x, y) -> cor; edge: cor da borda interna;
        rim: cor opcional de um anel externo.
        """
        phase = self.rng.random() * 6.28

        def inside(x, y, grow=0.0):
            for cx, cy, rx, ry in shapes:
                dx, dy = (x - cx) / rx, (y - cy) / ry
                ang = math.atan2(dy, dx)
                wob = 0.10 * math.sin(ang * 3 + phase) + 0.06 * math.sin(ang * 5 + phase * 2)
                if dx * dx + dy * dy < (1.0 + wob + grow) ** 2:
                    return True
            return False

        xs = [cx - rx * 1.3 - 8 for cx, cy, rx, ry in shapes] + [cx + rx * 1.3 + 8 for cx, cy, rx, ry in shapes]
        ys = [cy - ry * 1.3 - 8 for cx, cy, rx, ry in shapes] + [cy + ry * 1.3 + 8 for cx, cy, rx, ry in shapes]
        x0, x1, y0, y1 = max(0, int(min(xs))), min(W * T, int(max(xs))), max(0, int(min(ys))), min(H * T, int(max(ys)))
        mask = {(x, y) for y in range(y0, y1) for x in range(x0, x1) if inside(x, y)}
        if rim:
            for y in range(y0, y1):
                for x in range(x0, x1):
                    if (x, y) not in mask and inside(x, y, 0.12):
                        self.px(x, y, rim)
        for (x, y) in mask:
            border = any((x + dx, y + dy) not in mask for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            self.px(x, y, edge if border else painter(x, y))
        for r in range(H):
            for c in range(W):
                covered = sum((c * T + i, r * T + j) in mask for i in range(T) for j in range(T))
                if covered >= block_ratio * T * T:
                    self.used[r][c] = True
                # Só bloqueia o tile se a água/lava cobre a maior parte dele: sem "paredes invisíveis" na beirada.
                if covered >= max(block_ratio, 0.55) * T * T:
                    if not self.blocked[r][c]:
                        self.wet[r][c] = True
                    self.blocked[r][c] = True
        return mask

    def finish(self):
        # Só a borda barra: a faixa externa do mapa e as paredes/construções coladas nela.
        # Árvores, pedras, troncos e demais objetos do interior não bloqueiam ninguém.
        def solid(r, c):
            return (self.blocked[r][c] and self.wall[r][c]) or min(c, W - 1 - c, r, H - 1 - r) < BORDER

        walk = [[not solid(r, c) and not self.wet[r][c] for c in range(W)] for r in range(H)]
        swim = [[self.wet[r][c] and self.blocked[r][c] and not solid(r, c) for c in range(W)] for r in range(H)]
        out = self.img.convert('RGB').resize((W * T * SCALE, H * T * SCALE), Image.NEAREST)
        path = ROOT / 'recursos' / 'Mapas' / f'{self.id}.png'
        path.parent.mkdir(parents=True, exist_ok=True)
        out.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(path, optimize=True)
        return walk, swim


def border_spots(step=2, inset=0):
    """Posições (c, r) de árvores 2x2 ao longo das quatro bordas do mapa."""
    out = []
    for c in range(inset, W - 1 - inset, step):
        out += [(c, inset), (c, H - 2 - inset)]
    for r in range(inset + step, H - 2 - inset - step + 1, step):
        out += [(inset, r), (W - 2 - inset, r)]
    return out


# ---------- paletas ----------
TREE_GREEN = ('#2a6b32', '#3f9142', '#6cc35a', '#6b4423', '#15381a')
TREE_FOREST = ('#16492a', '#226b36', '#3f9449', '#4d3320', '#0a2614')
TREE_SWAMP = ('#2b3d33', '#3c5444', '#587a62', '#3a2c3a', '#141d18')
ROCK_GRAY = ('#4a4a52', '#76767f', '#a4a4ad')
ROCK_DARK = ('#26242a', '#403d46', '#605c68')
ROCK_BROWN = ('#4e3a2c', '#7a5d46', '#a3826a')
BUSH_GREEN = ('#2a6b32', '#3f9142', '#7dd061')


# ---------- 1. Campina ----------
def campina():
    b = Board('campina', 11)
    b.texture([rgb('#8fd06b'), rgb('#86c862'), rgb('#98d673')], [5, 3, 3],
              [rgb('#6fb653'), rgb('#b8e690')], 0.05)
    # caminho de terra em curva
    path = [(c * S, r * S) for c, r in [(0, 9), (3, 9), (5, 8), (8, 8), (10, 7), (12, 6), (14, 6), (16, 7), (19, 7), (21, 6), (23, 6)]]
    path += [(W - 1, 12 * S)]
    path2 = [(10 * S, 8 * S), (10 * S, 11 * S), (13 * S, 12 * S), (16 * S, 12 * S), (19 * S, 13 * S)]
    paths = [path, path2]
    for route in paths:
        for (c0, r0), (c1, r1) in zip(route, route[1:]):
            steps = max(abs(c1 - c0), abs(r1 - r0)) * T
            for i in range(steps + 1):
                x = c0 * T + (c1 - c0) * T * i / steps + 8
                y = r0 * T + (r1 - r0) * T * i / steps + 8
                for tc in (int(x) // T - 1, int(x) // T, int(x) // T + 1):
                    for tr in (int(y) // T - 1, int(y) // T, int(y) // T + 1):
                        if 0 <= tc < W and 0 <= tr < H:
                            b.used[tr][tc] = True
                for dy in range(-6, 7):
                    for dx in range(-6, 7):
                        if dx * dx + dy * dy <= 38:
                            b.px(int(x) + dx, int(y) + dy,
                                 b.rng.choice([rgb('#d9b87a'), rgb('#cfae6f'), rgb('#e3c58c')]))
    for y in range(H * T):
        for x in range(W * T):
            px = b.img.getpixel((x, y))
            if px[:3] in [(217, 184, 122), (207, 174, 111), (227, 197, 140)] and b.rng.random() < 0.05:
                b.px(x, y, rgb('#b8975b'))
    # celeiro
    bx, by = (W - 7) * T, 0 * T + 2
    b.shadow(bx + 28, by + 52, 34, 4, 70)
    b.rect(bx, by + 16, bx + 55, by + 50, rgb('#5a2a1a'))
    b.rect(bx + 1, by + 17, bx + 54, by + 49, rgb('#b5483a'))
    for x in range(bx + 5, bx + 54, 6):
        b.d.line((x, by + 17, x, by + 49), fill=rgb('#9a3a2e'))
    b.d.polygon([(bx - 4, by + 18), (bx + 28, by - 2), (bx + 60, by + 18)], fill=rgb('#3a2418'))
    b.d.polygon([(bx - 2, by + 17), (bx + 28, by + 1), (bx + 58, by + 17)], fill=rgb('#7d5a3c'))
    b.rect(bx + 20, by + 28, bx + 35, by + 50, rgb('#3a2418'))
    b.rect(bx + 21, by + 29, bx + 34, by + 49, rgb('#e8d8b0'))
    b.d.line((bx + 21, by + 29, bx + 34, by + 49), fill=rgb('#b5483a'))
    b.d.line((bx + 34, by + 29, bx + 21, by + 49), fill=rgb('#b5483a'))
    b.structure(W - 7, 0, W - 4, 3)
    # cercas
    for fx0, fx1, frow in [(2, 15, 11 * S), (34, 44, 22)]:
        fy = frow * T + 4
        for x in range(fx0 * T, fx1 * T, 4):
            b.rect(x, fy - 2, x + 1, fy + 8, rgb('#7a5632'))
        b.rect(fx0 * T, fy, fx1 * T, fy + 1, rgb('#a47a4a'))
        b.rect(fx0 * T, fy + 5, fx1 * T, fy + 6, rgb('#a47a4a'))
        b.block(fx0, frow, fx1 - 1, frow)
    # árvores
    for c, r in [(c * S, r * S) for c, r in [(0, 0), (2, 1), (5, 0), (8, 1), (12, 0), (22, 8), (21, 11), (0, 12), (13, 11), (10, 12)]]:
        if c + 2 <= W and r + 2 <= H and b.free(c, r + 1, c + 1, r + 1):
            b.round_tree(c, r, TREE_GREEN)
    for c, r in b.spots(26, w=2, h=2, margin=1):
        b.round_tree(c, r, TREE_GREEN)
    # flores
    for (c, r), col in zip(b.spots(26 * S * S, area=(0, 0, W - 1, H - 1)),
                           [b.rng.choice(['#ff6b8a', '#fff0a0', '#ffffff', '#ff9d5c', '#b48aff']) for _ in range(26 * S * S)]):
        b.flower(c, r, col)
        b.used[r][c] = False
    # arbustos
    for c, r in b.spots(5 * S * S, margin=1):
        b.bush(c, r, BUSH_GREEN)
    # sombras de nuvens
    lay = b.layer()
    ld = ImageDraw.Draw(lay)
    for _ in range(12):
        cx, cy, rx, ry = b.rng.randint(0, W * T), b.rng.randint(0, H * T), b.rng.randint(40, 70), b.rng.randint(16, 28)
        ld.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=(30, 70, 40, 34))
    b.composite(lay)
    return b.finish()


# ---------- 2. Floresta ----------
def floresta():
    b = Board('floresta', 22)
    b.texture([rgb('#2f7d3f'), rgb('#2a7339'), rgb('#358846')], [5, 4, 3],
              [rgb('#1f5a2d'), rgb('#4ca25a')], 0.06)
    # clareiras de grama alta
    for cx, cy, rx, ry in [(5 * S, 4 * S, 4, 3), (15 * S, 9 * S, 5, 3), (9 * S, 11 * S, 3, 2), (19 * S, 3 * S, 4, 3), (30, 20, 3, 2), (40, 12, 3, 2)]:
        for y in range((cy - ry) * T, (cy + ry + 1) * T):
            for x in range((cx - rx) * T, (cx + rx + 1) * T):
                if ((x - cx * T - 8) / (rx * T)) ** 2 + ((y - cy * T - 8) / (ry * T)) ** 2 < 0.9 and b.rng.random() < 0.55:
                    b.px(x, y, b.rng.choice([rgb('#1b5a2a'), rgb('#4fb25f'), rgb('#256b33')]))
    # tronco caído
    for lc, lr in [(18, 12), (34, 6), (8, 22), (38, 21)]:
        lx, ly = lc * T, lr * T + 2
        b.shadow(lx + 30, ly + 14, 30, 3, 70)
        b.rect(lx, ly, lx + 61, ly + 10, rgb('#2b1b10'))
        b.rect(lx + 1, ly + 1, lx + 60, ly + 9, rgb('#7a4f2e'))
        b.rect(lx + 1, ly + 1, lx + 60, ly + 3, rgb('#9a6a40'))
        for x in range(lx + 6, lx + 60, 9):
            b.d.line((x, ly + 2, x + 2, ly + 8), fill=rgb('#5a3a20'))
        b.ellipse(lx + 1, ly + 5, 3, 5, rgb('#d9b27a'), rgb('#5a3a20'))
        b.block(lc, lr, lc + 3, lr)
    # árvores densas nas bordas
    big = border_spots(2) + border_spots(3, 2)
    for c, r in big:
        if c + 2 <= W and r + 2 <= H and b.free(c, r, c + 1, r + 1):
            b.round_tree(c, r, TREE_FOREST)
    for c, r in b.spots(70, w=2, h=2, margin=1):
        b.round_tree(c, r, TREE_FOREST)
    for c, r in b.spots(8 * S * S, margin=0):
        b.bush(c, r, ('#1b5a2a', '#2f8a3f', '#5ec26a'))
    for c, r in b.spots(7 * S * S):
        b.mushroom(c, r, b.rng.choice(['#c0392b', '#e58a3a', '#d95a8a']))
    for c, r in b.spots(14 * S * S):
        b.flower(c, r, b.rng.choice(['#ffe27a', '#ffffff', '#ff8aa8']))
        b.used[r][c] = False
    # feixes de luz
    lay = b.layer()
    ld = ImageDraw.Draw(lay)
    for x0 in range(60, W * T + 100, 95):
        ld.polygon([(x0, 0), (x0 + 22, 0), (x0 - 40, H * T), (x0 - 70, H * T)], fill=(255, 245, 170, 26))
    b.composite(lay)
    return b.finish()


# ---------- 3. Litoral ----------
def litoral():
    b = Board('litoral', 33)
    sand_rows = 6 * S
    b.texture([rgb('#ecd9a0'), rgb('#e4cf92'), rgb('#f3e3b0')], [5, 3, 3], [rgb('#cdb676'), rgb('#fff3c8')], 0.05)
    # água: funda no alto, rasa perto da areia
    for y in range(0, sand_rows * T):
        for x in range(W * T):
            wave = math.sin(x / 9 + y / 5 + (x // 24 % 2)) + math.sin(y / 3.0)
            if y < 3 * S * T:
                col = '#1c5fa8' if wave < 1.1 else '#2a73bd'
            else:
                col = '#3a95d4' if wave < 1.0 else '#52aee4'
            b.px(x, y, rgb(col))
    # borda de espuma ondulada
    for x in range(W * T):
        edge = sand_rows * T + int(2 * math.sin(x / 7) + 1 * math.sin(x / 3))
        for dy in range(-1, 3):
            b.px(x, edge + dy, rgb('#ffffff') if dy in (0, 1) else rgb('#c9ecff'))
        for y in range(edge + 2, edge + 6):
            if b.rng.random() < 0.25:
                b.px(x, y, rgb('#7a6a40') if b.rng.random() < 0.3 else rgb('#d9c283'))
    # brilhos na água
    for _ in range(60):
        x, y = b.rng.randint(0, W * T - 3), b.rng.randint(0, sand_rows * T - 4)
        b.rect(x, y, x + 2, y, rgb('#d8f1ff'))
    # ilhotas ao fundo
    for ic, ir in [(40, 28), (12, 22), (26, 14)]:
        cx, cy = ic * T, ir
        rx, ry = 38, 16
        b.ellipse(cx, cy + 3, rx + 3, ry + 2, rgb('#bfe9ff'))
        b.ellipse(cx, cy + 2, rx, ry, rgb('#d9c283'))
        b.ellipse(cx, cy, rx - 4, ry - 4, rgb('#ecd9a0'))
        px, py = cx, cy - 10
        b.rect(px - 1, py - 14, px + 1, py + 6, rgb('#6b4a2a'))
        for ang in range(-2, 3):
            b.d.line((px, py - 14, px + ang * 7, py - 8 + abs(ang) * 2), fill=rgb('#2f8a3f'), width=2)
    # águas fundas (só o jogador atravessa)
    b.water(0, 0, W - 1, 3 * S - 1)
    # píer de madeira
    for pier in (8, 30):
        for c in range(pier, pier + 2):
            for r in range(2 * S, 2 * S + 10):
                x, y = c * T, r * T
                b.rect(x, y, x + T - 1, y + T - 1, rgb('#6b4423'))
                for k in range(0, T, 4):
                    b.rect(x, y + k, x + T - 1, y + k + 2, rgb('#a5743f'))
                    b.rect(x, y + k + 3, x + T - 1, y + k + 3, rgb('#3e2810'))
                b.used[r][c] = True
        for r in range(2 * S, 2 * S + 10, 2):
            b.rect(pier * T - 2, r * T + 3, pier * T, r * T + 12, rgb('#3e2810'))
            b.rect((pier + 2) * T, r * T + 3, (pier + 2) * T + 1, r * T + 12, rgb('#3e2810'))
    # rochas na maré, conchas, estrelas-do-mar
    for c, r in [(20, 8), (26, 10), (4, 16), (28, 18), (40, 9), (44, 20), (14, 24), (36, 25)]:
        b.rock(c, r, ROCK_GRAY if r < sand_rows else ROCK_BROWN)
    for c, r in b.spots(10 * S * S, area=(0, sand_rows + 1, W - 1, H - 1)):
        x, y = c * T + 5, r * T + 7
        b.ellipse(x, y, 3, 2, rgb('#f7b9c8'), rgb('#c97a92'))
        b.used[r][c] = False
    for c, r in b.spots(6 * S * S, area=(0, sand_rows + 1, W - 1, H - 1)):
        x, y = c * T + 8, r * T + 8
        for dx, dy in ((0, -3), (-3, 0), (3, 0), (0, 3), (0, 0), (-2, 2), (2, 2)):
            b.px(x + dx, y + dy, rgb('#e8743a'))
        b.used[r][c] = False
    def umbrella(c, r):
        ux, uy = c * T, r * T
        b.shadow(ux + 8, uy + 22, 18, 4, 60)
        b.rect(ux + 7, uy, ux + 8, uy + 22, rgb('#6b4a2a'))
        b.d.pieslice((ux - 14, uy - 10, ux + 30, uy + 22), 180, 360, fill=rgb(b.rng.choice(['#e8503a', '#3a8ae8', '#e8c53a'])))
        b.d.line((ux, uy + 6, ux + 15, uy - 8), fill=rgb('#ffffff'))
        b.d.line((ux + 15, uy - 8, ux + 30, uy + 6), fill=rgb('#ffffff'))
        b.block(c, r, c + 1, r + 1)
        for rr in range(r, r + 2):
            for cc in range(c, c + 2):
                b.used[rr][cc] = True

    def towel(c, r):
        tx, ty = c * T, r * T + 4
        b.rect(tx - 1, ty - 1, tx + 34, ty + 22, rgb('#3a3a5a'))
        for k in range(0, 34, 6):
            b.rect(tx + k, ty, tx + k + 2, ty + 21, rgb('#4aa0e0'))
            b.rect(tx + k + 3, ty, tx + k + 5, ty + 21, rgb('#ffffff'))
        b.block(c, r, c + 1, r + 1)
        for rr in range(r, r + 2):
            for cc in range(c, c + 3):
                b.used[rr][cc] = True

    def sandcastle(c, r):
        sx, sy = c * T + 2, r * T
        b.shadow(sx + 12, sy + 18, 16, 3, 50)
        b.rect(sx, sy + 6, sx + 23, sy + 17, rgb('#c9ae6a'))
        b.rect(sx + 1, sy + 7, sx + 22, sy + 16, rgb('#dcc07c'))
        for k in range(0, 24, 6):
            b.rect(sx + k, sy + 2, sx + k + 3, sy + 7, rgb('#dcc07c'))
            b.rect(sx + k, sy + 2, sx + k + 3, sy + 2, rgb('#f0d796'))
        b.rect(sx + 9, sy + 11, sx + 14, sy + 17, rgb('#8a7040'))
        b.rect(sx + 11, sy - 4, sx + 11, sy + 2, rgb('#6b4a2a'))
        b.rect(sx + 12, sy - 4, sx + 15, sy - 2, rgb('#e8503a'))
        b.block(c, r, c + 1, r)
        for cc in range(c, c + 2):
            b.used[r][cc] = True

    for c, r in [(36, 20), (22, 22), (44, 14), (14, 14)]:
        umbrella(c, r)
    for c, r in [(18, 20), (30, 24), (42, 24), (6, 24)]:
        towel(c, r)
    for c, r in [(6, 22), (24, 17), (34, 15)]:
        sandcastle(c, r)
    # algas na faixa de água rasa
    for c, r in b.spots(5 * S * S, area=(0, 3 * S, W - 1, 6 * S - 1)):
        x, y = c * T + 8, r * T + 14
        for k in range(3):
            b.d.line((x - 3 + k * 3, y, x - 3 + k * 3 + (k - 1) * 2, y - 8 - k % 2 * 3), fill=rgb('#2f8a5a'), width=1)
        b.used[r][c] = False
    return b.finish()


# ---------- 4. Vulcão ----------
def vulcao():
    b = Board('vulcao', 44)
    b.texture([rgb('#3a3338'), rgb('#332d31'), rgb('#443c40')], [5, 4, 3],
              [rgb('#241f22'), rgb('#5a4f52'), rgb('#6a5c58')], 0.07)
    # paredes de cânion laterais (camadas)
    for side in (0, 1):
        for r in range(H):
            width = 2 + (r * 3 % 3 if side == 0 else (r * 5) % 3) + (1 if r in (0, 1, H - 2, H - 1) else 0)
            for k in range(width):
                c = k if side == 0 else W - 1 - k
                x, y = c * T, r * T
                shade = ['#6a3d28', '#7d4a30', '#5a3220'][(r + k) % 3]
                b.rect(x, y, x + T - 1, y + T - 1, rgb(shade))
                for yy in range(y + 3, y + T, 5):
                    b.rect(x, yy, x + T - 1, yy, rgb('#3e2214'))
                for _ in range(5):
                    b.px(x + b.rng.randint(0, 15), y + b.rng.randint(0, 15), rgb('#a0623e'))
                b.blocked[r][c] = True
                b.wall[r][c] = True
                b.used[r][c] = True
    # lago de lava central, de contorno irregular
    def lava_color(x, y):
        n = math.sin(x / 5 + y / 7) + math.sin(x / 3.0) + math.sin(y / 4.0 + x / 11)
        if b.rng.random() < 0.035:
            return rgb('#ffe27a')
        return rgb('#ff7a1a') if n < 0.5 else (rgb('#ff9a2a') if n < 1.7 else rgb('#ffb347'))
    lava = b.liquid([(23 * T, 13.2 * T, 9.2 * T, 5.2 * T), (19 * T, 10.8 * T, 6.0 * T, 4.0 * T), (28.6 * T, 15.2 * T, 5.2 * T, 3.6 * T)],
                    lava_color, rgb('#c2410c'), rim=rgb('#5a2a1a'))
    for pool in [[(9 * T, 22 * T, 3.2 * T, 2.2 * T)], [(38 * T, 6 * T, 3.4 * T, 2.4 * T), (40 * T, 7.4 * T, 2.2 * T, 1.6 * T)], [(37 * T, 22 * T, 3.6 * T, 2.4 * T)]]:
        b.liquid(pool, lava_color, rgb('#c2410c'), rim=rgb('#5a2a1a'))
    # rachaduras brilhantes
    for c0, r0, steps in [(c * S, r * S, n) for c, r, n in [(4, 3, 5), (6, 11, 4), (18, 4, 5), (17, 11, 4), (12, 0, 3), (11, 12, 3)]] + [(16, 24, 5), (30, 3, 5), (44, 12, 4), (26, 26, 4), (8, 12, 4), (40, 26, 4)]:
        x, y = c0 * T + 8, r0 * T + 8
        for _ in range(steps * 6):
            for dx in (0, 1):
                b.px(x + dx, y, rgb('#ff6a1a'))
            b.px(x, y + 1, rgb('#ffb347'))
            x += b.rng.choice([-2, -1, 1, 2])
            y += b.rng.choice([-1, 0, 1, 1])
    for c, r in b.spots(7 * S * S, area=(3, 0, W - 4, H - 1), margin=0):
        if b.blocked[r][c]:
            continue
        b.rock(c, r, ROCK_DARK, big=b.rng.random() < 0.3 and b.free(c, r, c + 1, r + 1))
    # fumaça
    lay = b.layer()
    ld = ImageDraw.Draw(lay)
    for cx, cy, r in [(150, 14, 14), (165, 6, 18), (140, 2, 16), (220, 24, 12), (245, 14, 16), (200, 4, 12), (480, 20, 16), (500, 8, 18), (620, 30, 14), (330, 400, 14), (700, 330, 16)]:
        ld.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(180, 170, 170, 70))
    for cx, cy in [(360, 210), (400, 280), (620, 120), (300, 360), (590, 360)]:
        ld.ellipse((cx - 30, cy - 20, cx + 30, cy + 20), fill=(255, 120, 40, 18))
    b.composite(lay)
    return b.finish()


# ---------- 5. Caverna e mina ----------
def caverna():
    b = Board('caverna', 55)
    b.texture([rgb('#5d5148'), rgb('#554a42'), rgb('#665a50')], [5, 4, 3],
              [rgb('#41372f'), rgb('#7a6d62'), rgb('#8a7c6e')], 0.07)
    # paredes irregulares
    wall = set()
    for c in range(W):
        top = 1 + int(1.4 * math.sin(c * 0.9) + 0.8 * math.sin(c * 2.1))
        bottom = H - 2 - int(1.2 * math.sin(c * 1.1 + 1) + 0.6 * math.sin(c * 2.7))
        for r in range(0, top + 1):
            wall.add((c, r))
        for r in range(bottom, H):
            wall.add((c, r))
    for r in range(H):
        left = 1 + (1 if r % 3 == 0 else 0) + (1 if r in (0, 1, H - 2, H - 1) else 0)
        right = 1 + (1 if r % 4 == 1 else 0) + (1 if r in (0, 1, H - 2, H - 1) else 0)
        for c in range(left):
            wall.add((c, r))
        for c in range(W - right, W):
            wall.add((c, r))
    for (c, r) in wall:
        x, y = c * T, r * T
        for yy in range(T):
            for xx in range(T):
                b.px(x + xx, y + yy, b.rng.choice([rgb('#2b2522'), rgb('#332c28'), rgb('#3a322d')]))
        for _ in range(6):
            b.px(x + b.rng.randint(0, 15), y + b.rng.randint(0, 15), rgb('#4d433c'))
        if (c, r + 1) not in wall:
            b.rect(x, y + T - 3, x + T - 1, y + T - 1, rgb('#19151a'))
        b.blocked[r][c] = True
        b.wall[r][c] = True
        b.used[r][c] = True
    # veios de minério nas paredes
    for (c, r) in list(wall)[::7]:
        x, y = c * T + b.rng.randint(3, 11), r * T + b.rng.randint(3, 11)
        col = b.rng.choice(['#e8c547', '#c9d3dc', '#e8c547'])
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1), (-1, 1)):
            b.px(x + dx, y + dy, rgb(col))
    # trilhos
    rail_rows = [8, 20]
    for rr in rail_rows:
        ry = rr * T
        for x in range(0, W * T, 8):
            b.rect(x, ry + 2, x + 3, ry + 13, rgb('#6b4423'))
            b.rect(x, ry + 2, x + 3, ry + 3, rgb('#8a5a2b'))
        b.rect(0, ry + 4, W * T - 1, ry + 5, rgb('#9aa3ad'))
        b.rect(0, ry + 5, W * T - 1, ry + 5, rgb('#5f6770'))
        b.rect(0, ry + 10, W * T - 1, ry + 11, rgb('#9aa3ad'))
        b.rect(0, ry + 11, W * T - 1, ry + 11, rgb('#5f6770'))
        for c in range(W):
            b.used[rr][c] = True
    # vigas de madeira
    beams = list(range(6, W - 4, 7))
    for c in beams:
        top = [r for r in range(H) if (c, r) in wall and (c, r + 1) not in wall]
        if not top:
            continue
        r0 = top[0] + 1
        x = c * T
        b.rect(x + 1, r0 * T, x + 3, r0 * T + 3 * T, rgb('#6b4423'))
        b.rect(x + T - 4, r0 * T, x + T - 2, r0 * T + 3 * T, rgb('#6b4423'))
        b.rect(x - 4, r0 * T, x + T + 3, r0 * T + 3, rgb('#8a5a2b'))
        b.rect(x - 4, r0 * T + 3, x + T + 3, r0 * T + 4, rgb('#3e2810'))
        b.block(c, r0, c, r0 + 2)
    # vagonetes
    for vc, vr in [(30, 8), (12, 20), (40, 20)]:
        cx, cy = vc * T, vr * T - 6
        b.shadow(cx + 16, cy + 21, 18, 3, 70)
        b.rect(cx, cy + 4, cx + 31, cy + 18, rgb('#3a3f46'))
        b.rect(cx + 1, cy + 5, cx + 30, cy + 17, rgb('#6b7480'))
        b.rect(cx + 1, cy + 5, cx + 30, cy + 7, rgb('#8d97a3'))
        for k in range(4, 28, 4):
            b.ellipse(cx + k, cy + 4, 3, 2, rgb('#7a5a3a'))
        for wx in (cx + 6, cx + 24):
            b.ellipse(wx, cy + 19, 3, 3, rgb('#1b1d21'))
            b.px(wx, cy + 19, rgb('#9aa3ad'))
        b.block(vc, vr - 1, vc + 1, vr)
    # cristais
    for c, r in b.spots(7 * S * S, area=(2, 3, W - 3, H - 3)):
        cx, cy = c * T + 8, r * T + 14
        col = b.rng.choice([('#7fe3ff', '#37a6d4', '#d9f8ff'), ('#e79bff', '#b04fd6', '#f7d9ff')])
        b.shadow(cx, cy, 6, 2, 60)
        for off, hgt in ((-4, 8), (0, 13), (4, 9)):
            b.d.polygon([(cx + off - 3, cy), (cx + off, cy - hgt), (cx + off + 3, cy)], fill=rgb(col[1]))
            b.d.polygon([(cx + off - 2, cy - 1), (cx + off, cy - hgt + 1), (cx + off, cy - 1)], fill=rgb(col[0]))
            b.px(cx + off - 1, cy - hgt + 4, rgb(col[2]))
        b.block(c, r, c, r)
    for c, r in b.spots(4 * S * S, area=(2, 3, W - 3, H - 3)):
        b.rock(c, r, ROCK_BROWN)
    # poças
    for c, r in b.spots(3 * S * S, w=2, area=(2, 2, W - 3, H - 3)):
        b.ellipse(c * T + 16, r * T + 8, 12, 5, rgb('#2d5f8a'))
        b.ellipse(c * T + 15, r * T + 7, 10, 4, rgb('#3f84b8'))
        b.rect(c * T + 9, r * T + 5, c * T + 14, r * T + 5, rgb('#b6e1ff'))
        b.used[r][c] = False
    # brilho de lanternas
    lay = b.layer()
    ld = ImageDraw.Draw(lay)
    lanterns = [(c * T + 8, 3 * T) for c in beams]
    for cx, cy in lanterns:
        for rad, a in ((46, 14), (32, 18), (18, 26)):
            ld.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=(255, 200, 90, a))
    b.composite(lay)
    for cx, cy in lanterns:
        b.rect(cx - 2, cy - 3, cx + 2, cy + 3, rgb('#3a2c1a'))
        b.rect(cx - 1, cy - 2, cx + 1, cy + 2, rgb('#ffe27a'))
    return b.finish()


# ---------- 6. Pântano sombrio ----------
def pantano():
    b = Board('pantano', 66)
    b.texture([rgb('#3a3a52'), rgb('#34344b'), rgb('#40405a')], [5, 4, 3],
              [rgb('#2a2a3c'), rgb('#4e5a4a'), rgb('#5a4e6a')], 0.07)
    # lama escura em manchas
    for cx, cy, rx, ry in [(c * S, r * S, a * S // 2 + 1, d * S // 2 + 1) for c, r, a, d in [(4, 7, 3, 2), (13, 8, 4, 2), (20, 6, 2, 3), (9, 10, 2, 1), (17, 11, 3, 1)]] + [(34, 24, 4, 2), (6, 24, 3, 2), (44, 14, 2, 3)]:
        for y in range((cy - ry) * T, (cy + ry + 1) * T):
            for x in range((cx - rx) * T, (cx + rx + 1) * T):
                if ((x - cx * T - 8) / (rx * T + 8)) ** 2 + ((y - cy * T - 8) / (ry * T + 8)) ** 2 < 0.8 and b.rng.random() < 0.7:
                    b.px(x, y, b.rng.choice([rgb('#2a2638'), rgb('#312c40')]))
    # água turva
    def swamp_color(x, y):
        n = math.sin(x / 6 + y / 3.0) + math.sin(y / 4.0 + x / 13)
        roll = b.rng.random()
        if roll < 0.02:
            return rgb('#a07ad0')
        return rgb('#2f4a45') if n < 0.4 else rgb('#3e6158')
    pools = [(5, 6.4, 3.3, 1.7), (16.5, 5.6, 3.0, 1.6), (10.5, 10.2, 4.0, 1.7)]
    pools = [(c * S, r * S, a * S, d * S) for c, r, a, d in pools] + [(38, 22, 5.5, 2.4), (8, 24, 4.6, 2.2), (44, 11, 3.0, 3.4)]
    for c, r, a, d in pools:
        b.liquid([(c * T, r * T, a * T, d * T)], swamp_color, rgb('#16201d'), rim=rgb('#2a2638'))
    pads = []
    for c, r, a, d in pools:
        for k in range(3):
            pads.append(((c + (k - 1) * a * 0.5) * T, (r + (k % 2 - 0.5) * d * 0.6) * T))
    for cx, cy in pads:
        b.ellipse(cx, cy, 4, 2, rgb('#3f7a3a'))
        b.rect(cx, cy - 1, cx + 1, cy, rgb('#3e6158'))
        b.px(cx - 2, cy - 1, rgb('#7ac060'))
    # cemitério e capela no fundo
    cx0 = 28 * T
    b.shadow(cx0 + 32, 62, 38, 4, 70)
    b.rect(cx0, 14, cx0 + 63, 58, rgb('#2a2638'))
    b.rect(cx0 + 1, 15, cx0 + 62, 57, rgb('#5d5a6e'))
    for y in range(18, 56, 6):
        b.rect(cx0 + 1, y, cx0 + 62, y, rgb('#46435a'))
    b.d.polygon([(cx0 - 4, 16), (cx0 + 32, -2), (cx0 + 68, 16)], fill=rgb('#1c1a26'))
    b.d.polygon([(cx0 - 1, 15), (cx0 + 32, 2), (cx0 + 65, 15)], fill=rgb('#3d3a52'))
    b.rect(cx0 + 24, 30, cx0 + 39, 58, rgb('#14121c'))
    b.d.pieslice((cx0 + 24, 24, cx0 + 39, 38), 180, 360, fill=rgb('#14121c'))
    b.rect(cx0 + 8, 24, cx0 + 13, 36, rgb('#8d6ad0'))
    b.rect(cx0 + 50, 24, cx0 + 55, 36, rgb('#8d6ad0'))
    b.rect(cx0 + 30, -6, cx0 + 33, 4, rgb('#9a98ac'))
    b.rect(cx0 + 27, -3, cx0 + 36, -1, rgb('#9a98ac'))
    # rachaduras na capela
    for _ in range(5):
        x, y = cx0 + b.rng.randint(2, 60), b.rng.randint(18, 52)
        for k in range(6):
            b.px(x + b.rng.randint(-1, 1), y + k, rgb('#2a2638'))
    b.structure(28, 0, 31, 3)
    # lápides
    for c, r in b.spots(7 * S * S, area=(2, 1, W - 4, 9), margin=0):
        x, y = c * T + 3, r * T + 2
        b.shadow(x + 5, y + 12, 6, 2, 60)
        b.rect(x, y + 4, x + 9, y + 13, rgb('#2a2638'))
        b.d.pieslice((x, y, x + 9, y + 9), 180, 360, fill=rgb('#2a2638'))
        b.rect(x + 1, y + 4, x + 8, y + 12, rgb('#7a7890'))
        b.d.pieslice((x + 1, y + 1, x + 8, y + 8), 180, 360, fill=rgb('#7a7890'))
        b.rect(x + 4, y + 3, x + 5, y + 8, rgb('#4a4860'))
        b.rect(x + 2, y + 5, x + 7, y + 5, rgb('#4a4860'))
        b.block(c, r, c, r)
    # árvores tortas
    def swamp_tree(c, r):
        b.round_tree(c, r, TREE_SWAMP)
        vx = c * T + 6
        for k in range(3):
            b.d.line((vx + k * 9, (r + 1) * T - 4, vx + k * 9, (r + 1) * T + 5 + k % 2 * 3), fill=rgb('#587a62'))
    for c, r in border_spots(3):
        if c + 2 <= W and r + 2 <= H and b.free(c, r + 1, c + 1, r + 1):
            swamp_tree(c, r)
    for c, r in b.spots(40, w=2, h=2, margin=1):
        swamp_tree(c, r)
    # lampiões
    lamps = [(c * T + 6, r * T) for c, r in [(8 * S, 4 * S), (12 * S, 7 * S), (3 * S, 11 * S), (19 * S, 9 * S)]]
    for c, r in b.spots(10, margin=3):
        lamps.append((c * T + 6, r * T))
    for lx, ly in lamps:
        b.rect(lx, ly - 4, lx + 1, ly + 16, rgb('#1c1a26'))
        b.rect(lx - 2, ly - 8, lx + 3, ly - 3, rgb('#1c1a26'))
        b.rect(lx - 1, ly - 7, lx + 2, ly - 4, rgb('#b6ff8a'))
        b.block(lx // T, ly // T + 1, lx // T, ly // T + 1)
    # névoa e brilho dos lampiões
    lay = b.layer()
    ld = ImageDraw.Draw(lay)
    for lx, ly in lamps:
        for rad, a in ((34, 14), (22, 20), (11, 34)):
            ld.ellipse((lx - rad, ly - 6 - rad, lx + rad, ly - 6 + rad), fill=(170, 255, 120, a))
    for _ in range(22):
        cx, cy, rx, ry = b.rng.randint(0, W * T), b.rng.randint(0, H * T), b.rng.randint(40, 80), b.rng.randint(8, 15)
        ld.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=(220, 220, 255, 34))
    b.composite(lay)
    return b.finish()


# ---------- 7. Complexo tecnológico ----------
def tecnologico():
    b = Board('tecnologico', 77)
    b.texture([rgb('#6b7a8c'), rgb('#657487'), rgb('#728194')], [5, 4, 3], [rgb('#56647a'), rgb('#8795a8')], 0.04)
    # placas do piso
    for r in range(H):
        for c in range(W):
            x, y = c * T, r * T
            b.rect(x, y, x + T - 1, y, rgb('#4e5b6e'))
            b.rect(x, y, x, y + T - 1, rgb('#4e5b6e'))
            b.rect(x + 1, y + 1, x + T - 1, y + 1, rgb('#8998ad'))
            b.px(x + 3, y + 3, rgb('#4e5b6e'))
            b.px(x + T - 4, y + T - 4, rgb('#4e5b6e'))
    # faixas de segurança
    for x in range(0, W * T, 8):
        b.rect(x, (H // 2 - 1) * T + 6, x + 3, (H // 2 - 1) * T + 9, rgb('#e8c547'))
        b.rect(x + 4, (H // 2 - 1) * T + 6, x + 7, (H // 2 - 1) * T + 9, rgb('#2a2f38'))
    # cabos pelo chão
    cable_paths = [[(0, 3), (6, 3), (6, 10), (12, 10)], [(23, 11), (16, 11), (16, 4), (10, 4)], [(2, 12), (2, 7), (9, 7)]]
    cable_paths = [[(c * S, r * S) for c, r in path] for path in cable_paths] + [[(47, 20), (36, 20), (36, 8), (28, 8)], [(24, 27), (24, 18), (14, 18)], [(30, 12), (40, 12), (40, 26)]]
    for path in cable_paths:
        for (c0, r0), (c1, r1) in zip(path, path[1:]):
            x0, y0, x1, y1 = c0 * T + 8, r0 * T + 8, c1 * T + 8, r1 * T + 8
            for t in range(max(abs(x1 - x0), abs(y1 - y0)) + 1):
                x = x0 + (x1 - x0) * t // max(1, max(abs(x1 - x0), abs(y1 - y0)))
                y = y0 + (y1 - y0) * t // max(1, max(abs(x1 - x0), abs(y1 - y0)))
                b.rect(x - 1, y - 1, x + 1, y + 1, rgb('#1d222b'))
                b.px(x, y - 1, rgb('#3a4252'))
    # painéis / computadores nas paredes superior
    for k, c in enumerate(range(1, W - 2, 4)):
        if b.free(c - 0, 0, c + 1, 1):
            x, y = c * T - 4, 2
            b.shadow(x + 20, y + 34, 20, 3, 70)
            b.rect(x, y, x + 39, y + 31, rgb('#1d222b'))
            b.rect(x + 2, y + 2, x + 37, y + 24, rgb('#0e2a2a'))
            for row in range(4):
                for col in range(6):
                    colr = b.rng.choice(['#33ff99', '#33ccff', '#ffdd55', '#ff5577', '#2a4a4a'])
                    b.rect(x + 4 + col * 6, y + 4 + row * 5, x + 7 + col * 6, y + 6 + row * 5, rgb(colr))
            b.rect(x + 2, y + 26, x + 37, y + 29, rgb('#39445a'))
            for led in range(5):
                b.px(x + 6 + led * 6, y + 27, rgb(b.rng.choice(['#33ff99', '#ff5577', '#ffdd55'])))
            b.block(c - 0, 0, c + 1, 1)
    # postes de energia e antenas
    for c, r in [(c * S, r * S) for c, r in [(3, 5), (10, 3), (20, 5), (7, 12), (15, 12), (22, 9)]] + [(5, 4), (38, 18), (27, 7), (33, 25), (14, 20), (44, 4)]:
        if b.free(c, r, c, r + 1):
            x, y = c * T + 8, r * T
            b.shadow(x, y + 26, 6, 2, 70)
            b.rect(x - 1, y - 10, x + 1, y + 24, rgb('#2a2f38'))
            b.rect(x, y - 10, x, y + 24, rgb('#4a5568'))
            b.rect(x - 8, y - 8, x + 8, y - 6, rgb('#2a2f38'))
            b.rect(x - 7, y - 4, x + 7, y - 3, rgb('#2a2f38'))
            for dx in (-8, 8):
                b.ellipse(x + dx, y - 9, 2, 2, rgb('#ffe27a'))
            b.block(c, r + 1, c, r + 1)
    # geradores
    for c, r in [(22, 16), (8, 18), (34, 12), (14, 8), (40, 22), (28, 24)]:
        if b.free(c, r, c + 1, r + 1):
            x, y = c * T, r * T + 2
            b.shadow(x + 16, y + 28, 18, 3, 70)
            b.rect(x, y, x + 31, y + 26, rgb('#1d222b'))
            b.rect(x + 1, y + 1, x + 30, y + 25, rgb('#5a6b84'))
            b.rect(x + 1, y + 1, x + 30, y + 4, rgb('#7e90ac'))
            for k in range(6):
                b.rect(x + 3 + k * 4, y + 8, x + 5 + k * 4, y + 20, rgb('#2f3a4c'))
            b.rect(x + 22, y + 10, x + 28, y + 16, rgb('#f2c94c'))
            b.d.polygon([(x + 26, y + 11), (x + 23, y + 14), (x + 25, y + 14), (x + 24, y + 16), (x + 28, y + 12), (x + 26, y + 12)], fill=rgb('#2a2f38'))
            b.block(c, r, c + 1, r + 1)
    # lâmpadas piscantes (acesas em ciclo no desenho)
    for c, r in b.spots(10 * S * S, margin=0):
        x, y = c * T + 8, r * T + 8
        col = b.rng.choice(['#33ff99', '#ff5577', '#ffdd55', '#33ccff'])
        b.ellipse(x, y, 3, 3, rgb('#1d222b'))
        b.ellipse(x, y, 2, 2, rgb(col))
        b.px(x - 1, y - 1, rgb('#ffffff'))
        b.blocked[r][c] = True
    lay = b.layer()
    ld = ImageDraw.Draw(lay)
    for c in range(W):
        for r in range(H):
            if b.blocked[r][c] and b.used[r][c] and r > 1:
                pass
    for _ in range(14 * S * S):
        x, y = b.rng.randint(8, W * T - 8), b.rng.randint(8, H * T - 8)
        ld.ellipse((x - 10, y - 10, x + 10, y + 10), fill=(120, 220, 255, 12))
    b.composite(lay)
    return b.finish()


# ---------- 8. Pico nevado ----------
def pico():
    b = Board('pico', 88)
    b.texture([rgb('#f2f8fc'), rgb('#e9f2f9'), rgb('#f8fcff')], [5, 4, 3], [rgb('#cfe3f1'), rgb('#ffffff')], 0.06)
    # sombras azuladas e placas de gelo
    for cx, cy, rx, ry in [(c * S, r * S, a * S // 2 + 1, d * S // 2 + 1) for c, r, a, d in [(5, 9, 3, 2), (12, 11, 3, 1), (19, 8, 2, 2), (8, 3, 2, 1)]] + [(36, 6, 3, 2), (6, 24, 3, 2)]:
        for y in range((cy - ry) * T, (cy + ry + 1) * T):
            for x in range((cx - rx) * T, (cx + rx + 1) * T):
                if ((x - cx * T - 8) / (rx * T + 8)) ** 2 + ((y - cy * T - 8) / (ry * T + 8)) ** 2 < 0.8:
                    b.px(x, y, rgb('#9fd8ef') if b.rng.random() < 0.7 else rgb('#c4ebfa'))
    # caverna de gelo no alto
    ix = 14 * T
    b.shadow(ix + 40, 56, 44, 4, 60)
    b.d.pieslice((ix - 8, 2, ix + 88, 90), 180, 360, fill=rgb('#2a4a6a'))
    b.d.pieslice((ix - 4, 5, ix + 84, 86), 180, 360, fill=rgb('#6fb4de'))
    b.d.pieslice((ix + 18, 20, ix + 62, 80), 180, 360, fill=rgb('#10223a'))
    b.rect(ix - 8, 46, ix + 88, 54, rgb('#6fb4de'))
    b.rect(ix + 18, 46, ix + 62, 54, rgb('#10223a'))
    for k in range(6):
        x = ix + 20 + k * 7
        b.d.polygon([(x, 26 + (k % 2) * 3), (x + 3, 26 + (k % 2) * 3), (x + 1, 34 + (k % 3) * 3)], fill=rgb('#cfeeff'))
    for k in range(10):
        b.px(ix + b.rng.randint(0, 80), b.rng.randint(8, 40), rgb('#e8f8ff'))
    b.structure(14, 0, 19, 3)
    # dojo de pedra
    for c in range(30, 46):
        for r in range(16, 26):
            x, y = c * T, r * T
            tone = '#9a9aa6' if (c + r) % 2 == 0 else '#8a8a97'
            b.rect(x, y, x + T - 1, y + T - 1, rgb(tone))
            b.rect(x, y, x + T - 1, y, rgb('#b3b3bf'))
            b.rect(x, y, x, y + T - 1, rgb('#b3b3bf'))
            b.rect(x + T - 1, y, x + T - 1, y + T - 1, rgb('#6c6c78'))
            b.rect(x, y + T - 1, x + T - 1, y + T - 1, rgb('#6c6c78'))
            b.used[r][c] = True
    for k in range(30 * T, 46 * T, 4):
        b.rect(k, 16 * T - 2, k + 1, 16 * T, rgb('#6b4423'))
    # troncos de treino
    for c, r in [(32, 18), (38, 18), (42, 22), (34, 23), (44, 19), (36, 21)]:
        x, y = c * T + 4, r * T - 2
        b.shadow(x + 4, y + 20, 7, 2, 70)
        b.rect(x, y, x + 8, y + 19, rgb('#3e2810'))
        b.rect(x + 1, y + 1, x + 7, y + 18, rgb('#8a5a2b'))
        b.rect(x + 2, y + 1, x + 3, y + 18, rgb('#a5743f'))
        for yy in (y + 5, y + 12):
            b.rect(x, yy, x + 8, yy + 1, rgb('#d9c283'))
        b.block(c, r, c, r)
    # pinheiros nevados
    for c, r in border_spots(2) + border_spots(3, 2):
        if c + 2 <= W and r + 2 <= H and b.free(c, r, c + 1, r + 1):
            b.pine(c, r, snow=True)
    for c, r in b.spots(60, w=2, h=2, margin=1):
        b.pine(c, r, snow=True)
    for c, r in b.spots(6 * S * S, margin=0):
        b.rock(c, r, ('#6a7a8c', '#97a8bb', '#d7e6f2'))
    # flocos de neve
    lay = b.layer()
    ld = ImageDraw.Draw(lay)
    for _ in range(90 * S * S):
        x, y = b.rng.randint(0, W * T - 1), b.rng.randint(0, H * T - 1)
        ld.rectangle((x, y, x + 1, y + 1), fill=(255, 255, 255, 210))
    b.composite(lay)
    return b.finish()


# ---------- 9. Santuário místico ----------
def santuario():
    b = Board('santuario', 99)
    b.texture([rgb('#8fd6b4'), rgb('#86ccae'), rgb('#9adcbc')], [5, 4, 3], [rgb('#b3a5ec'), rgb('#d9f5e6'), rgb('#6fb99a')], 0.05)
    # lago cristalino
    def lake_color(x, y):
        n = math.sin(x / 6 + y / 9) + math.sin(x / 3.0)
        if b.rng.random() < 0.03:
            return rgb('#ffffff')
        return rgb('#5ad2e8') if n < 0.5 else rgb('#7ce2f2')
    b.liquid([(12.4 * T, 17.6 * T, 10.8 * T, 7.4 * T), (9 * T, 14.8 * T, 6.8 * T, 4.4 * T)], lake_color, rgb('#d6f8ff'), rim=rgb('#4aa7bd'))
    b.liquid([(40 * T, 22 * T, 5 * T, 3.2 * T)], lake_color, rgb('#d6f8ff'), rim=rgb('#4aa7bd'))
    # altar com escadaria
    ax, ay = 28 * T, 0
    b.shadow(ax + 40, 64, 48, 5, 60)
    for k in range(5):
        y = 62 - k * 9
        half = 44 - k * 6
        b.rect(ax + 40 - half, y, ax + 40 + half, y + 8, rgb('#6e6a8c'))
        b.rect(ax + 40 - half, y, ax + 40 + half, y + 1, rgb('#c9c6e8'))
        b.rect(ax + 40 - half, y + 8, ax + 40 + half, y + 8, rgb('#4a476a'))
    b.rect(ax + 26, 4, ax + 54, 18, rgb('#6e6a8c'))
    b.rect(ax + 27, 5, ax + 53, 17, rgb('#a9a5cf'))
    b.rect(ax + 27, 5, ax + 53, 6, rgb('#e2e0f7'))
    b.ellipse(ax + 40, 3, 5, 5, rgb('#fff6a8'))
    b.ellipse(ax + 40, 3, 3, 3, rgb('#ffffff'))
    for dx in (-30, 30):
        b.rect(ax + 40 + dx - 3, 6, ax + 40 + dx + 3, 40, rgb('#9a96c2'))
        b.rect(ax + 40 + dx - 3, 6, ax + 40 + dx - 2, 40, rgb('#d9d6f2'))
        b.rect(ax + 40 + dx - 4, 4, ax + 40 + dx + 4, 8, rgb('#6e6a8c'))
    b.structure(28, 0, 32, 3)
    # cogumelos gigantes brilhantes
    def giant_mushroom(c, r):
        if True:
            cx, cy = c * T + 16, r * T + 20
            b.shadow(cx, cy + 10, 16, 3, 60)
            b.rect(cx - 3, cy - 2, cx + 3, cy + 10, rgb('#f2e9ff'))
            b.rect(cx - 3, cy - 2, cx - 2, cy + 10, rgb('#d3c5ee'))
            cap = b.rng.choice([('#b84fd6', '#d98aee', '#f6d3ff'), ('#e0508f', '#f187b5', '#ffd0e3'), ('#5a6be0', '#8a98f2', '#d0d6ff')])
            b.ellipse(cx, cy - 6, 15, 10, rgb(cap[0]))
            b.rect(cx - 15, cy - 6, cx + 15, cy - 2, rgb(cap[0]))
            b.ellipse(cx - 1, cy - 8, 12, 7, rgb(cap[1]))
            for dx, dy in ((-7, -9), (0, -12), (7, -9), (-3, -6), (4, -6), (10, -5)):
                b.ellipse(cx + dx, cy + dy, 2, 2, rgb(cap[2]))
            b.block(c, r + 1, c + 1, r + 1)
    for c, r in [(c * S, r * S) for c, r in [(12, 6), (20, 7), (14, 10), (22, 11), (17, 12), (10, 2), (0, 2), (3, 0), (21, 4)]]:
        if c + 2 <= W and r + 2 <= H and b.free(c, r, c + 1, r + 1):
            giant_mushroom(c, r)
    for c, r in b.spots(22, w=2, h=2, margin=1):
        giant_mushroom(c, r)
    for c, r in b.spots(10 * S * S, margin=0):
        b.flower(c, r, b.rng.choice(['#ffffff', '#ffd6f5', '#d6e0ff']))
        b.used[r][c] = False
    # partículas de luz
    lay = b.layer()
    ld = ImageDraw.Draw(lay)
    for _ in range(70 * S * S):
        x, y = b.rng.randint(0, W * T - 1), b.rng.randint(0, H * T - 1)
        col = b.rng.choice([(255, 246, 168, 220), (214, 200, 255, 220), (255, 255, 255, 220)])
        ld.rectangle((x, y, x + 1, y + 1), fill=col)
        if b.rng.random() < 0.3:
            ld.rectangle((x - 1, y, x + 2, y), fill=col[:3] + (120,))
            ld.rectangle((x, y - 1, x + 1, y + 2), fill=col[:3] + (120,))
    for cx, cy in [(ax + 40, 12)]:
        for rad, a in ((50, 14), (34, 20), (20, 30)):
            ld.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=(255, 246, 168, a))
    b.composite(lay)
    return b.finish()


MAPS = [campina, floresta, litoral, vulcao, caverna, pantano, tecnologico, pico, santuario]


def main():
    grids = {}
    swims = {}
    for build in MAPS:
        walk, swim = build()
        grids[build.__name__] = [''.join('1' if cell else '0' for cell in row) for row in walk]
        swims[build.__name__] = [''.join('1' if cell else '0' for cell in row) for row in swim]
        total = sum(row.count('1') for row in grids[build.__name__])
        print(f'{build.__name__:12} andável: {total}/{W * H} tiles')
    out = ROOT / 'packages' / 'data' / 'catalog' / 'wild-maps-grid.json'
    out.write_text(json.dumps({'cols': W, 'rows': H, 'tile': T * SCALE, 'walkable': grids, 'swim': swims}, indent=1) + '\n')


if __name__ == '__main__':
    sys.exit(main())
