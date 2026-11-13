import type { Starter } from '@/lib/journey-saves';
import type { TrainerSprite } from '@/lib/trainer-sprites';
import { getPokemon, typeLabels } from '@pokesim-evolution/data/pokedex';
import { starterSpeciesIds } from '@/lib/journey-saves';
import { spriteSheetUrl } from '@/screens/game/pokedex-media';

/** Tipos do inicial (ex.: "Planta / Venenoso"), tirados da Pokédex. */
export function starterTypes(starter: Starter) {
  return (getPokemon(starterSpeciesIds[starter])?.types ?? []).map((type) => typeLabels[type] ?? type).join(' / ');
}

export function StarterSpritePreview({ starter }: { starter: Starter }) {
  const sprite = getPokemon(starterSpeciesIds[starter])?.sprite;
  return <span className="starter-sprite" style={sprite ? { backgroundImage: `url("${spriteSheetUrl(sprite, false)}")` } : undefined}
    aria-hidden="true" />;
}

export function TrainerSpritePreview({ sprite, lazy = false }: { sprite: TrainerSprite; lazy?: boolean }) {
  return (
    <span className="trainer-sprite-preview" aria-hidden="true">
      <img src={sprite.url} alt="" loading={lazy ? 'lazy' : 'eager'} decoding="async" />
    </span>
  );
}
