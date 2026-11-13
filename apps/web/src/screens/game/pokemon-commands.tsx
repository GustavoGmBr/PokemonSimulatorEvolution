import { useCommandState } from 'cmdk';
import { BookOpen } from 'lucide-react';
import { formatDexNumber, searchPokemon } from '@pokesim-evolution/data/pokedex';
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';

export default function PokemonCommands({ onSelect }: { onSelect: (id: number) => void }) {
  const query = useCommandState((state) => state.search).trim();
  if (query.length < 2 && !/^\d$/.test(query)) return null;

  const matches = searchPokemon(query).slice(0, 8);
  if (matches.length === 0) return null;

  return (
    <CommandGroup heading="Pokémon · Pokédex">
      {matches.map((entry) => (
        <CommandItem key={entry.id} value={`pokemon:${entry.id}`} onSelect={() => onSelect(entry.id)}>
          <BookOpen aria-hidden="true" /><span>{entry.displayName}</span>
          <CommandShortcut>{formatDexNumber(entry.id)}</CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
