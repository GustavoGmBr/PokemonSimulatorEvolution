import { starterTypes, StarterSpritePreview } from '@/components/sprite-preview';
import { starterGenerations, type Starter } from '@/lib/journey-saves';

/** Gerações liberadas na jornada nova: só Kanto. Os iniciais das demais gerações ficam para o Novo Jogo+. */
export const firstJourneyGenerations: readonly number[] = [1];

/** Escolha do Pokémon inicial, agrupado por geração (região). Sem `generations`, mostra os 27 iniciais. */
export function StarterPicker({ value, onChange, name = 'starter', generations }: {
  value: Starter | null; onChange: (starter: Starter) => void; name?: string; generations?: readonly number[];
}) {
  const visible = generations ? starterGenerations.filter(({ generation }) => generations.includes(generation)) : starterGenerations;
  return (
    <div className="starter-picker">
      {generations && <p className="text-xs text-muted-foreground">Os iniciais das outras gerações são liberados no Novo Jogo+, depois de zerar o jogo.</p>}
      {visible.map(({ generation, region, starters }) => (
        <div key={generation} role="group" aria-label={`Geração ${generation} · ${region}`}>
          <p className="starter-generation">Geração {generation} · {region}</p>
          <div className="grid grid-cols-3 gap-2">
            {starters.map(([starter]) => (
              <label className="starter-option" key={starter}>
                <input type="radio" name={name} value={starter} className="sr-only" required
                  checked={value === starter} onChange={() => onChange(starter)} />
                <StarterSpritePreview starter={starter} />
                <strong>{starter}</strong>
                <span className="text-xs text-muted-foreground">{starterTypes(starter)}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
