"""Gera os catálogos compactos do sistema de batalha a partir do catálogo do projeto antigo (PokemonSimulator-Remake).

Uso: python scripts/gerar-dados-batalha.py <pasta packages/data/catalog do Remake>
Saída (packages/data/catalog/): battle-moves.json, battle-species.json, battle-items.json, battle-tms.json
"""
import json
import sys
from pathlib import Path

origem = Path(sys.argv[1])
saida = Path(__file__).resolve().parent.parent / 'packages' / 'data' / 'catalog'

SELF_KO = {'self-destruct', 'explosion', 'misty-explosion', 'memento', 'healing-wish', 'lunar-dance', 'final-gambit'}

moves = json.loads((origem / 'moves.json').read_text(encoding='utf-8'))
usaveis = {m['name'] for m in moves if m['name'] not in SELF_KO and (m['category'] == 'status' or m['power'] > 0)}

# Golpes: um objeto por golpe, só com os campos que o motor usa (o leitor recoloca os valores vazios).
campos = ['name', 'displayName', 'type', 'category', 'power', 'accuracy', 'pp', 'priority', 'target', 'ailment',
          'ailmentChance', 'flinchChance', 'critRate', 'drain', 'healing', 'minHits', 'maxHits', 'statChanges', 'statChance']
compactos = []
for m in moves:
    c = {k: m[k] for k in campos}
    for k, v in list(c.items()):
        if k in ('name', 'displayName', 'type', 'category', 'power', 'accuracy', 'pp', 'priority'):
            continue
        if v in (None, 0, [], ''):
            del c[k]
    compactos.append(c)
(saida / 'battle-moves.json').write_text(json.dumps(compactos, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

# Espécies: atributos base, dados de captura/XP e golpes aprendidos por nível ([nível, golpe]).
species = json.loads((origem / 'species.json').read_text(encoding='utf-8'))
out = []
for s in species:
    learn = sorted({(e['level'], e['move']) for e in s['learnset'] if e['method'] == 'level-up' and e['move'] in usaveis})
    out.append({
        'id': s['id'], 'types': s['types'],
        'stats': [s['baseStats'][k] for k in ('hp', 'atk', 'def', 'spa', 'spd', 'spe')],
        'exp': s['baseExp'], 'catch': s['captureRate'], 'growth': s['growthRate'],
        'weight': s['weight'], 'height': s['height'], 'happy': s['baseHappiness'],
        'learn': [[lv, mv] for lv, mv in learn],
    })
(saida / 'battle-species.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

# TMs: golpes que cada espécie aprende por máquina. Um índice na lista `names` em vez do nome, para ficar pequeno;
# o arquivo é carregado só quando alguém abre a área de golpes.
nomes = sorted({e['move'] for s in species for e in s['learnset'] if e['method'] == 'machine' and e['move'] in usaveis})
indice = {n: i for i, n in enumerate(nomes)}
tm = {}
for s in species:
    ids = sorted({indice[e['move']] for e in s['learnset'] if e['method'] == 'machine' and e['move'] in usaveis})
    if ids:
        tm[str(s['id'])] = ids
(saida / 'battle-tms.json').write_text(json.dumps({'names': nomes, 'tm': tm}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

# Itens usados em batalha: bolas e itens de cura.
items = json.loads((origem / 'items.json').read_text(encoding='utf-8'))
uteis = [{'name': i['name'], 'displayName': i['displayName'], 'category': i['category'], 'description': i['description'], 'price': i['price']}
         for i in items if i['category'] in ('captura', 'cura')]
(saida / 'battle-items.json').write_text(json.dumps(uteis, ensure_ascii=False, indent=1), encoding='utf-8')
print(len(compactos), 'golpes,', len(out), 'espécies,', len(uteis), 'itens')
