import { useState } from 'react';
import { formatDexNumber, getPokemon } from '@pokesim-evolution/data/pokedex';
import type { EvolutionNode } from '@pokesim-evolution/data/pokedex-details';
import '@/styles/evolution.css';

const spriteSources = (id: number) => [
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
];

function EvolutionCard({ speciesId, current }: { speciesId: number; current: boolean }) {
  const entry = getPokemon(speciesId);
  const [sourceIndex, setSourceIndex] = useState(0);
  if (!entry) return null;
  const sources = spriteSources(speciesId);
  return <article className="evolution-card" data-current={current} aria-current={current ? 'true' : undefined}>
    {sourceIndex < sources.length ? <img className="evolution-sprite" src={sources[sourceIndex]} alt={`${entry.displayName} — artwork da PokéAPI`}
      loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setSourceIndex((index) => index + 1)} /> :
      <span className="evolution-sprite evolution-sprite-empty" role="img" aria-label={`Imagem de ${entry.displayName} indisponível`}>?</span>}
    <span className="evolution-card-copy"><strong>{entry.displayName}</strong>
      <small>{formatDexNumber(entry.id)}{current ? ' · Seu Pokémon' : ''}</small></span>
  </article>;
}

function findCurrent(node: EvolutionNode, speciesId: number): EvolutionNode | undefined {
  if (node.speciesId === speciesId) return node;
  for (const child of node.evolvesTo) {
    const match = findCurrent(child, speciesId);
    if (match) return match;
  }
  return undefined;
}

export function EvolutionLine({ chain, currentSpecies }: { chain: EvolutionNode | null; currentSpecies: number }) {
  if (!chain) return <p className="text-sm text-muted-foreground">Próxima evolução indisponível.</p>;
  const current = findCurrent(chain, currentSpecies);
  if (!current) return <p className="text-sm text-muted-foreground">Não foi possível localizar este Pokémon na linha evolutiva.</p>;
  return <div className="evolution-line">
    <p className="text-sm text-muted-foreground">Próxima evolução</p>
    <div className="evolution-next-row">
      <EvolutionCard speciesId={current.speciesId} current />
      {current.evolvesTo.length > 0 ? <>
        <span className="evolution-next-arrow" aria-hidden="true">→</span>
        <div className="evolution-next-list" aria-label="Próximas evoluções">
          {current.evolvesTo.map((node) => <EvolutionCard key={node.speciesId} speciesId={node.speciesId} current={false} />)}
        </div>
      </> : <span className="text-sm text-muted-foreground">Este Pokémon não evolui mais.</span>}
    </div>
  </div>;
}
