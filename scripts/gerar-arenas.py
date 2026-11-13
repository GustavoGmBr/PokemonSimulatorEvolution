#!/usr/bin/env python3
"""Gera as arenas de batalha (pixel art 600x400) a partir da plataforma enviada.

Uso (na raiz do projeto): python scripts/gerar-arenas.py     (precisa de Pillow e numpy)
Entrada: recursos/Arenas/original.png (a arena com fundo preto e as duas plataformas voadoras)
Saída em recursos/Arenas/:
  plataforma.png        a arena sem o fundo e sem as plataformas voadoras (transparente)
  fundos/<id>.png       um cenário para cada mapa de selvagens + "estadio" (fundo padrão)
  prontas/<id>.png      plataforma sobre o cenário (para conferir; o jogo junta as duas em camadas)
  packages/data/catalog/arenas.json  posições dos Pokémon na arena
"""
import json
import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
PASTA = ROOT / 'recursos' / 'Arenas'
W, H = 600, 400
HORIZON = 196   # onde o chão encontra o fundo (logo atrás da borda de trás da plataforma)


def rgb(hexcolor, alpha=255):
    hexcolor = hexcolor.lstrip('#')
    return (int(hexcolor[0:2], 16), int(hexcolor[2:4], 16), int(hexcolor[4:6], 16), alpha)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)


# ---------------------------------------------------------------- plataforma
def extrair_plataforma():
    """Tira o fundo preto, as duas plataformas voadoras e a franja de pixels quase pretos da imagem original."""
    origem = np.array(Image.open(PASTA / 'original.png').convert('RGB')).astype(int)
    quase_preto = origem.max(axis=2) <= 12
    fundo = (origem == [1, 1, 1]).all(axis=2)
    rotulos, _ = ndi.label(fundo)
    transparente = rotulos == rotulos[0, 0]          # fundo preto ligado à borda
    comp, n = ndi.label(~fundo)
    tamanhos = ndi.sum(~fundo, comp, range(1, n + 1))
    principal = int(np.argmax(tamanhos)) + 1         # a arena grande; o resto são as plataformas voadoras
    for i in range(1, n + 1):
        if i != principal:
            ys, xs = np.where(comp == i)
            if len(ys) > 30:
                transparente[ys.min() - 2:ys.max() + 3, xs.min() - 2:xs.max() + 3] = True
    cruz = ndi.generate_binary_structure(2, 1)
    # a imagem tem uma franja pontilhada de pixels quase pretos em volta da arena: come até 4 pixels dela
    for _ in range(4):
        transparente = transparente | (ndi.binary_dilation(transparente, structure=cruz) & quase_preto)
    opaco = ~transparente
    vizinhos = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]])
    for _ in range(3):                               # tira pontinhas soltas na borda
        contagem = ndi.convolve(opaco.astype(int), vizinhos, mode='constant')
        opaco = opaco & ~((contagem <= 1) & ndi.binary_dilation(~opaco, structure=cruz))
    contorno = ndi.binary_dilation(opaco, structure=cruz) & ~opaco   # contorno limpo de 1 pixel
    rgba = np.dstack([origem.astype(np.uint8), (opaco * 255).astype(np.uint8)])
    rgba[contorno] = [8, 8, 10, 255]
    saida = Image.fromarray(rgba, 'RGBA')
    saida.save(PASTA / 'plataforma.png', optimize=True)
    return saida


# ---------------------------------------------------------------- cenário
class Cena:
    def __init__(self, ident, seed):
        self.id = ident
        self.rng = random.Random(seed)
        self.img = Image.new('RGBA', (W, H), (0, 0, 0, 255))
        self.d = ImageDraw.Draw(self.img)

    # --- básicos
    def px(self, x, y, cor):
        if 0 <= x < W and 0 <= y < H:
            self.d.point((x, y), fill=cor)

    def rect(self, x0, y0, x1, y1, cor):
        self.d.rectangle((x0, y0, x1, y1), fill=cor)

    def elipse(self, cx, cy, rx, ry, cor, borda=None):
        self.d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=cor, outline=borda)

    def camada(self):
        return Image.new('RGBA', (W, H), (0, 0, 0, 0))

    def compor(self, camada):
        self.img = Image.alpha_composite(self.img, camada)
        self.d = ImageDraw.Draw(self.img)

    def translucido(self, desenhar):
        """desenhar(ImageDraw) numa camada própria, para alfa de verdade."""
        cam = self.camada()
        desenhar(ImageDraw.Draw(cam))
        self.compor(cam)

    # --- céu e chão
    def degrade(self, y0, y1, cores, pontilhar=True):
        """Faixas horizontais de cor (com uma linha pontilhada entre elas, como pixel art de verdade)."""
        n = len(cores)
        altura = (y1 - y0) / n
        for i, cor in enumerate(cores):
            ya, yb = int(y0 + i * altura), int(y0 + (i + 1) * altura) - 1
            self.rect(0, ya, W, yb, rgb(cor))
            if pontilhar and i + 1 < n:
                prox = rgb(cores[i + 1])
                for x in range(0, W, 2):
                    self.px(x + (yb % 2), yb, prox)
                    self.px(x + ((yb + 1) % 2), yb - 1, prox)

    def chao(self, cores, pesos=None, detalhe=None, chance=0.05, neblina=None, escurecer=0.28, topo=HORIZON):
        """Chão com ruído, clareado perto do horizonte (neblina) e mais escuro na frente."""
        for y in range(topo, H):
            t = (y - topo) / max(1, H - topo)
            for x in range(W):
                cor = self.rng.choices(cores, pesos)[0]
                base = rgb(cor)
                if detalhe and self.rng.random() < chance:
                    base = rgb(self.rng.choice(detalhe))
                if neblina:
                    base = mix(base, rgb(neblina), 0.55 * (1 - t) ** 1.6)
                if escurecer:
                    base = mix(base, (0, 0, 0, 255), escurecer * t)
                self.px(x, y, base)

    # --- formas
    def nuvem(self, cx, cy, escala=1.0, cor='#ffffff', sombra='#cfe3f2'):
        partes = [(-26, 4, 18, 9), (-8, -2, 22, 13), (14, 0, 20, 12), (30, 5, 16, 8), (0, 6, 34, 8)]
        for dx, dy, rx, ry in partes:
            self.elipse(cx + dx * escala, cy + dy * escala + 3, rx * escala, ry * escala, rgb(sombra))
        for dx, dy, rx, ry in partes:
            self.elipse(cx + dx * escala, cy + dy * escala, rx * escala, ry * escala, rgb(cor))

    def serra(self, base, amplitude, cor, borda=None, passo=4, semente=0, picos=3.0, pontas=None):
        """Silhueta de montanhas/colinas preenchida até o horizonte."""
        rng = random.Random(self.rng.random() * 1000 + semente)
        fases = [rng.random() * 6.28 for _ in range(4)]
        pts = []
        for x in range(0, W + passo, passo):
            n = (math.sin(x / (60 / picos) + fases[0]) * 0.5 + math.sin(x / (27 / picos) + fases[1]) * 0.3
                 + math.sin(x / (13 / picos) + fases[2]) * 0.2)
            pts.append((x, base - amplitude * (0.5 + 0.5 * n)))
        self.d.polygon(pts + [(W, HORIZON + 2), (0, HORIZON + 2)], fill=rgb(cor))
        if borda:
            self.d.line(pts, fill=rgb(borda), width=1)
        return pts

    def arvore(self, x, base, altura, copa, tronco='#5a3a20', contorno='#10241a'):
        """Árvore redonda vista de lado."""
        larg = altura * 0.42
        self.rect(x - 1, base - altura * 0.45, x + 1, base, rgb(tronco))
        cy = base - altura * 0.68
        self.elipse(x, cy, larg + 1, altura * 0.36 + 1, rgb(contorno))
        self.elipse(x, cy, larg, altura * 0.36, rgb(copa[0]))
        self.elipse(x - larg * 0.18, cy - altura * 0.07, larg * 0.7, altura * 0.26, rgb(copa[1]))
        self.elipse(x - larg * 0.35, cy - altura * 0.14, larg * 0.32, altura * 0.12, rgb(copa[2]))

    def pinheiro(self, x, base, altura, cores=('#1f5a3a', '#2a7048', '#35855a'), neve=False):
        self.rect(x - 1, base - 4, x + 1, base, rgb('#4a3322'))
        camadas = 3 if altura < 40 else 4
        for i in range(camadas):
            ya = base - 3 - i * altura * 0.22
            meia = altura * (0.30 - i * 0.05)
            self.d.polygon([(x, ya - altura * 0.34), (x - meia - 1, ya + 1), (x + meia + 1, ya + 1)], fill=rgb('#10241a'))
            self.d.polygon([(x, ya - altura * 0.34 + 2), (x - meia, ya), (x + meia, ya)], fill=rgb(cores[min(i, 2)]))
            if neve:
                self.d.polygon([(x, ya - altura * 0.34), (x - meia * 0.55, ya - altura * 0.12), (x + meia * 0.55, ya - altura * 0.12)],
                               fill=rgb('#f4fbff'))

    def luz(self, pontos, cor):
        self.translucido(lambda d: d.polygon(pontos, fill=cor))

    def brilhos(self, quantos, area, cores, tamanho=1):
        x0, y0, x1, y1 = area
        for _ in range(quantos):
            x, y = self.rng.randint(x0, x1), self.rng.randint(y0, y1)
            cor = rgb(self.rng.choice(cores))
            self.rect(x, y, x + tamanho - 1, y + tamanho - 1, cor)
            if tamanho > 1:
                continue
            if self.rng.random() < 0.3:
                self.px(x - 1, y, cor)
                self.px(x + 1, y, cor)
                self.px(x, y - 1, cor)
                self.px(x, y + 1, cor)

    def sombra_da_arena(self):
        """Sombra da plataforma no chão, para ela não parecer solta."""
        def desenhar(d):
            for i, alfa in enumerate((38, 38, 38)):
                d.ellipse((38 + i * 10, 318 + i * 6, 562 - i * 10, 392 - i * 3), fill=(0, 0, 0, alfa))
        self.translucido(desenhar)

    def salvar(self):
        # paleta de 256 cores sem pontilhado: o arquivo fica bem menor e a pixel art não muda
        reduzida = self.img.convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        reduzida.save(PASTA / 'fundos' / f'{self.id}.png', optimize=True)
        self.img = reduzida.convert('RGBA')
        return self.img


# ---------------------------------------------------------------- cenários
def campina():
    c = Cena('campina', 11)
    c.degrade(0, HORIZON, ['#4aa8ec', '#5fb6f0', '#78c4f3', '#93d2f6', '#afdff9', '#c8eafb', '#dff4fd'])
    # sol e nuvens
    c.elipse(468, 62, 26, 26, rgb('#fff3b0'))
    c.elipse(468, 62, 20, 20, rgb('#fffbe0'))
    for x, y, e in [(70, 48, 1.2), (190, 96, 0.8), (330, 38, 1.0), (560, 120, 0.9), (410, 128, 0.6), (20, 128, 0.7)]:
        c.nuvem(x, y, e)
    # colinas em camadas
    c.serra(HORIZON - 28, 34, '#a8dc8a', semente=1)
    c.serra(HORIZON - 12, 30, '#7cc765', semente=2)
    c.serra(HORIZON + 2, 26, '#5fb455', borda='#3f9142', semente=3, picos=1.6)
    rng = c.rng
    for x in range(10, W, 34):
        c.arvore(x + rng.randint(-8, 8), HORIZON - 4 - rng.randint(0, 10), rng.randint(20, 30), ('#2a6b32', '#3f9142', '#6cc35a'),
                 contorno='#1c4a24')
    # celeiro ao longe
    bx, by = 90, HORIZON - 36
    c.rect(bx, by + 10, bx + 33, by + 36, rgb('#5a2a1a'))
    c.rect(bx + 1, by + 11, bx + 32, by + 35, rgb('#b5483a'))
    c.d.polygon([(bx - 3, by + 12), (bx + 17, by - 2), (bx + 37, by + 12)], fill=rgb('#3a2418'))
    c.d.polygon([(bx - 1, by + 11), (bx + 17, by + 1), (bx + 35, by + 11)], fill=rgb('#7d5a3c'))
    c.rect(bx + 12, by + 20, bx + 22, by + 36, rgb('#e8d8b0'))
    c.chao(['#8fd06b', '#86c862', '#98d673'], [5, 3, 3], ['#6fb653', '#b8e690'], 0.05, neblina='#c8eaa6')
    # cerca de madeira ao fundo
    for x in range(0, W, 18):
        c.rect(x, HORIZON + 4, x + 2, HORIZON + 14, rgb('#7d5a3c'))
    c.rect(0, HORIZON + 7, W, HORIZON + 8, rgb('#a5743f'))
    c.rect(0, HORIZON + 11, W, HORIZON + 12, rgb('#a5743f'))
    for _ in range(90):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 22, H)
        cor = c.rng.choice(['#ff6b8a', '#fff0a0', '#ffffff', '#ff9d5c', '#b48aff'])
        c.rect(x, y, x + 1, y + 1, rgb(cor))
        c.px(x, y + 2, rgb('#2f7a3a'))
    for _ in range(40):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 22, H)
        c.px(x, y, rgb('#4e9e3c'))
        c.px(x - 1, y - 1, rgb('#4e9e3c'))
        c.px(x + 1, y - 1, rgb('#4e9e3c'))
    c.sombra_da_arena()
    return c


def floresta():
    c = Cena('floresta', 22)
    c.degrade(0, HORIZON, ['#bfe89a', '#a2d97f', '#7dc468', '#4fa557', '#2d7d43', '#1c5a30', '#123f23'])
    # camadas de copas
    rng = c.rng
    for base, alt, cor, passo, tronco in [(HORIZON - 44, 120, ('#2f8a46', '#47a85b', '#6cc77a'), 30, 1),
                                          (HORIZON - 22, 150, ('#206b36', '#2f8a46', '#4fb25f'), 36, 2),
                                          (HORIZON, 185, ('#15492a', '#226b36', '#3f9449'), 50, 3)]:
        for x in range(-10, W + 40, passo):
            xx = x + rng.randint(-8, 8)
            ba = base + rng.randint(-5, 5)
            al = alt + rng.randint(-20, 16)
            c.rect(xx - tronco, ba - al * 0.5, xx + tronco, ba, rgb('#2f1f12' if tronco > 1 else '#3a2616'))
            c.arvore(xx, ba, al, cor, tronco='#3a2616', contorno='#0a2614')
    # feixes de luz atravessando as copas
    for x0 in range(30, W + 200, 110):
        c.luz([(x0, 0), (x0 + 30, 0), (x0 - 80, HORIZON + 40), (x0 - 130, HORIZON + 40)], (255, 245, 170, 34))
    c.chao(['#2f7d3f', '#2a7339', '#358846'], [5, 4, 3], ['#1f5a2d', '#4ca25a'], 0.06, neblina='#6cc77a')
    # tronco caído e cogumelos
    c.rect(30, HORIZON + 30, 120, HORIZON + 42, rgb('#2b1b10'))
    c.rect(31, HORIZON + 31, 119, HORIZON + 41, rgb('#7a4f2e'))
    c.rect(31, HORIZON + 31, 119, HORIZON + 34, rgb('#9a6a40'))
    c.elipse(31, HORIZON + 36, 4, 6, rgb('#d9b27a'), rgb('#5a3a20'))
    for _ in range(30):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 20, H)
        cor = c.rng.choice(['#c0392b', '#e58a3a', '#d95a8a'])
        c.elipse(x, y, 3, 2, rgb(cor))
        c.px(x - 1, y - 1, rgb('#ffffff'))
    for _ in range(60):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 20, H)
        c.rect(x, y, x + 1, y + 1, rgb(c.rng.choice(['#ffe27a', '#ffffff', '#ff8aa8'])))
    c.sombra_da_arena()
    return c


def litoral():
    c = Cena('litoral', 33)
    mar = 134
    c.degrade(0, mar, ['#2a8fd8', '#3fa0e0', '#5bb3e8', '#7bc6ee', '#9bd6f3', '#bde6f8'])
    c.elipse(120, 70, 24, 24, rgb('#fff6c0'))
    c.elipse(120, 70, 18, 18, rgb('#fffbe6'))
    for x, y, e in [(60, 40, 1.1), (250, 80, 0.9), (360, 36, 1.2), (520, 90, 0.8), (470, 28, 0.7)]:
        c.nuvem(x, y, e)
    # mar com ondas
    for y in range(mar, HORIZON + 1):
        t = (y - mar) / (HORIZON - mar)
        base = mix(rgb('#1c5fa8'), rgb('#52aee4'), t)
        for x in range(W):
            onda = math.sin(x / 9 + y / 5 + (x // 24 % 2)) + math.sin(y / 3.0)
            cor = base if onda < 1.0 else mix(base, (255, 255, 255, 255), 0.18 + 0.12 * t)
            c.px(x, y, cor)
    # ilhota com coqueiro e veleiro ao longe
    ix, iy = 80, mar + 12
    c.elipse(ix, iy + 2, 44, 10, rgb('#d9c283'))
    c.elipse(ix, iy, 38, 8, rgb('#ecd9a0'))
    c.rect(ix - 1, iy - 38, ix + 1, iy, rgb('#6b4a2a'))
    for ang in range(-3, 4):
        c.d.line((ix, iy - 38, ix + ang * 9, iy - 30 + abs(ang) * 3), fill=rgb('#2f8a3f'), width=2)
    vx, vy = 470, mar + 14
    c.d.polygon([(vx, vy - 26), (vx, vy), (vx + 14, vy)], fill=rgb('#ffffff'))
    c.d.polygon([(vx - 1, vy - 18), (vx - 1, vy), (vx - 10, vy)], fill=rgb('#e8503a'))
    c.rect(vx - 10, vy, vx + 14, vy + 3, rgb('#6b4423'))
    # areia + espuma
    c.chao(['#ecd9a0', '#e4cf92', '#f3e3b0'], [5, 3, 3], ['#cdb676', '#fff3c8'], 0.05, neblina='#fff4d0')
    for x in range(W):
        borda = HORIZON + int(2 * math.sin(x / 7) + math.sin(x / 3))
        for dy in range(-2, 3):
            c.px(x, borda + dy, rgb('#ffffff') if dy in (0, 1) else rgb('#c9ecff'))
        if c.rng.random() < 0.3:
            c.px(x, borda + 3, rgb('#d9c283'))
    for _ in range(26):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 24, H)
        cor = c.rng.choice(['#ff9fb0', '#fff0e0', '#ffd0a0'])
        c.elipse(x, y, 3, 2, rgb(cor), rgb('#b08a5a'))
    for _ in range(8):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 30, H)
        c.elipse(x, y, 7, 4, rgb('#6b6b74'))
        c.elipse(x - 1, y - 1, 5, 2, rgb('#9a9aa3'))
    c.sombra_da_arena()
    return c


def vulcao():
    c = Cena('vulcao', 44)
    c.degrade(0, HORIZON, ['#140a10', '#2a1016', '#44160f', '#6a2210', '#963514', '#c2490f', '#ee7a1c'])
    for x, y, r in [(80, 40, 40), (200, 20, 34), (330, 50, 44), (470, 24, 38), (560, 70, 34), (20, 90, 30)]:
        c.translucido(lambda d, x=x, y=y, r=r: d.ellipse((x - r, y - r * 0.5, x + r, y + r * 0.5), fill=(70, 50, 52, 120)))
    # vulcões
    def vulcao_(cx, base, alt, larg, cor, lava):
        topo = base - alt
        pts = [(cx - larg, base), (cx - larg * 0.3, topo + alt * 0.28), (cx - larg * 0.14, topo), (cx + larg * 0.14, topo),
               (cx + larg * 0.3, topo + alt * 0.28), (cx + larg, base)]
        c.d.polygon(pts, fill=rgb(cor))
        # lado direito mais escuro e faixas de rocha
        c.translucido(lambda d: d.polygon([(cx + larg * 0.14, topo), (cx + larg * 0.3, topo + alt * 0.28), (cx + larg, base), (cx + larg * 0.12, base)],
                                          fill=(0, 0, 0, 80)))
        for k in range(1, 6):
            y = topo + alt * k / 6
            esq = cx - larg * (0.14 + 0.86 * k / 6)
            c.d.line((esq + 4, y, esq + larg * 0.4, y + 3), fill=mix(rgb(cor), (0, 0, 0, 255), 0.3), width=1)
        # cratera e rios de lava que descem pela encosta
        c.d.polygon([(cx - larg * 0.16, topo + 2), (cx - larg * 0.1, topo - 5), (cx + larg * 0.1, topo - 5), (cx + larg * 0.16, topo + 2)],
                    fill=rgb(lava))
        c.d.polygon([(cx - larg * 0.1, topo), (cx - larg * 0.05, topo - 3), (cx + larg * 0.05, topo - 3), (cx + larg * 0.1, topo)],
                    fill=rgb('#ffe27a'))
        for dx, tam in ((-0.1, 0.8), (0.02, 1.0), (0.1, 0.6)):
            x, y = cx + larg * dx, topo
            fim = topo + alt * tam
            largura = 3
            while y < fim:
                c.rect(x - 1, y, x + 1, y + 2, rgb('#c2410c'))
                c.rect(x, y, x, y + 2, rgb(lava))
                y += 3
                x += c.rng.choice([-1, 0, 0, 1]) + dx * 2.2
            c.elipse(x, y, 2, 2, rgb('#ffb347'))
        c.translucido(lambda d: d.ellipse((cx - 46, topo - 40, cx + 46, topo + 14), fill=(255, 120, 40, 38)))
    vulcao_(140, HORIZON, 130, 120, '#2c1a1e', '#ff8a2a')
    vulcao_(430, HORIZON, 160, 150, '#24161a', '#ff7a1a')
    vulcao_(300, HORIZON, 90, 90, '#331f22', '#ffb347')
    # fumaça subindo
    for cx, cy in [(140, 40), (150, 24), (430, 16), (440, 4), (300, 80)]:
        c.translucido(lambda d, cx=cx, cy=cy: d.ellipse((cx - 28, cy - 14, cx + 28, cy + 14), fill=(120, 105, 105, 110)))
    c.brilhos(70, (0, 20, W, HORIZON), ['#ffb347', '#ff7a1a', '#ffe27a'])
    c.chao(['#3a3338', '#332d31', '#443c40'], [5, 4, 3], ['#241f22', '#5a4f52', '#6a5c58'], 0.07, neblina='#7a3a28')
    # rachaduras de lava e poças
    for _ in range(18):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 16, H - 10)
        for _ in range(c.rng.randint(8, 20)):
            c.rect(x, y, x + 1, y, rgb('#ff6a1a'))
            c.px(x, y + 1, rgb('#ffb347'))
            x += c.rng.choice([-2, -1, 1, 2])
            y += c.rng.choice([-1, 0, 1, 1])
    for x, y, rx, ry in [(70, 340, 40, 12), (520, 352, 44, 13)]:
        c.elipse(x, y, rx + 2, ry + 2, rgb('#5a2a1a'))
        c.elipse(x, y, rx, ry, rgb('#c2410c'))
        c.elipse(x, y - 1, rx - 4, ry - 3, rgb('#ff7a1a'))
        c.elipse(x - 4, y - 2, rx // 2, ry // 2, rgb('#ffb347'))
    for _ in range(30):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 20, H)
        c.elipse(x, y, 4, 3, rgb('#26242a'))
        c.elipse(x - 1, y - 1, 3, 2, rgb('#403d46'))
    c.sombra_da_arena()
    return c


def caverna():
    c = Cena('caverna', 55)
    # parede do fundo
    for y in range(0, HORIZON + 1):
        t = y / HORIZON
        for x in range(W):
            cor = rgb(c.rng.choice(['#2b2522', '#332c28', '#3a322d']))
            c.px(x, y, mix(cor, rgb('#5a4c40'), 0.45 * t))
    # veios de minério
    for _ in range(90):
        x, y = c.rng.randint(0, W), c.rng.randint(40, HORIZON)
        cor = c.rng.choice(['#e8c547', '#c9d3dc', '#e8c547', '#7fe3ff'])
        c.rect(x, y, x + 1, y + 1, rgb(cor))
    # túnel escuro ao fundo
    c.elipse(300, HORIZON - 4, 70, 78, rgb('#1a1412'))
    c.elipse(300, HORIZON - 4, 62, 70, rgb('#0b0908'))
    c.rect(230, HORIZON - 4, 370, HORIZON + 4, rgb('#0b0908'))
    # estalactites
    for x in range(-10, W + 20, 20):
        alt = c.rng.randint(20, 78)
        meia = c.rng.randint(8, 13)
        c.d.polygon([(x - meia, 0), (x + meia, 0), (x, alt)], fill=rgb('#1c1815'))
        c.d.polygon([(x - meia + 3, 0), (x + 1, 0), (x - 1, alt - 8)], fill=rgb('#2c2622'))
    # escoras de madeira e lanternas
    for x in (60, 190, 410, 540):
        c.rect(x - 6, 60, x + 6, HORIZON, rgb('#3a2418'))
        c.rect(x - 4, 60, x + 4, HORIZON, rgb('#7a4f2e'))
        c.rect(x - 4, 60, x - 2, HORIZON, rgb('#a5743f'))
        c.rect(x - 22, 56, x + 22, 66, rgb('#3a2418'))
        c.rect(x - 22, 58, x + 22, 64, rgb('#7a4f2e'))
        c.translucido(lambda d, x=x: [d.ellipse((x - r, 86 - r, x + r, 86 + r), fill=(255, 200, 90, a))
                                      for r, a in ((54, 14), (36, 20), (20, 30))])
        c.rect(x - 2, 83, x + 2, 90, rgb('#3a2c1a'))
        c.rect(x - 1, 84, x + 1, 89, rgb('#ffe27a'))
    # chão da mina
    c.chao(['#5d5148', '#554a42', '#665a50'], [5, 4, 3], ['#41372f', '#7a6d62', '#8a7c6e'], 0.07, neblina='#8a7c6e')
    for ys in (HORIZON + 40, HORIZON + 150):       # trilhos
        c.rect(0, ys, W, ys + 1, rgb('#9aa3ad'))
        c.rect(0, ys + 5, W, ys + 6, rgb('#9aa3ad'))
        for x in range(0, W, 14):
            c.rect(x, ys - 1, x + 3, ys + 8, rgb('#7a5a3a'))
    for _ in range(14):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 20, H - 6)
        cor = c.rng.choice([('#7fe3ff', '#37a6d4', '#d9f8ff'), ('#e79bff', '#b04fd6', '#f7d9ff')])
        for off, hgt in ((-4, 8), (0, 14), (4, 9)):
            c.d.polygon([(x + off - 3, y), (x + off, y - hgt), (x + off + 3, y)], fill=rgb(cor[1]))
            c.d.polygon([(x + off - 2, y - 1), (x + off, y - hgt + 1), (x + off, y - 1)], fill=rgb(cor[0]))
    for _ in range(10):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 24, H - 6)
        c.elipse(x, y, 14, 5, rgb('#2d5f8a'))
        c.elipse(x - 1, y - 1, 11, 3, rgb('#3f84b8'))
    c.sombra_da_arena()
    return c


def pantano():
    c = Cena('pantano', 66)
    c.degrade(0, HORIZON, ['#0e0a18', '#171126', '#221a36', '#2e2446', '#3c2f58', '#4c3c6a', '#5e4b7a'])
    c.brilhos(70, (0, 0, W, 120), ['#ffffff', '#cfc6f0', '#9a8ccf'])
    # lua
    c.translucido(lambda d: [d.ellipse((470 - r, 66 - r, 470 + r, 66 + r), fill=(200, 190, 255, a)) for r, a in ((60, 18), (46, 28), (34, 40))])
    c.elipse(470, 66, 26, 26, rgb('#e6e1fb'))
    c.elipse(462, 60, 6, 6, rgb('#cfc9ee'))
    c.elipse(478, 74, 8, 8, rgb('#d6d0f2'))
    # nuvens escuras
    for cx, cy in [(120, 50), (300, 90), (520, 120), (40, 120)]:
        c.translucido(lambda d, cx=cx, cy=cy: [d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=(28, 22, 44, 200))
                                              for rx, ry in ((50, 14), (30, 20), (64, 10))])
    # árvores mortas e ciprestes
    def morta(x, base, alt, cor='#120e1c'):
        c.d.line((x, base, x, base - alt), fill=rgb(cor), width=4)
        for k in range(5):
            y = base - alt * (0.35 + k * 0.14)
            lado = -1 if k % 2 else 1
            c.d.line((x, y, x + lado * alt * 0.28, y - alt * 0.18), fill=rgb(cor), width=2)
            c.d.line((x + lado * alt * 0.28, y - alt * 0.18, x + lado * alt * 0.4, y - alt * 0.34), fill=rgb(cor), width=1)
    for x, alt in [(40, 120), (130, 90), (250, 70), (350, 86), (452, 120), (560, 96), (520, 70)]:
        morta(x, HORIZON, alt)
    # capela ao longe
    c.rect(300, HORIZON - 52, 336, HORIZON, rgb('#1a1424'))
    c.d.polygon([(296, HORIZON - 52), (318, HORIZON - 78), (340, HORIZON - 52)], fill=rgb('#120e1c'))
    c.rect(312, HORIZON - 30, 324, HORIZON, rgb('#0b0812'))
    c.rect(316, HORIZON - 46, 320, HORIZON - 38, rgb('#ffd96a'))
    # lápides ao longe
    for x in range(10, W, 36):
        if 290 < x < 350:
            continue
        y = HORIZON - c.rng.randint(0, 6)
        c.rect(x, y - 14, x + 8, y, rgb('#2a2638'))
        c.elipse(x + 4, y - 14, 4, 3, rgb('#2a2638'))
        c.rect(x + 3, y - 10, x + 5, y - 6, rgb('#4a4660'))
    # neblina em faixas
    for y, a in [(HORIZON - 30, 50), (HORIZON - 14, 70), (HORIZON + 2, 80)]:
        c.translucido(lambda d, y=y, a=a: [d.ellipse((x - 90, y - 7, x + 90, y + 7), fill=(150, 140, 190, a)) for x in range(0, W + 90, 120)])
    c.chao(['#2a2a3c', '#262637', '#2f2f42'], [5, 4, 3], ['#4e5a4a', '#5a4e6a', '#1a1a28'], 0.07, neblina='#6a5a88')
    # poças turvas com vitórias-régias
    for x, y, rx, ry in [(70, 330, 56, 16), (510, 340, 60, 18), (300, 372, 70, 14)]:
        c.elipse(x, y, rx + 3, ry + 3, rgb('#2a2638'))
        c.elipse(x, y, rx, ry, rgb('#16201d'))
        for yy in range(int(y - ry), int(y + ry)):
            for xx in range(int(x - rx), int(x + rx)):
                if ((xx - x) / rx) ** 2 + ((yy - y) / ry) ** 2 < 0.85:
                    n = math.sin(xx / 6 + yy / 3.0) + math.sin(yy / 4.0 + xx / 13)
                    c.px(xx, yy, rgb('#2f4a45') if n < 0.4 else rgb('#3e6158'))
        for k in range(3):
            lx, ly = x + (k - 1) * rx * 0.5, y + (k % 2 - 0.5) * ry * 0.6
            c.elipse(lx, ly, 5, 2, rgb('#3f7a3a'))
    c.brilhos(40, (0, HORIZON + 10, W, H), ['#a8e06a', '#c8a8ff', '#e8ffa0'])
    c.sombra_da_arena()
    return c


def tecnologico():
    c = Cena('tecnologico', 77)
    # parede de painéis
    for y in range(0, HORIZON + 1):
        t = y / HORIZON
        c.rect(0, y, W, y, mix(rgb('#252d3a'), rgb('#46546a'), t))
    for x in range(0, W, 50):
        c.rect(x, 24, x, HORIZON, rgb('#161c26'))
        c.rect(x + 1, 24, x + 1, HORIZON, rgb('#5a6a82'))
    for y in range(24, HORIZON, 44):
        c.rect(0, y, W, y, rgb('#161c26'))
        c.rect(0, y + 1, W, y + 1, rgb('#5a6a82'))
    # teto, vigas e luzes
    c.rect(0, 0, W, 22, rgb('#141a24'))
    c.rect(0, 22, W, 24, rgb('#5a6a82'))
    for x in range(30, W, 90):
        c.rect(x, 6, x + 44, 14, rgb('#e8f6ff'))
        c.translucido(lambda d, x=x: d.polygon([(x, 14), (x + 44, 14), (x + 90, 150), (x - 46, 150)], fill=(160, 230, 255, 18)))
    # telas com gráficos
    for x0, tipo in [(70, 0), (250, 1), (430, 2)]:
        c.rect(x0 - 2, 46, x0 + 102, 138, rgb('#0b0f16'))
        c.rect(x0, 48, x0 + 100, 136, rgb('#0e2a2a'))
        for gx in range(x0, x0 + 100, 10):
            c.rect(gx, 48, gx, 136, rgb('#14423f'))
        for gy in range(48, 136, 10):
            c.rect(x0, gy, x0 + 100, gy, rgb('#14423f'))
        cor = ['#33ff99', '#33ccff', '#ffdd55'][tipo]
        ant = None
        for gx in range(x0 + 2, x0 + 98, 2):
            gy = 92 + math.sin(gx / (6 + tipo * 3)) * 22 + c.rng.randint(-3, 3)
            if ant:
                c.d.line((ant[0], ant[1], gx, gy), fill=rgb(cor))
            ant = (gx, gy)
        c.rect(x0, 128, x0 + 100, 130, rgb('#0b0f16'))
        c.rect(x0 + 4, 129, x0 + 4 + 14 * (tipo + 2), 129, rgb(cor))
    # racks com LEDs nas laterais
    for x0 in (8, 560):
        c.rect(x0, 40, x0 + 32, HORIZON, rgb('#10151d'))
        for yy in range(46, HORIZON - 8, 12):
            c.rect(x0 + 3, yy, x0 + 29, yy + 8, rgb('#232c3a'))
            for k in range(4):
                c.rect(x0 + 6 + k * 6, yy + 3, x0 + 8 + k * 6, yy + 5, rgb(c.rng.choice(['#33ff99', '#ff5577', '#ffdd55'])))
    # faixa de perigo e tubulações
    for x in range(0, W, 16):
        c.d.polygon([(x, 148), (x + 8, 148), (x + 4, 156), (x - 4, 156)], fill=rgb('#ffdd55'))
    c.rect(0, 146, W, 147, rgb('#10151d'))
    c.rect(0, 157, W, 158, rgb('#10151d'))
    for y in (164, 176):
        c.rect(0, y, W, y + 5, rgb('#10151d'))
        c.rect(0, y + 1, W, y + 4, rgb('#7a8aa2'))
        c.rect(0, y + 1, W, y + 1, rgb('#b6c4d8'))
    # piso metálico com perspectiva
    for y in range(HORIZON, H):
        t = (y - HORIZON) / (H - HORIZON)
        c.rect(0, y, W, y, mix(rgb('#6a7890'), rgb('#2c3646'), t))
    ponto = 300
    for k in range(-14, 15):
        xb = ponto + k * 110
        c.d.line((ponto + k * 8, HORIZON, xb, H), fill=rgb('#1c2430'))
    y = HORIZON
    passo = 5
    while y < H:
        c.rect(0, int(y), W, int(y), rgb('#1c2430'))
        y += passo
        passo *= 1.22
    c.brilhos(40, (0, HORIZON + 10, W, H), ['#33ccff', '#33ff99'])
    c.sombra_da_arena()
    return c


def pico():
    c = Cena('pico', 88)
    c.degrade(0, HORIZON, ['#6fb6ea', '#87c4ef', '#a0d2f3', '#b9dff7', '#d0eafa', '#e4f4fc', '#f2faff'])
    c.elipse(110, 56, 22, 22, rgb('#fffbe6'))
    c.translucido(lambda d: [d.ellipse((110 - r, 56 - r, 110 + r, 56 + r), fill=(255, 255, 255, a)) for r, a in ((54, 20), (38, 30))])
    for x, y, e in [(300, 46, 1.0), (520, 80, 0.9), (420, 24, 0.7), (40, 110, 0.7)]:
        c.nuvem(x, y, e, '#ffffff', '#d4e6f4')

    def montanha(cx, base, alt, larg, rocha, neve):
        pts = [(cx - larg, base), (cx - larg * 0.35, base - alt * 0.62), (cx - larg * 0.1, base - alt * 0.7),
               (cx, base - alt), (cx + larg * 0.14, base - alt * 0.72), (cx + larg * 0.4, base - alt * 0.5), (cx + larg, base)]
        c.d.polygon(pts, fill=rgb(rocha))
        # sombra do lado direito
        c.translucido(lambda d: d.polygon([(cx, base - alt), (cx + larg * 0.14, base - alt * 0.72), (cx + larg * 0.4, base - alt * 0.5),
                                           (cx + larg, base), (cx + larg * 0.2, base)], fill=(30, 60, 110, 70)))
        topo = [(cx - larg * 0.35, base - alt * 0.62), (cx - larg * 0.1, base - alt * 0.7), (cx, base - alt), (cx + larg * 0.14, base - alt * 0.72),
                (cx + larg * 0.4, base - alt * 0.5)]
        c.d.polygon(topo + [(cx + larg * 0.22, base - alt * 0.52), (cx + larg * 0.1, base - alt * 0.6), (cx, base - alt * 0.5),
                            (cx - larg * 0.1, base - alt * 0.58), (cx - larg * 0.24, base - alt * 0.5)], fill=rgb(neve))
    montanha(90, HORIZON, 140, 130, '#8aa4c4', '#ffffff')
    montanha(300, HORIZON, 170, 160, '#7a96b8', '#ffffff')
    montanha(500, HORIZON, 150, 140, '#8aa4c4', '#ffffff')
    montanha(200, HORIZON, 90, 110, '#a4bcd8', '#f4fbff')
    montanha(420, HORIZON, 80, 100, '#a4bcd8', '#f4fbff')
    c.rect(0, HORIZON - 18, W, HORIZON + 1, rgb('#f2f8fc'))
    rng = c.rng
    for x in range(8, W, 24):
        c.pinheiro(x + rng.randint(-4, 4), HORIZON - rng.randint(0, 6), rng.randint(36, 56), neve=True)
    c.chao(['#f2f8fc', '#e9f2f9', '#f8fcff'], [5, 4, 3], ['#cfe3f1', '#ffffff'], 0.06, neblina='#ffffff', escurecer=0.22)
    for x, y, rx, ry in [(80, 330, 50, 12), (520, 345, 56, 14), (300, 380, 60, 10)]:
        c.elipse(x, y, rx + 2, ry + 2, rgb('#8ac0e0'))
        c.elipse(x, y, rx, ry, rgb('#b8dcf0'))
        c.elipse(x - 6, y - 2, rx // 2, ry // 2, rgb('#dff2fb'))
    for _ in range(14):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 24, H - 4)
        c.elipse(x, y, 9, 4, rgb('#d8e8f4'))
        c.elipse(x - 2, y - 1, 6, 2, rgb('#ffffff'))
    c.brilhos(90, (0, HORIZON + 4, W, H), ['#ffffff', '#cfe9ff'])
    c.sombra_da_arena()
    return c


def santuario():
    c = Cena('santuario', 99)
    c.degrade(0, HORIZON, ['#4a3a9a', '#6a4fb0', '#8a62c0', '#b078cc', '#d490d4', '#ecaedc', '#f8cce6'])
    c.brilhos(140, (0, 0, W, HORIZON - 20), ['#ffffff', '#fff6a8', '#d6c8ff'])
    c.translucido(lambda d: [d.ellipse((300 - r * 2, 60 - r, 300 + r * 2, 60 + r), fill=(255, 220, 255, a)) for r, a in ((60, 14), (40, 22), (24, 34))])
    # montanhas encantadas ao fundo
    c.serra(HORIZON - 26, 46, '#a07ad0', semente=4, picos=1.4)
    c.serra(HORIZON - 8, 32, '#7e5cb8', semente=5, picos=1.8)
    # cogumelos gigantes
    def gigante(x, base, alt, cap):
        larg = alt * 0.5
        c.rect(x - alt * 0.1, base - alt * 0.6, x + alt * 0.1, base, rgb('#f2e6f6'))
        c.rect(x - alt * 0.1, base - alt * 0.6, x - alt * 0.04, base, rgb('#fff6ff'))
        c.d.pieslice((x - larg, base - alt * 1.1, x + larg, base - alt * 0.1), 180, 360, fill=rgb(cap[0]))
        c.d.pieslice((x - larg + 2, base - alt * 1.1 + 2, x + larg - 4, base - alt * 0.15), 180, 360, fill=rgb(cap[1]))
        for k in range(4):
            c.elipse(x - larg * 0.5 + k * larg * 0.33, base - alt * 0.7 - (k % 2) * alt * 0.12, max(2, alt * 0.05), max(2, alt * 0.05), rgb(cap[2]))
    caps = [('#7a2fa0', '#b84fd6', '#f6d3ff'), ('#a0306a', '#e0508f', '#ffd0e3'), ('#3a44a8', '#5a6be0', '#d0d6ff')]
    for x, alt, i in [(40, 110, 0), (120, 70, 2), (230, 90, 1), (370, 60, 0), (470, 120, 2), (560, 80, 1)]:
        gigante(x, HORIZON + 2, alt, caps[i])
    # pontos de luz flutuando
    c.translucido(lambda d: [d.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(255, 250, 170, 70))
                             for x, y in [(80, 120), (180, 80), (300, 130), (420, 90), (520, 140), (250, 60)]])
    c.brilhos(24, (0, 40, W, HORIZON - 10), ['#fff6a8'], 2)
    c.chao(['#8fe0b8', '#86d8b0', '#98e8c4'], [5, 3, 3], ['#6fc4a0', '#c8f6dc'], 0.05, neblina='#d8f6e8')
    # lagos de cristal
    for x, y, rx, ry in [(80, 336, 56, 14), (520, 350, 64, 16)]:
        c.elipse(x, y, rx + 3, ry + 3, rgb('#4aa7bd'))
        c.elipse(x, y, rx, ry, rgb('#d6f8ff'))
        c.elipse(x, y, rx - 3, ry - 3, rgb('#8adcf4'))
        c.elipse(x - 6, y - 2, rx // 2, ry // 2, rgb('#b8ecfa'))
    for _ in range(26):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 20, H - 4)
        cap = c.rng.choice(caps)
        c.elipse(x, y, 4, 3, rgb(cap[1]))
        c.px(x - 1, y - 1, rgb(cap[2]))
        c.rect(x, y + 2, x, y + 3, rgb('#f2e6f6'))
    for _ in range(60):
        x, y = c.rng.randint(0, W), c.rng.randint(HORIZON + 20, H)
        c.rect(x, y, x + 1, y + 1, rgb(c.rng.choice(['#ffffff', '#ffd6f5', '#d6e0ff'])))
    c.sombra_da_arena()
    return c


def estadio():
    """Fundo padrão (ginásios, torneios e treinadores): um estádio com arquibancadas e holofotes."""
    c = Cena('estadio', 123)
    for y in range(0, HORIZON + 1):
        t = y / HORIZON
        c.rect(0, y, W, y, mix(rgb('#080c1a'), rgb('#1c2a4a'), t))
    # holofotes
    for x, a in [(70, 24), (200, 20), (400, 20), (530, 24)]:
        c.luz([(x - 4, 0), (x + 4, 0), (x + 70, HORIZON), (x - 70, HORIZON)], (190, 220, 255, a))
    # arquibancadas em degraus, uma de cada lado e uma no fundo
    for fila in range(7):
        y0 = 70 + fila * 18
        cor_degrau = mix(rgb('#1a2338'), rgb('#2c3c5e'), fila / 6)
        c.rect(0, y0, W, y0 + 15, cor_degrau)
        c.rect(0, y0 + 14, W, y0 + 15, rgb('#0c1220'))
        for x in range(2 + (fila % 2) * 4, W, 8):
            cor = c.rng.choice(['#e8503a', '#3a8ae8', '#e8c53a', '#f0f0f0', '#7a5ae8', '#3ae88a', '#2a3450', '#2a3450', '#2a3450'])
            c.rect(x, y0 + 3, x + 3, y0 + 7, rgb(cor))
            c.rect(x + 1, y0 + 8, x + 2, y0 + 12, rgb('#10172a'))
    # faixa de patrocínio / balaústre
    c.rect(0, 192, W, 198, rgb('#0a0f1c'))
    for x in range(0, W, 30):
        cor = ['#e8503a', '#f0f0f0'][(x // 30) % 2]
        c.rect(x, 193, x + 25, 196, rgb(cor))
    # estandartes com Poké Bola
    for x in (150, 450):
        c.rect(x - 14, 0, x + 14, 52, rgb('#7a1a1a'))
        c.d.polygon([(x - 14, 52), (x, 62), (x + 14, 52)], fill=rgb('#7a1a1a'))
        c.rect(x - 12, 0, x + 12, 50, rgb('#b32424'))
        c.elipse(x, 26, 9, 9, rgb('#f0f0f0'), rgb('#0a0f1c'))
        c.d.pieslice((x - 9, 17, x + 9, 35), 180, 360, fill=rgb('#e8503a'))
        c.rect(x - 9, 25, x + 9, 27, rgb('#0a0f1c'))
        c.elipse(x, 26, 3, 3, rgb('#f0f0f0'), rgb('#0a0f1c'))
    # piso do estádio
    c.chao(['#2a3552', '#263050', '#2e3a5a'], [5, 4, 3], ['#1c2440', '#44527a'], 0.05, neblina='#5a6a98', escurecer=0.4)
    for x in range(-300, W + 300, 60):
        c.d.line((300 + (x - 300) * 0.12, HORIZON, x, H), fill=rgb('#1c2440'))
    y, passo = HORIZON, 5
    while y < H:
        c.rect(0, int(y), W, int(y), rgb('#1c2440'))
        y += passo
        passo *= 1.22
    c.sombra_da_arena()
    return c


CENAS = [campina, floresta, litoral, vulcao, caverna, pantano, tecnologico, pico, santuario, estadio]

# Onde os Pokémon pisam na arena (frações da imagem 600x400, do canto de cima à esquerda) e para onde olham.
# Medido no desenho de referência: os dois ficam no fundo do gramado, um de cada lado da Poké Bola, de perfil.
POSICOES = {
    'jogador': {'x': 0.243, 'y': 0.573, 'olhando': 'direita'},
    'adversario': {'x': 0.764, 'y': 0.557, 'olhando': 'esquerda'},
}


def main():
    PASTA.joinpath('fundos').mkdir(parents=True, exist_ok=True)
    PASTA.joinpath('prontas').mkdir(parents=True, exist_ok=True)
    plataforma = extrair_plataforma()
    for build in CENAS:
        cena = build()
        fundo = cena.salvar()
        pronta = fundo.copy()
        pronta.alpha_composite(plataforma)
        pronta.convert('RGB').save(PASTA / 'prontas' / f'{cena.id}.png', optimize=True)
        print(f'{cena.id:12} ok')
    out = ROOT / 'packages' / 'data' / 'catalog' / 'arenas.json'
    out.write_text(json.dumps({'largura': W, 'altura': H, 'horizonte': HORIZON, 'posicoes': POSICOES,
                               'cenarios': [b.__name__ for b in CENAS]}, indent=1) + '\n')


if __name__ == '__main__':
    sys.exit(main())
