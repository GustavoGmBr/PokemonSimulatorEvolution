import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canFight, healTeam, isFainted } from './pokemon-center.ts';
import { leadOf, shiftTeamMember, type Collection, type OwnedPokemon } from './pokemon-collection.ts';

const mon = (uid: string, hp?: number): OwnedPokemon => ({ uid, species: 25, level: 5, ...(hp === undefined ? {} : { hp }) }) as OwnedPokemon;
const collection = (team: OwnedPokemon[], companion: string | null = null): Collection => ({ team, boxes: [], companion }) as unknown as Collection;

test('subir e descer troca a posição e não passa dos limites', () => {
  const base = collection([mon('a'), mon('b'), mon('c')]);
  assert.deepEqual(shiftTeamMember(base, 'c', -1).team.map((p) => p.uid), ['a', 'c', 'b']);
  assert.deepEqual(shiftTeamMember(base, 'a', 1).team.map((p) => p.uid), ['b', 'a', 'c']);
  assert.equal(shiftTeamMember(base, 'a', -1), base);
  assert.equal(shiftTeamMember(base, 'c', 1), base);
  assert.equal(shiftTeamMember(base, 'x', 1), base);
});

test('quem sobe para a primeira vaga vira o companheiro', () => {
  const next = shiftTeamMember(collection([mon('a'), mon('b')], 'a'), 'b', -1);
  assert.equal(next.team[0]!.uid, 'b');
  assert.equal(next.companion, 'b');
});

test('o líder é o companheiro de pé; se ele desmaiou, o primeiro da ordem que puder lutar', () => {
  assert.equal(leadOf(collection([mon('a'), mon('b'), mon('c')], 'c'))?.uid, 'c');
  assert.equal(leadOf(collection([mon('a', 0), mon('b'), mon('c', 0)], 'c'))?.uid, 'b');
  assert.equal(leadOf(collection([mon('a', 0), mon('b', 0)]))?.uid, undefined);
});

test('desmaiado é HP zero salvo; sem HP salvo o Pokémon está inteiro', () => {
  assert.equal(isFainted(mon('a', 0)), true);
  assert.equal(isFainted(mon('a', 3)), false);
  assert.equal(isFainted(mon('a')), false);
  assert.equal(canFight([mon('a', 0), mon('b', 0)]), false);
  assert.equal(canFight([mon('a', 0), mon('b')]), true);
});

test('curar a equipe remove o HP salvo e os status', () => {
  const healed = healTeam({ collection: collection([{ ...mon('a', 0), status: 'burn' } as OwnedPokemon]) } as never);
  assert.equal(healed.collection.team[0]!.hp, undefined);
  assert.equal(healed.collection.team[0]!.status, null);
});
