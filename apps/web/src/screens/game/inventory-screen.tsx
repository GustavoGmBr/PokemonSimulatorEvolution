import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import itemdex from '@pokesim-evolution/data/itemdex';
import { shopCategories, getShopItem } from '@pokesim-evolution/data/shop-items';
import { normalizeDexSearch } from '@pokesim-evolution/data/pokedex';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ItemIcon } from '@/components/item-icon';
import type { ChangeGame, GameState } from '@/lib/game-state';
import { boxPokemon, type OwnedPokemon } from '@/lib/pokemon-collection';
import { evolutionChoices, formChoices, itemName, trainingItems, usePokemonItem } from '@/lib/training';
import { pokemonName } from './pokemon-ui';
import '@/styles/bag.css';

export function TrainingActions({ pokemon, game, change, onlyItem }: {
  pokemon: OwnedPokemon; game: GameState; change: ChangeGame; onlyItem?: string;
}) {
  const [message, setMessage] = useState('');
  const bag = game.progress.bag;
  const options = [
    ...trainingItems.filter((item) => bag[item]).map((item) => ({ label: itemName(item), item, reason: undefined })),
    ...evolutionChoices(pokemon, Date.now()).map((choice) => ({ ...choice, label: `Evoluir para ${choice.label}` })),
    ...formChoices(game, pokemon).map((choice) => ({ ...choice, label: `Transformar em ${choice.label}` })),
  ].filter((choice) => !onlyItem || choice.item === onlyItem);
  return (
    <div className="grid gap-2">
      {options.length === 0 && <p className="text-sm text-muted-foreground">Nenhum uso disponível para este Pokémon.</p>}
      {options.map((action, index) => {
        const reason = action.reason ?? (action.item && !bag[action.item] ? `Falta ${itemName(action.item)}.` : undefined);
        return <div key={index} className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={Boolean(reason)} onClick={() =>
            setMessage(change(usePokemonItem(pokemon.uid, action)) ?? 'Alteração aplicada.')}>
            {action.label}
            {action.item && bag[action.item] ? ` · ${bag[action.item]} na mochila` : ''}
          </Button>
          {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
        </div>;
      })}
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
  );
}

/** Divisórias da mochila: as mesmas categorias da Loja, mais "Treino" (doces, que a Loja não vende) e "Outros". */
type BagTab = 'todos' | (typeof shopCategories)[number]['id'] | 'treino' | 'outros';
const tabs: readonly { id: BagTab; label: string }[] = [
  { id: 'todos', label: 'Tudo' },
  ...shopCategories,
  { id: 'treino', label: 'Treino' },
  { id: 'outros', label: 'Outros' },
];

const official = new Map(itemdex.map((item) => [item.name, item]));
const candyText: Record<string, string> = {
  'rare-candy': 'Sobe um Pokémon em um nível.',
  'exp-candy-p': 'Dá 800 pontos de EXP a um Pokémon.',
  'exp-candy-m': 'Dá 3.000 pontos de EXP a um Pokémon.',
  'exp-candy-g': 'Dá 10.000 pontos de EXP a um Pokémon.',
  'exp-candy-gg': 'Dá 30.000 pontos de EXP a um Pokémon.',
};
// Itens que se usam em batalha (Poké Bolas e cura) não têm ação aqui; o resto abre o painel de uso.
const battleOnly: ReadonlySet<BagTab> = new Set(['captura', 'cura']);

type BagItem = { name: string; label: string; description: string; tab: Exclude<BagTab, 'todos'>; quantity: number };

function describe(name: string, quantity: number): BagItem {
  const shop = getShopItem(name);
  const tab = shop?.category ?? (trainingItems.includes(name) ? 'treino' : 'outros');
  return {
    name, quantity, tab,
    label: shop?.displayName ?? (trainingItems.includes(name) ? itemName(name) : official.get(name)?.en ?? itemName(name)),
    description: shop?.description ?? candyText[name] ?? official.get(name)?.effect ?? '',
  };
}

export default function InventoryScreen({ game, change }: { game: GameState; change: ChangeGame }) {
  const [tab, setTab] = useState<BagTab>('todos');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [uid, setUid] = useState('');
  const bag = game.progress.bag;

  const items = useMemo(() => Object.entries(bag).filter(([, quantity]) => quantity > 0)
    .map(([name, quantity]) => describe(name, quantity)).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')), [bag]);
  const counts = useMemo(() => {
    const total: Record<string, number> = { todos: items.length };
    for (const item of items) total[item.tab] = (total[item.tab] ?? 0) + 1;
    return total;
  }, [items]);

  const search = normalizeDexSearch(query);
  const visible = items.filter((item) => (search || tab === 'todos' || item.tab === tab) &&
    (!search || normalizeDexSearch(item.label).includes(search) || normalizeDexSearch(item.name).includes(search)));
  const current = items.find((item) => item.name === selected);
  const owned = [...game.collection.team, ...boxPokemon(game.collection).map(({ pokemon }) => pokemon)];
  const target = owned.find((pokemon) => pokemon.uid === uid) ?? owned[0];
  // "Outros" só aparece quando há itens sem categoria (a mochila de um save importado, por exemplo).
  const shownTabs = tabs.filter(({ id }) => id !== 'outros' || counts.outros);

  return <div className="bag">
    <section className="game-panel" aria-label="Itens da mochila">
      <div className="bag-tabs" role="tablist" aria-label="Categorias da mochila">
        {shownTabs.map(({ id, label }) => <button key={id} type="button" role="tab" id={`bag-tab-${id}`} aria-selected={!search && id === tab}
          aria-controls="bag-list" data-empty={!counts[id]} onClick={() => { setQuery(''); setTab(id); }}>
          {label}<span className="bag-count">{counts[id] ?? 0}</span>
        </button>)}
      </div>
      <label className="bag-search">
        <Search aria-hidden="true" />
        <Input type="search" aria-label="Pesquisar na mochila" placeholder="Pesquisar em toda a mochila…" value={query}
          onChange={(event) => setQuery(event.target.value)} />
      </label>

      <div id="bag-list" role="tabpanel" aria-labelledby={search ? undefined : `bag-tab-${tab}`}>
        {items.length === 0 && <p className="text-sm text-muted-foreground">A mochila está vazia. Compre itens na Loja.</p>}
        {items.length > 0 && visible.length === 0 && <p className="text-sm text-muted-foreground">
          {search ? 'Nenhum item encontrado.' : 'Nenhum item nesta divisória.'}</p>}
        <ul className="bag-grid">
          {visible.map((item) => <li key={item.name}>
            <button type="button" className="bag-item" aria-pressed={item.name === selected}
              onClick={() => setSelected(item.name === selected ? '' : item.name)}>
              <ItemIcon item={item.name} size={36} />
              <span className="min-w-0">
                <strong className="block truncate">{item.label}</strong>
                <span className="bag-desc">{item.description}</span>
              </span>
              <b className="bag-qty" aria-label={`${item.quantity} na mochila`}>×{item.quantity}</b>
            </button>
          </li>)}
        </ul>
      </div>
    </section>

    <aside className="game-panel bag-detail" aria-label="Detalhes do item">
      {!current ? <p className="text-sm text-muted-foreground">Selecione um item para ver os detalhes e usá-lo.</p> : <>
        <div className="bag-detail-head">
          <ItemIcon item={current.name} size={56} />
          <div className="min-w-0">
            <h2 className="game-section-title">{current.label}</h2>
            <span className="text-sm text-muted-foreground">Na mochila: {current.quantity}</span>
          </div>
        </div>
        {current.description && <p className="text-sm">{current.description}</p>}
        {battleOnly.has(current.tab) ? <p className="text-xs text-muted-foreground">
          {current.tab === 'captura' ? 'Poké Bolas são usadas durante as batalhas com Pokémon selvagens.' : 'Itens de cura são usados em batalha. A equipe se recupera ao fim do combate.'}
        </p> : <>
          <label className="grid gap-1 text-sm">Pokémon
            <select className="rounded-md border p-2" value={target?.uid ?? ''} onChange={(event) => setUid(event.target.value)}>
              {owned.map((pokemon) => <option key={pokemon.uid} value={pokemon.uid}>{pokemonName(pokemon)} · Nv. {pokemon.level}</option>)}
            </select>
          </label>
          {target && <TrainingActions key={`${current.name}:${target.uid}`} pokemon={target} game={game} change={change} onlyItem={current.name} />}
        </>}
      </>}
    </aside>
  </div>;
}
