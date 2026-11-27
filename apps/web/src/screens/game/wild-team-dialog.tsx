import { ArrowDown, ArrowUp, Footprints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { teamCombatants } from '@/lib/battle/session';
import type { ChangeGame, GameState } from '@/lib/game-state';
import { leadOf, shiftTeamMember } from '@/lib/pokemon-collection';
import { isFainted } from '@/lib/pokemon-center';
import { PokemonSprite, pokemonName } from './pokemon-ui';

const statusNames = { burn: 'Queimado', poison: 'Envenenado', paralysis: 'Paralisado', sleep: 'Dormindo', freeze: 'Congelado' } as const;

/** Equipe na tela de selvagens: HP atual de cada Pokémon e a ordem em que eles entram na luta. */
export default function WildTeamDialog({ game, change, open, onOpenChange }: {
  game: GameState; change: ChangeGame; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { team } = game.collection;
  const lead = leadOf(game.collection);
  const maxHp = new Map(teamCombatants(team).map((combatant) => [combatant.ref, combatant.stats.hp]));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sua equipe</DialogTitle>
          <DialogDescription>Quem está em cima entra primeiro. Se o primeiro estiver desmaiado, abre a luta o próximo que puder lutar.</DialogDescription>
        </DialogHeader>
        <ol className="grid gap-2" aria-label="Ordem da equipe">
          {team.map((pokemon, index) => {
            const max = maxHp.get(pokemon.uid) ?? 1;
            const hp = Math.min(max, pokemon.hp ?? max);
            const fainted = isFainted(pokemon);
            const name = pokemonName(pokemon);
            return (
              <li key={pokemon.uid} className="flex items-center gap-2 rounded-lg border p-2" data-fainted={fainted || undefined}>
                <span className="w-5 text-center text-sm font-bold text-muted-foreground" aria-hidden="true">{index + 1}</span>
                <PokemonSprite pokemon={pokemon} className={`dex-thumb team-row-sprite${fainted ? ' opacity-50 grayscale' : ''}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <strong className="truncate">{name}</strong>
                    <span className="text-xs text-muted-foreground">Nv {pokemon.level}</span>
                    {pokemon.uid === lead?.uid && <span className="rounded bg-primary px-1.5 py-0.5 text-[0.65rem] font-bold text-primary-foreground">Abre a luta</span>}
                    {pokemon.uid === game.collection.companion && <Footprints className="size-3.5 text-muted-foreground" aria-label="Companheiro" role="img" />}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`HP de ${name}: ${hp} de ${max}`}>
                    <div className="h-full bg-primary" style={{ width: `${(hp / max) * 100}%`, opacity: fainted ? 0.35 : 1 }} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fainted ? 'Desmaiado' : `${hp}/${max} HP`}{pokemon.status && !fainted ? ` · ${statusNames[pokemon.status]}` : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="outline" aria-label={`Subir ${name}`} disabled={index === 0}
                    onClick={() => change((state) => ({ ...state, collection: shiftTeamMember(state.collection, pokemon.uid, -1) }))}><ArrowUp aria-hidden="true" /></Button>
                  <Button size="icon" variant="outline" aria-label={`Descer ${name}`} disabled={index === team.length - 1}
                    onClick={() => change((state) => ({ ...state, collection: shiftTeamMember(state.collection, pokemon.uid, 1) }))}><ArrowDown aria-hidden="true" /></Button>
                </div>
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
