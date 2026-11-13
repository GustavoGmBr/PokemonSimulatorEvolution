import type { ReactNode } from 'react';
import { Footprints, Heart, Sparkles } from 'lucide-react';
import { getPokemon } from '@pokesim-evolution/data/pokedex';
import { alertStars, ivStars, starText } from '@/lib/ivs';
import { battleMoves } from '@pokesim-evolution/data/battle-data';
import { currentMoves } from '@/lib/battle/moveset';
import { teamSize, type OwnedPokemon } from '@/lib/pokemon-collection';
import { GameSprite, spriteSheetUrl } from './pokedex-media';
import { formOf, localFormSprite, remoteFormSprite } from '@/lib/training';
import '@/styles/iv.css';
import '@/styles/pokedex.css';
import '@/styles/pc.css';

export function speciesName(pokemon: OwnedPokemon) {
  return formOf(pokemon)?.displayName ?? getPokemon(pokemon.species)?.displayName ?? `Espécie ${pokemon.species}`;
}

export function pokemonName(pokemon: OwnedPokemon) {
  return pokemon.nickname ?? speciesName(pokemon);
}

export function describePokemon(pokemon: OwnedPokemon) {
  const stars = ivStars(pokemon.ivs);
  return `${pokemonName(pokemon)}, nível ${pokemon.level}${pokemon.shiny ? ', brilhante' : ''}${stars >= alertStars ? `, ${stars} estrelas` : ''}${pokemon.favorite ? ', favorito' : ''}`;
}

/** Sprite do jogo (quadro frontal da folha), na versão brilhante quando for o caso. */
export function PokemonSprite({ pokemon, className = 'pc-sprite' }: { pokemon: OwnedPokemon; className?: string }) {
  const form = formOf(pokemon);
  const local = form && localFormSprite(form.name);
  const sprite = local ?? getPokemon(pokemon.species)?.sprite;
  if (form && !local) return <span className={className}><img key={`${form.spriteId}:${pokemon.shiny}`} className="pokemon-form-preview" src={remoteFormSprite(form.spriteId, pokemon.shiny)} alt=""
    onError={(event) => { if (sprite && !event.currentTarget.dataset.fallback) {
      event.currentTarget.dataset.fallback = 'true';
      event.currentTarget.src = spriteSheetUrl(sprite, pokemon.shiny);
      event.currentTarget.classList.add('pokemon-form-fallback');
    } }} /></span>;
  return sprite
    ? <GameSprite sprite={sprite} shiny={pokemon.shiny} className={className} />
    : <span className={`${className} pc-sprite-missing`} aria-hidden="true" />;
}

export function PokemonMarks({ pokemon }: { pokemon: OwnedPokemon }) {
  const stars = ivStars(pokemon.ivs);
  return (
    <>
      {pokemon.shiny && <Sparkles className="pc-mark pc-mark-shiny" aria-hidden="true" />}
      {stars >= alertStars && (
        <span className="pc-mark-stars" data-grade={stars >= 4 ? 'perfect' : 'great'} aria-hidden="true">{starText(stars)}</span>
      )}
      {pokemon.favorite && <Heart className="pc-mark pc-mark-favorite" aria-hidden="true" fill="currentColor" />}
    </>
  );
}

/** Cartão de um Pokémon da equipe (uma linha), usado na Visão geral e na tela Equipe. */
export function TeamRow({ pokemon, slot, onOpen, trailing, companion = false, showMoves = false }: {
  pokemon: OwnedPokemon; slot: number; onOpen: () => void; trailing?: ReactNode; companion?: boolean; showMoves?: boolean;
}) {
  const species = speciesName(pokemon);
  return (
    <button type="button" className="game-starter game-starter-button team-row" aria-haspopup="dialog"
      aria-label={`${describePokemon(pokemon)}${companion ? ', companheiro' : ''}, vaga ${slot + 1} da equipe. Abrir ficha`} onClick={onOpen}>
      <span className="team-row-slot" aria-hidden="true">{slot + 1}</span>
      <PokemonSprite pokemon={pokemon} className="dex-thumb team-row-sprite" />
      <span className="min-w-0 text-left">
        <strong className="block truncate">{pokemonName(pokemon)}</strong>
        <span className="block truncate text-sm text-muted-foreground">
          {pokemon.nickname ? `${species} · ` : ''}Nv {pokemon.level}
        </span>
        {showMoves && (
          <span className="team-row-moves" aria-label="Golpes">
            {currentMoves(pokemon).map((name) => <span key={name} className="team-row-move" data-type={battleMoves.get(name)?.type}>{battleMoves.get(name)?.displayName ?? name}</span>)}
          </span>
        )}
      </span>
      <span className="team-row-marks">
        <PokemonMarks pokemon={pokemon} />
        {companion && <Footprints className="pc-mark" aria-label="Companheiro" role="img" />}
      </span>
      {trailing}
    </button>
  );
}

export function EmptySlotRow({ slot }: { slot: number }) {
  return (
    <div className="team-row-empty" aria-label={`Vaga ${slot + 1} da equipe livre`}>
      <span className="team-row-slot" aria-hidden="true">{slot + 1}</span>
      <span className="text-sm text-muted-foreground">Vaga livre</span>
    </div>
  );
}

export function TeamList({ team, onOpen, showEmpty = true, companion, showMoves = false }: {
  team: OwnedPokemon[]; onOpen: (uid: string) => void; showEmpty?: boolean; companion?: string; showMoves?: boolean;
}) {
  return (
    <div className="team-list">
      {team.map((pokemon, index) => (
        <TeamRow key={pokemon.uid} pokemon={pokemon} slot={index} companion={pokemon.uid === companion}
          onOpen={() => onOpen(pokemon.uid)} showMoves={showMoves} />
      ))}
      {showEmpty && Array.from({ length: teamSize - team.length }, (_, index) => (
        <EmptySlotRow key={`empty-${index}`} slot={team.length + index} />
      ))}
    </div>
  );
}
