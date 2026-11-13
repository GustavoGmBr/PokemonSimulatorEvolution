import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Sparkles } from 'lucide-react';
import { formatDexNumber, getPokemon, normalizeDexSearch, pokedexEntries, searchPokemon, typeLabels, type PokemonEntry } from '@pokesim-evolution/data/pokedex';
import { getDexMove, getEvolutionRequirements, getPokemonDetails, getWeaknesses, type BaseStats, type EvolutionNode } from '@pokesim-evolution/data/pokedex-details';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { GameSprite, PokemonMedia, TypeBadge } from './pokedex-media';
import '@/styles/pokedex.css';

const pageSize = 24;
const generations = [...new Set(pokedexEntries.map((entry) => entry.generation))];
const orderedTypes = Object.keys(typeLabels).sort((a, b) => typeLabels[a]!.localeCompare(typeLabels[b]!, 'pt-BR'));
const measure = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

const statLabels = {
  hp: 'HP', atk: 'Ataque', def: 'Defesa', spa: 'Ataque especial', spd: 'Defesa especial', spe: 'Velocidade',
} as const;
const learnMethods: Record<string, string> = { 'level-up': 'Nível', machine: 'Máquina', tutor: 'Tutor', egg: 'Ovo' };

function prettyName(name: string) {
  return name.replace(/(^|-)([a-z])/g, (_, separator: string, letter: string) =>
    (separator ? ' ' : '') + letter.toUpperCase());
}

function StatList({ stats }: { stats: BaseStats }) {
  return (
    <dl className="dex-stats">
      {(Object.keys(statLabels) as (keyof BaseStats)[]).map((stat) => (
        <div key={stat}>
          <dt>{statLabels[stat]}</dt>
          <dd>
            <span className="dex-stat-track" aria-hidden="true"><span style={{ width: `${stats[stat] / 255 * 100}%` }} /></span>
            <strong>{stats[stat]}</strong>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function findEvolutionPath(node: EvolutionNode, id: number): EvolutionNode[] | null {
  if (node.speciesId === id) return [node];
  for (const child of node.evolvesTo) {
    const path = findEvolutionPath(child, id);
    if (path) return [node, ...path];
  }
  return null;
}

function Requirements({ items }: { items: readonly string[] }) {
  return items.length > 0 ? (
    <ul className="dex-requirements">{items.map((item) => <li key={item}>{item}</li>)}</ul>
  ) : <p className="text-sm text-muted-foreground">Requisito indisponível no catálogo.</p>;
}

function EvolutionCard({ node, requirementsId, shiny, onSelect }: {
  node: EvolutionNode; requirementsId: number; shiny: boolean; onSelect: (id: number) => void;
}) {
  const entry = getPokemon(node.speciesId);
  if (!entry) return null;
  const requirements = getEvolutionRequirements(requirementsId);

  return (
    <li className="dex-variant-card">
      <Button variant="outline" size="sm" className="h-auto w-full justify-start py-2 whitespace-normal"
        onClick={() => onSelect(entry.id)}>
        <span className="dex-number">{formatDexNumber(entry.id)}</span><strong>{entry.displayName}</strong>
        <ChevronRight className="ml-auto" aria-hidden="true" />
      </Button>
      <PokemonMedia id={entry.id} name={entry.displayName} sprite={entry.sprite} shiny={shiny} />
      <div className="grid gap-1">
        <h5 className="text-xs font-bold">{requirements.length > 1 ? 'Requisitos alternativos' : 'Requisito de evolução'}</h5>
        <Requirements items={requirements} />
      </div>
    </li>
  );
}

function SpeciesDetails({ entry, caught, onSelect }: { entry: PokemonEntry; caught: boolean; onSelect: (id?: number) => void }) {
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getPokemonDetails>>>();
  const [unavailable, setUnavailable] = useState(false);
  const [shiny, setShiny] = useState(false);
  const [moveQuery, setMoveQuery] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    void getPokemonDetails(entry.id, entry.generation).then((data) => {
      if (!active) return;
      setDetails(data);
      setUnavailable(!data);
    }).catch(() => {
      if (active) setUnavailable(true);
    });
    return () => { active = false; };
  }, [entry.id, entry.generation]);

  useEffect(() => {
    if (!details) return;
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [details]);

  if (!details) {
    return (
      <section className="game-panel dex-detail">
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => onSelect()}><ArrowLeft /> Voltar ao catálogo</Button>
        <p role="status" className="text-sm text-muted-foreground">{unavailable ? 'Ficha indisponível.' : 'Carregando ficha…'}</p>
      </section>
    );
  }
  const weaknesses = getWeaknesses(entry.types);
  const searchedMove = normalizeDexSearch(moveQuery);
  const moves = details.learnset.filter(({ move }) => normalizeDexSearch(getDexMove(move)?.displayName ?? move).includes(searchedMove)).sort((a, b) => {
    if (a.method === 'level-up' && b.method === 'level-up') return a.level - b.level;
    if (a.method === 'level-up') return -1;
    if (b.method === 'level-up') return 1;
    return a.move.localeCompare(b.move);
  });
  const path = details.evolutionChain && findEvolutionPath(details.evolutionChain, entry.id);
  const previous = path?.at(-2);
  const next = path?.at(-1)?.evolvesTo ?? [];

  return (
    <article className="dex-detail" aria-labelledby="dex-species-name">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => onSelect()} aria-keyshortcuts="Escape">
        <ArrowLeft /> Voltar ao catálogo <kbd className="game-key">Esc</kbd>
      </Button>
      <header className="dex-species-header">
        <div className="dex-species-copy">
          <p className="dex-species-meta">{formatDexNumber(entry.id)} <span>·</span> Geração {entry.generation}</p>
          <h2 id="dex-species-name" ref={heading} tabIndex={-1}>{entry.displayName}</h2>
          <div className="flex flex-wrap gap-2">{entry.types.map((type) => <TypeBadge key={type} type={type} />)}</div>
          <p className="text-xs font-bold text-muted-foreground">{caught ? 'Capturado' : 'Faltando'}</p>
          {(details.legendary || details.mythical) && (
            <p className="text-sm font-bold text-muted-foreground">{details.mythical ? 'Pokémon mítico' : 'Pokémon lendário'}</p>
          )}
        </div>
        <div className="dex-species-media">
          <div className="flex items-center justify-end gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <label htmlFor="dex-shiny" className="text-sm font-bold">Forma brilhante</label>
            <Switch id="dex-shiny" checked={shiny} onCheckedChange={setShiny} />
          </div>
          <PokemonMedia id={entry.id} name={entry.displayName} sprite={entry.sprite} shiny={shiny} />
        </div>
      </header>

      <div className="dex-detail-grid">
        <section className="game-panel">
          <h3 className="game-section-title">Atributos base</h3>
          <StatList stats={details.baseStats} />
        </section>
        <section className="game-panel">
          <h3 className="game-section-title">Características</h3>
          <dl className="dex-facts">
            <div><dt>Altura</dt><dd>{details.height === null ? '—' : `${measure.format(details.height)} m`}</dd></div>
            <div><dt>Peso</dt><dd>{details.weight === null ? '—' : `${measure.format(details.weight)} kg`}</dd></div>
          </dl>
          {details.abilities.length > 0 && (
            <div className="grid gap-1">
              <h4 className="text-sm font-bold">Habilidades</h4>
              <ul className="text-sm text-muted-foreground">{details.abilities.map(({ name, hidden }) => (
                <li key={name}>{prettyName(name)}{hidden && ' · oculta'}</li>
              ))}</ul>
            </div>
          )}
          <div className="grid gap-1">
            <h4 className="text-sm font-bold">Fraquezas de tipo</h4>
            {weaknesses.length ? (
              <div className="flex flex-wrap gap-1.5">
                {weaknesses.map(({ type, multiplier }) => <TypeBadge key={type} type={type} multiplier={multiplier} />)}
              </div>
            ) : <p className="text-sm text-muted-foreground">Sem fraquezas de tipo.</p>}
          </div>
        </section>
      </div>

      {(previous || next.length > 0) && (
        <section className="game-panel">
          <h3 className="game-section-title">Linha evolutiva</h3>
          {previous && (
            <section className="grid gap-2">
              <h4 className="text-sm font-bold">Pré-evolução</h4>
              <ul className="dex-variant-grid">
                <EvolutionCard node={previous} requirementsId={entry.id} shiny={shiny} onSelect={onSelect} />
              </ul>
            </section>
          )}
          {next.length > 0 && (
            <section className="grid gap-2">
              <h4 className="text-sm font-bold">{next.length === 1 ? 'Evolução' : 'Evoluções'}</h4>
              <ul className="dex-variant-grid">
                {next.map((node) => <EvolutionCard key={node.speciesId} node={node}
                  requirementsId={node.speciesId} shiny={shiny} onSelect={onSelect} />)}
              </ul>
            </section>
          )}
        </section>
      )}

      {details.forms.length > 0 && (
        <section className="game-panel">
          <h3 className="game-section-title">Formas especiais</h3>
          <div className="dex-variant-grid">
            {details.forms.map((form) => (
              <section key={form.name} className="dex-variant-card">
                <h4 className="text-sm font-bold">{form.displayName}</h4>
                <div className="flex flex-wrap gap-1.5">{form.types.map((type) => <TypeBadge key={type} type={type} />)}</div>
                <PokemonMedia id={form.spriteId} name={form.displayName} sprite={form.sprite} shiny={shiny} />
                <h5 className="text-xs font-bold">Requisitos para liberar</h5>
                <Requirements items={form.requirements} />
                <StatList stats={form.baseStats} />
              </section>
            ))}
          </div>
        </section>
      )}

      {details.learnset.length > 0 && (
        <details className="game-panel">
          <summary className="game-section-title cursor-pointer">Golpes <span className="text-sm text-muted-foreground">({details.learnset.length})</span></summary>
          <div className="grid gap-1 pt-3">
            <label htmlFor="dex-move-search" className="text-xs font-bold">Nome do golpe</label>
            <Input id="dex-move-search" type="search" placeholder="Pesquisar golpes" value={moveQuery}
              onChange={(event) => setMoveQuery(event.target.value)} />
            <p role="status" className="text-xs text-muted-foreground">{moves.length === 1 ? '1 golpe encontrado' : `${moves.length} golpes encontrados`}</p>
          </div>
          {moves.length > 0 && <table className="dex-moves">
            <thead><tr><th scope="col">Golpe</th><th scope="col">Tipo</th><th scope="col">Aprendizado</th></tr></thead>
            <tbody>{moves.map((learned, index) => {
              const move = getDexMove(learned.move);
              return (
                <tr key={index}>
                  <td>{move?.displayName ?? prettyName(learned.move)}</td>
                  <td>{move ? typeLabels[move.type] : '—'}</td>
                  <td>{learnMethods[learned.method] ?? prettyName(learned.method)}{learned.method === 'level-up' && ` ${learned.level}`}</td>
                </tr>
              );
            })}</tbody>
          </table>}
        </details>
      )}
    </article>
  );
}

export default function PokedexScreen({ pokemonId, caughtSpecies, onSelect }: {
  pokemonId?: number;
  caughtSpecies: readonly number[];
  onSelect: (id?: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [number, setNumber] = useState('');
  const [generation, setGeneration] = useState('all');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLUListElement>(null);
  const catalogHeading = useRef<HTMLHeadingElement>(null);
  const previousPokemonId = useRef(pokemonId);
  const caught = new Set(caughtSpecies);
  const matches = searchPokemon(query).filter((entry) =>
    (!number.trim() || /^#?\s*\d+$/.test(number.trim()) && entry.id === Number(number.replace('#', ''))) &&
    (generation === 'all' || entry.generation === Number(generation)) &&
    (type === 'all' || entry.types.includes(type)) &&
    (status === 'all' || caught.has(entry.id) === (status === 'caught')),
  );
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const visible = matches.slice(page * pageSize, (page + 1) * pageSize);
  const selected = pokemonId !== undefined ? getPokemon(pokemonId) : undefined;

  useEffect(() => {
    const returning = previousPokemonId.current !== undefined && pokemonId === undefined;
    previousPokemonId.current = pokemonId;
    if (!returning) return;

    catalogHeading.current?.focus({ preventScroll: true });
    catalogHeading.current?.scrollIntoView({ block: 'nearest' });
  }, [pokemonId]);

  function browseWithKeyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.nativeEvent.isComposing) return;
    const target = event.target;
    const buttons = Array.from(results.current?.querySelectorAll('button') ?? []);
    const index = buttons.findIndex((button) => button === target);

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (index >= 0 || target === search.current)) {
      const next = index < 0 ? 0 : index + (event.key === 'ArrowDown' ? 1 : -1);
      event.preventDefault();
      if (next < 0) search.current?.focus();
      else buttons[next]?.focus();
    } else if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault();
      setPage((value) => Math.min(Math.max(0, value + (event.key === 'PageDown' ? 1 : -1)), pageCount - 1));
      search.current?.focus();
    } else if (event.key === 'Enter' && target instanceof HTMLInputElement && visible[0]) {
      event.preventDefault();
      onSelect(visible[0].id);
    }
  }

  return (
    <div className="dex-layout" data-detail={selected !== undefined}>
      {selected && <SpeciesDetails key={selected.id} entry={selected} caught={caught.has(selected.id)} onSelect={onSelect} />}
      <section className="game-panel dex-catalog" aria-labelledby="dex-catalog-heading" onKeyDown={browseWithKeyboard}>
        <div className="grid gap-1">
          <h2 id="dex-catalog-heading" ref={catalogHeading} tabIndex={-1}
            className="game-section-title scroll-mt-20 focus:outline-none">Catálogo nacional</h2>
          <p className="text-sm text-muted-foreground">{pokedexEntries.length.toLocaleString('pt-BR')} espécies. Consulte qualquer ficha desde o início.</p>
        </div>
        {pokemonId !== undefined && !selected && <p role="status" className="text-sm text-destructive">Espécie não encontrada.</p>}
        <div className="dex-filters">
          <div>
            <label htmlFor="pokedex-search">Nome</label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input ref={search} id="pokedex-search" type="search" className="pl-9"
                placeholder="Ex. Pikachu" value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
            </div>
          </div>
          <div>
            <label htmlFor="pokedex-number">Número nacional</label>
            <Input id="pokedex-number" inputMode="numeric" placeholder="Ex. 0025" value={number}
              onChange={(event) => { setNumber(event.target.value); setPage(0); }} />
          </div>
          <div>
            <label htmlFor="pokedex-generation">Geração</label>
            <Select value={generation} onValueChange={(value) => { setGeneration(value); setPage(0); }}>
              <SelectTrigger id="pokedex-generation" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {generations.map((value) => <SelectItem key={value} value={String(value)}>Geração {value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="pokedex-type">Tipo</label>
            <Select value={type} onValueChange={(value) => { setType(value); setPage(0); }}>
              <SelectTrigger id="pokedex-type" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {orderedTypes.map((value) => <SelectItem key={value} value={value} textValue={typeLabels[value]}>
                  <TypeBadge type={value} /><span aria-hidden="true">{typeLabels[value]}</span>
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="pokedex-status">Status</label>
            <Select value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}>
              <SelectTrigger id="pokedex-status" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="caught">Capturados</SelectItem>
                <SelectItem value="missing">Faltando</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p role="status" className="text-xs text-muted-foreground">
          {matches.length === 1 ? '1 espécie encontrada' : `${matches.length.toLocaleString('pt-BR')} espécies encontradas`}
        </p>
        {visible.length > 0 && (
          <ul ref={results} className="dex-results">
            {visible.map((entry) => (
              <li key={entry.id} className="min-w-0">
                <Button variant={selected?.id === entry.id ? 'secondary' : 'outline'} className="h-12 w-full min-w-0 justify-start px-2.5"
                  aria-current={selected?.id === entry.id ? 'page' : undefined} onClick={() => onSelect(entry.id)}>
                  <span className="dex-number">{formatDexNumber(entry.id)}</span>
                  {entry.sprite && <GameSprite sprite={entry.sprite} className="dex-thumb" />}
                  <span className="truncate">{entry.displayName}</span>
                  <ChevronRight className="ml-auto shrink-0 text-muted-foreground" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {pageCount > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="icon-sm" aria-label="Página anterior" aria-keyshortcuts="PageUp"
              title="Página anterior (Page Up)" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
            <span className="text-xs text-muted-foreground" aria-live="polite">Página {page + 1} de {pageCount}</span>
            <Button variant="outline" size="icon-sm" aria-label="Próxima página" aria-keyshortcuts="PageDown"
              title="Próxima página (Page Down)" disabled={page + 1 === pageCount} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
          </div>
        )}
      </section>
    </div>
  );
}
