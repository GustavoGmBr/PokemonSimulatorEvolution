import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { typeLabels } from '@pokesim-evolution/data/pokedex';

const badges = import.meta.glob<string>('../../assets/type-badges/*.png', {
  eager: true, import: 'default', query: '?url',
});

const typeIds = [
  'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel',
  'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy',
];

export function TypeBadge({ type, multiplier }: { type: string; multiplier?: number }) {
  const name = typeLabels[type] ?? type;
  const id = typeIds.indexOf(type) + 1;
  const badge = badges[`../../assets/type-badges/${id}.png`];
  return (
    <span className="dex-type" data-type={type}>
      {badge ? <img src={badge} width="200" height="40" alt={name} title={name} /> : name}
      {multiplier !== undefined && <b>×{multiplier}</b>}
    </span>
  );
}

const baseUrl = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const recursosUrl = `${import.meta.env.BASE_URL}recursos`;

// Os sprites ficam em recursos/ e são servidos pelo plugin de vite.config.ts em /recursos/.
// Cada imagem só é pedida quando aparece na tela, em vez de entrar no pacote do aplicativo.
export function spriteSheetUrl(sprite: string, shiny: boolean) {
  return `${recursosUrl}/${shiny ? 'Shinys' : 'Pokemons'}/${encodeURIComponent(sprite)}.png`;
}

// A folha tem 4x4 quadros; o primeiro (canto superior esquerdo) é o Pokémon de frente.
export function GameSprite({ sprite, shiny = false, label, className = 'dex-pixel-sheet', onMissing }: {
  sprite: string;
  shiny?: boolean;
  label?: string;
  className?: string;
  onMissing?: () => void;
}) {
  const url = spriteSheetUrl(sprite, shiny);
  const [failedUrl, setFailedUrl] = useState<string>();
  const accessibility = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };

  return (
    <span className={className} {...accessibility}>
      {failedUrl !== url && (
        <img src={url} alt="" decoding="async" draggable={false}
          onError={() => { setFailedUrl(url); onMissing?.(); }} />
      )}
    </span>
  );
}

function RemoteImage({ urls, label }: { urls: string[]; label: string }) {
  const [index, setIndex] = useState(0);
  const url = urls[index];

  return url ? (
    <img key={url} src={url} alt={label} loading="lazy" decoding="async" referrerPolicy="no-referrer"
      onError={() => setIndex((value) => value + 1)} />
  ) : (
    <span className="dex-media-unavailable" role="img" aria-label={`${label} indisponível`} title="Imagem indisponível">
      <ImageOff aria-hidden="true" />
    </span>
  );
}

export function PokemonMedia({ name, id, sprite, shiny }: {
  name: string;
  id: number;
  sprite: string | null;
  shiny: boolean;
}) {
  const sheetUrl = sprite ? spriteSheetUrl(sprite, shiny) : null;
  const [missingUrl, setMissingUrl] = useState<string | null>(null);
  const sheet = sprite !== null && sheetUrl !== missingUrl;
  const variant = shiny ? 'shiny/' : '';
  const edition = shiny ? ' brilhante' : '';

  return (
    <div className="dex-media">
      <figure>
        <div className="dex-media-frame">
          <RemoteImage key={`art-${id}-${shiny}`} label={`Arte de ${name}${edition}`} urls={[
            `${baseUrl}/other/official-artwork/${variant}${id}.png`,
            `${baseUrl}/other/home/${variant}${id}.png`,
          ]} />
        </div>
        <figcaption>Arte PokéAPI</figcaption>
      </figure>
      <figure>
        <div className="dex-media-frame" data-pixel="true">
          {sprite && sheet ? (
            <GameSprite sprite={sprite} shiny={shiny} label={`Sprite do jogo de ${name}${edition}`}
              onMissing={() => setMissingUrl(sheetUrl)} />
          ) : (
            <RemoteImage key={`sprite-${id}-${shiny}`} label={`Sprite PokéAPI de ${name}${edition}`} urls={[
              `${baseUrl}/${variant}${id}.png`,
              `${baseUrl}/versions/generation-ix/scarlet-violet/icons/${variant}${id}.png`,
              `${baseUrl}/other/home/${variant}${id}.png`,
            ]} />
          )}
        </div>
        <figcaption>{sheet ? 'Sprite do jogo' : 'Sprite PokéAPI'}</figcaption>
      </figure>
    </div>
  );
}
