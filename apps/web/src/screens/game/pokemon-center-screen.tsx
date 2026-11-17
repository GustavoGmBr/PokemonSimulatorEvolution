import { useState } from 'react';
import { HeartPulse, Hospital } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChangeGame, GameState } from '@/lib/game-state';
import { healTeam } from '@/lib/pokemon-center';
import { PokemonSprite, pokemonName } from './pokemon-ui';

export default function PokemonCenterScreen({ game, change }: { game: GameState; change: ChangeGame }) {
  const [message, setMessage] = useState('');
  return <section className="game-panel grid gap-4" aria-labelledby="pokemon-center-title">
    <div className="flex items-center gap-3">
      <Hospital aria-hidden="true" className="size-8 text-primary" />
      <div><h2 id="pokemon-center-title" className="game-section-title">Centro Pokémon</h2>
        <p className="text-sm text-muted-foreground">Recupere o HP e cure as condições de status da sua equipe.</p></div>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {game.collection.team.map((pokemon) => <div key={pokemon.uid} className="flex items-center gap-2 rounded-lg border p-2">
        <PokemonSprite pokemon={pokemon} className="dex-thumb pokemon-center-sprite" />
        <div className="min-w-0"><strong className="block truncate">{pokemonName(pokemon)}</strong>
          <span className="text-xs text-muted-foreground">Nv. {pokemon.level}{pokemon.hp === 0 ? ' · Desmaiado' : ''}{pokemon.status ? ` · ${pokemon.status}` : ''}</span></div>
      </div>)}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => setMessage(change(healTeam) ?? 'Sua equipe foi curada.')}><HeartPulse aria-hidden="true" /> Curar equipe gratuitamente</Button>
      <span className="text-sm text-muted-foreground">A cura é gratuita neste Centro Pokémon.</span>
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
