import { starterTypes, StarterSpritePreview } from '@/components/sprite-preview';
import { starterGenerations, type Starter } from '@/lib/journey-saves';

/** Escolha do Pokémon inicial: os 27 iniciais, agrupados por geração (região). */
export function StarterPicker({ value, onChange, name = 'starter' }: { value: Starter | null; onChange: (starter: Starter) => void; name?: string }) {
  return (
    <div className="starter-picker">
      {starterGenerations.map(({ generation, region, starters }) => (
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
