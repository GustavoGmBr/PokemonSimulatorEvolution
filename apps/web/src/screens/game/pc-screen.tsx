import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { ChevronLeft, ChevronRight, Coins, FlaskConical, Heart, HeartOff, Hand, ListChecks, Plus, Search, X } from 'lucide-react';
import { getPokemon, normalizeDexSearch, typeLabels } from '@pokesim-evolution/data/pokedex';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { capture, onCollection, type ChangeGame, type GameState } from '@/lib/game-state';
import {
  addBox, boxSize, createPokemon, freeSlots, getAt, locate, move, moveToBox, organize, pokedexTotal,
  renameBox, samePlace, sendToPc, setFavorite, teamSize, withdraw,
  type Collection, type OwnedPokemon, type Place, type Result,
} from '@/lib/pokemon-collection';
import { spriteSheetUrl, TypeBadge } from './pokedex-media';
import { pokemonValue, sellPokemon } from '@/lib/market';
import { PokemonDialog } from './pokemon-dialog';
import { formatMoney } from './trainer-card';
import { PokemonMarks, PokemonSprite, describePokemon, pokemonName, speciesName } from './pokemon-ui';

type Props = { state: GameState; change: ChangeGame; onOpenPokedex: (species: number) => void };
type Filters = { query: string; type: string; generation: string; shiny: boolean; favorite: boolean };

const noFilters: Filters = { query: '', type: '', generation: '', shiny: false, favorite: false };
const generations = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const selectClass = 'pc-select';

function matchesFilters(pokemon: OwnedPokemon, filters: Filters) {
  const entry = getPokemon(pokemon.species);
  if (!entry) return false;
  if (filters.type && !entry.types.includes(filters.type)) return false;
  if (filters.generation && entry.generation !== Number(filters.generation)) return false;
  if (filters.shiny && !pokemon.shiny) return false;
  if (filters.favorite && !pokemon.favorite) return false;

  const query = filters.query.trim();
  if (!query) return true;
  if (/^#?\s*\d+$/.test(query)) return pokemon.species === Number(query.replace(/\D/g, ''));
  const normalized = normalizeDexSearch(query);
  return [entry.displayName, entry.name, pokemon.nickname ?? ''].some((name) => normalizeDexSearch(name).includes(normalized));
}

function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select'));
}

// O navegador gera a imagem do arrasto a partir do elemento; com a folha de sprites (4×4 quadros, recortada por
// overflow) ela sai enorme e pega as vagas vizinhas. Por isso o arrasto usa uma miniatura própria, só com o
// primeiro quadro.
function setDragPreview(event: DragEvent, pokemon: OwnedPokemon) {
  const sprite = getPokemon(pokemon.species)?.sprite;
  if (!sprite) return;

  const size = 72;
  const preview = document.createElement('div');
  Object.assign(preview.style, {
    position: 'fixed', top: '-300px', left: '-300px', width: `${size}px`, height: `${size}px`,
    overflow: 'hidden', pointerEvents: 'none',
  });
  const image = document.createElement('img');
  image.src = spriteSheetUrl(sprite, pokemon.shiny);
  image.alt = '';
  Object.assign(image.style, {
    position: 'absolute', top: '0', left: '0', width: `${size * 4}px`, height: `${size * 4}px`,
    maxWidth: 'none', imageRendering: 'pixelated',
  });
  preview.append(image);
  document.body.append(preview);
  event.dataTransfer.setDragImage(preview, size / 2, size / 2);
  setTimeout(() => preview.remove());
}

type SlotProps = {
  place: Place;
  pokemon: OwnedPokemon | null;
  label: string;
  selected: boolean;
  picked: boolean;
  dimmed: boolean;
  moving: boolean;
  dragging: boolean;
  over: boolean;
  onActivate: (event: MouseEvent | KeyboardEvent) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
};

function Slot({ pokemon, label, selected, picked, dimmed, moving, dragging, over, onActivate, onDragStart, onDragEnd, onDragEnter, onDragLeave, onDrop }: SlotProps) {
  const classes = ['pc-slot', pokemon && 'is-filled', selected && 'is-selected', picked && 'is-picked',
    dimmed && 'is-dimmed', moving && 'is-moving', dragging && 'is-dragging', over && 'is-over'].filter(Boolean).join(' ');

  return (
    <div role="button" tabIndex={0} className={classes} draggable={pokemon !== null}
      aria-label={pokemon ? describePokemon(pokemon) : label} aria-pressed={pokemon ? selected || picked : undefined}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActivate(event); }
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
      onDrop={onDrop}>
      {pokemon && (
        <>
          <PokemonSprite pokemon={pokemon} />
          <span className="pc-slot-level">Nv {pokemon.level}</span>
          <span className="pc-slot-marks"><PokemonMarks pokemon={pokemon} /></span>
        </>
      )}
    </div>
  );
}

export default function PcScreen({ state, change, onOpenPokedex }: Props) {
  const { collection } = state;
  const root = useRef<HTMLDivElement>(null);
  const dragged = useRef<Place | null>(null);

  const [boxIndex, setBoxIndex] = useState(0);
  const [filters, setFilters] = useState(noFilters);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [movingUid, setMovingUid] = useState<string | null>(null);
  const [multi, setMulti] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [confirmSell, setConfirmSell] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [panelUid, setPanelUid] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [draggingUid, setDraggingUid] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const currentBox = Math.min(boxIndex, collection.boxes.length - 1);
  const box = collection.boxes[currentBox]!;
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(noFilters);
  const selected = useMemo(() => {
    const place = selectedUid ? locate(collection, selectedUid) : null;
    return place ? { place, pokemon: getAt(collection, place)! } : null;
  }, [collection, selectedUid]);

  const matchesPerBox = useMemo(() => filtersActive
    ? collection.boxes.map((entry) => entry.slots.filter((slot) => slot && matchesFilters(slot, filters)).length)
    : [], [collection, filters, filtersActive]);
  const totalMatches = matchesPerBox.reduce((sum, count) => sum + count, 0);

  const used = collection.boxes.reduce((sum, entry) => sum + boxSize - freeSlots(entry), 0);

  function apply(operation: (collection: Collection) => Result) {
    const error = change(onCollection(operation));
    setMessage(error ?? '');
    return error === null;
  }

  function goToBox(index: number) {
    setBoxIndex(Math.max(0, Math.min(index, collection.boxes.length - 1)));
    setRenaming(null);
    setAnchor(null);
  }

  function cancelAction() {
    setMovingUid(null);
    setConfirmSell(false);
    setRenaming(null);
  }

  function togglePicked(uid: string, index: number, range: boolean) {
    const next = new Set(picked);
    if (range && anchor !== null) {
      const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
      for (const slot of box.slots.slice(from, to + 1)) if (slot) next.add(slot.uid);
    } else if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setPicked(next);
    setAnchor(index);
    setConfirmSell(false);
  }

  function activate(place: Place, event: MouseEvent | KeyboardEvent) {
    const pokemon = getAt(collection, place);
    setMessage('');

    if (movingUid) {
      const from = locate(collection, movingUid);
      if (!from || samePlace(from, place)) { setMovingUid(null); return; }
      if (apply((current) => move(current, from, place))) {
        setSelectedUid(movingUid);
        setMovingUid(null);
      }
      return;
    }
    if (multi) {
      if (place.kind === 'box' && pokemon) togglePicked(pokemon.uid, place.index, event.shiftKey);
      return;
    }
    setSelectedUid(pokemon?.uid ?? null);
    setConfirmSell(false);
  }

  function startDrag(place: Place, event: DragEvent) {
    const pokemon = getAt(collection, place);
    if (!pokemon) { event.preventDefault(); return; }
    dragged.current = place;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'pokemon');
    setDragPreview(event, pokemon);
    setDraggingUid(pokemon.uid);
    setMovingUid(null);
  }

  function endDrag() {
    dragged.current = null;
    setDraggingUid(null);
    setOverKey(null);
  }

  function dropOn(place: Place, event: DragEvent) {
    event.preventDefault();
    const from = dragged.current;
    endDrag();
    if (from && !samePlace(from, place)) {
      const subject = getAt(collection, from);
      if (apply((current) => move(current, from, place)) && subject) setSelectedUid(subject.uid);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (isEditable(event.target)) return;
    const key = event.key.toLowerCase();
    // Trocar de caixa: Ctrl (⌘) + seta ou PageUp/PageDown (letras soltas não são mais atalho).
    const withModifier = event.ctrlKey || event.metaKey;
    if (key === 'pageup' || (withModifier && key === 'arrowleft')) { event.preventDefault(); goToBox(currentBox - 1); }
    else if (key === 'pagedown' || (withModifier && key === 'arrowright')) { event.preventDefault(); goToBox(currentBox + 1); }
    else if (key === 'escape' && (movingUid || confirmSell || renaming !== null || picked.size > 0)) {
      event.preventDefault();
      cancelAction();
      setPicked(new Set());
    }
  }

  function toggleMulti() {
    setMulti((value) => !value);
    setPicked(new Set());
    setAnchor(null);
    setMovingUid(null);
    setConfirmSell(false);
    setSelectedUid(null);
  }

  function slotProps(place: Place, key: string): Pick<SlotProps, 'place' | 'pokemon' | 'selected' | 'picked' | 'dimmed' | 'moving' | 'dragging' | 'over' | 'onActivate' | 'onDragStart' | 'onDragEnd' | 'onDragEnter' | 'onDragLeave' | 'onDrop'> {
    const pokemon = getAt(collection, place);
    return {
      place,
      pokemon,
      selected: pokemon !== null && pokemon.uid === selectedUid,
      picked: pokemon !== null && picked.has(pokemon.uid),
      dimmed: filtersActive && (pokemon === null || !matchesFilters(pokemon, filters)),
      moving: pokemon !== null && pokemon.uid === movingUid,
      dragging: pokemon !== null && pokemon.uid === draggingUid,
      over: overKey === key,
      onActivate: (event) => activate(place, event),
      onDragStart: (event) => startDrag(place, event),
      onDragEnd: endDrag,
      onDragEnter: () => setOverKey(key),
      onDragLeave: (event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setOverKey((current) => current === key ? null : current);
        }
      },
      onDrop: (event) => dropOn(place, event),
    };
  }

  function organizeBy(kind: 'dex' | 'name') {
    apply((current) => organize(current, kind === 'dex'
      ? (a, b) => a.species - b.species || Number(b.shiny) - Number(a.shiny) || b.level - a.level
      : (a, b) => speciesName(a).localeCompare(speciesName(b), 'pt-BR') || b.level - a.level));
    setMessage(kind === 'dex' ? 'Caixas organizadas por número da Pokédex.' : 'Caixas organizadas por nome da espécie.');
  }

  function addTestPokemon() {
    const error = change((current) => {
      let next: GameState | string = current;
      for (let i = 0; i < 12; i += 1) {
        const species = 1 + Math.floor(Math.random() * pokedexTotal);
        next = capture(next, createPokemon(species, { level: 5 + Math.floor(Math.random() * 46), shiny: Math.random() < 1 / 6 }), false);
        if (typeof next === 'string') return next;
      }
      return next;
    });
    setMessage(error ?? '12 Pokémon aleatórios adicionados.');
  }

  const pickedList = [...picked];
  const sellable = collection.boxes.flatMap((entry) => entry.slots)
    .filter((pokemon): pokemon is OwnedPokemon => pokemon !== null && picked.has(pokemon.uid) && !pokemon.favorite);
  const sellTotal = sellable.reduce((sum, pokemon) => sum + pokemonValue(pokemon), 0);
  const selectedEntry = selected ? getPokemon(selected.pokemon.species) : undefined;
  const moveSource = movingUid ? locate(collection, movingUid) : null;
  const movingPokemon = moveSource ? getAt(collection, moveSource) : null;

  return (
    <div ref={root} className="pc" onKeyDown={onKeyDown}>
      <div className="pc-main">
        <section className="game-panel pc-box-panel" aria-label="Caixas do PC">
          <div className="pc-toolbar">
            <Button variant="outline" size="icon" aria-label="Caixa anterior" title="Caixa anterior (Ctrl ←)"
              disabled={currentBox === 0} onClick={() => goToBox(currentBox - 1)}><ChevronLeft /></Button>

            {renaming === null ? (
              <button type="button" className="pc-box-name" title="Renomear a caixa" onClick={() => setRenaming(box.name)}>
                <strong>{box.name}</strong>
                <span>{boxSize - freeSlots(box)} / {boxSize}</span>
              </button>
            ) : (
              <form className="pc-box-name-form" onSubmit={(event) => {
                event.preventDefault();
                apply((current) => renameBox(current, currentBox, renaming));
                setRenaming(null);
              }}>
                <Input autoFocus value={renaming} maxLength={20} aria-label="Nome da caixa"
                  onChange={(event) => setRenaming(event.target.value)} onBlur={() => setRenaming(null)}
                  onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setRenaming(null); } }} />
              </form>
            )}

            <Button variant="outline" size="icon" aria-label="Próxima caixa" title="Próxima caixa (Ctrl →)"
              disabled={currentBox >= collection.boxes.length - 1} onClick={() => goToBox(currentBox + 1)}><ChevronRight /></Button>

            <select className={selectClass} aria-label="Ir para a caixa" value={currentBox}
              onChange={(event) => goToBox(Number(event.target.value))}>
              {collection.boxes.map((entry, index) => (
                <option key={index} value={index}>{entry.name} ({boxSize - freeSlots(entry)}/{boxSize})</option>
              ))}
            </select>

            <Button variant="outline" onClick={() => { if (apply(addBox)) goToBox(collection.boxes.length); }}><Plus /> Nova caixa</Button>
          </div>

          <div className="pc-filters" role="search">
            <div className="pc-search">
              <Search aria-hidden="true" />
              <Input value={filters.query} placeholder="Buscar por nome, apelido ou número" aria-label="Buscar Pokémon"
                onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
            </div>
            <select className={selectClass} aria-label="Filtrar por tipo" value={filters.type}
              onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
              <option value="">Todos os tipos</option>
              {Object.entries(typeLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <select className={selectClass} aria-label="Filtrar por geração" value={filters.generation}
              onChange={(event) => setFilters({ ...filters, generation: event.target.value })}>
              <option value="">Todas as gerações</option>
              {generations.map((generation) => <option key={generation} value={generation}>Geração {generation}</option>)}
            </select>
            <Button variant={filters.shiny ? 'default' : 'outline'} aria-pressed={filters.shiny}
              onClick={() => setFilters({ ...filters, shiny: !filters.shiny })}>Brilhantes</Button>
            <Button variant={filters.favorite ? 'default' : 'outline'} aria-pressed={filters.favorite}
              onClick={() => setFilters({ ...filters, favorite: !filters.favorite })}><Heart /> Favoritos</Button>
            {filtersActive && <Button variant="ghost" onClick={() => setFilters(noFilters)}><X /> Limpar</Button>}
          </div>

          {filtersActive && (
            <div className="pc-results" role="status">
              <span>{totalMatches === 0 ? 'Nenhum Pokémon encontrado.' : `${totalMatches} ${totalMatches === 1 ? 'resultado' : 'resultados'} no PC e na equipe`}</span>
              {matchesPerBox.map((count, index) => count > 0 && (
                <button key={index} type="button" className={index === currentBox ? 'is-current' : undefined}
                  onClick={() => goToBox(index)}>{collection.boxes[index]!.name} · {count}</button>
              ))}
            </div>
          )}

          {movingPokemon && (
            <p className="pc-banner" role="status">
              <Hand aria-hidden="true" /> Escolha a vaga de destino de {pokemonName(movingPokemon)}. Esc cancela.
              <Button size="sm" variant="outline" onClick={() => setMovingUid(null)}>Cancelar</Button>
            </p>
          )}

          <div className="pc-grid">
            {box.slots.map((_, index) => {
              const place: Place = { kind: 'box', box: currentBox, index };
              return <Slot key={index} label={`Vaga ${index + 1} livre`} {...slotProps(place, `b${currentBox}-${index}`)} />;
            })}
          </div>

          <div className="pc-footer">
            <span>{used} Pokémon em {collection.boxes.length} {collection.boxes.length === 1 ? 'caixa' : 'caixas'}</span>
            <div className="pc-footer-actions">
              <Button variant="outline" size="sm" onClick={() => organizeBy('dex')} title="Reorganiza todas as caixas">Ordenar por Pokédex</Button>
              <Button variant="outline" size="sm" onClick={() => organizeBy('name')} title="Reorganiza todas as caixas">Ordenar por nome</Button>
              {import.meta.env.DEV && (
                <Button variant="outline" size="sm" onClick={addTestPokemon} title="Só aparece em desenvolvimento">
                  <FlaskConical /> [TESTE] +12 Pokémon
                </Button>
              )}
            </div>
          </div>
          {message && <p role="status" className="pc-message">{message}</p>}
        </section>
      </div>

      <aside className="pc-side">
        <section className="game-panel" aria-labelledby="pc-team-heading">
          <div className="game-panel-heading">
            <h2 id="pc-team-heading">Equipe</h2>
            <span className="text-sm text-muted-foreground">{collection.team.length} / {teamSize}</span>
          </div>
          <div className="pc-team">
            {Array.from({ length: teamSize }, (_, index) => {
              const place: Place = { kind: 'team', index };
              return <Slot key={index} label={`Vaga ${index + 1} da equipe livre`} {...slotProps(place, `t${index}`)} />;
            })}
          </div>
        </section>

        <section className="game-panel pc-detail" aria-label="Pokémon selecionado" aria-live="polite">
          {multi ? (
            <>
              <div className="game-panel-heading">
                <h2>Seleção</h2>
                <span className="text-sm text-muted-foreground">{picked.size} {picked.size === 1 ? 'selecionado' : 'selecionados'}</span>
              </div>
              <p className="text-sm text-muted-foreground">Clique nos Pokémon do PC para marcar. Shift marca um intervalo.</p>
              <div className="pc-actions">
                <Button variant="outline" disabled={picked.size === 0}
                  onClick={() => apply((current) => setFavorite(current, pickedList, true))}><Heart /> Favoritar</Button>
                <Button variant="outline" disabled={picked.size === 0}
                  onClick={() => apply((current) => setFavorite(current, pickedList, false))}><HeartOff /> Tirar favorito</Button>
                <select className={selectClass} aria-label="Mover os selecionados para a caixa" disabled={picked.size === 0} value=""
                  onChange={(event) => {
                    if (event.target.value === '') return;
                    const target = Number(event.target.value);
                    if (apply((current) => moveToBox(current, pickedList, target))) { setPicked(new Set()); goToBox(target); }
                  }}>
                  <option value="">Mover para a caixa…</option>
                  {collection.boxes.map((entry, index) => (
                    <option key={index} value={index}>{entry.name} ({freeSlots(entry)} livres)</option>
                  ))}
                </select>
                {confirmSell ? (
                  <div className="pc-confirm" role="alertdialog" aria-label="Confirmar venda">
                    <span>Vender {sellable.length} Pokémon por {formatMoney(sellTotal)}? Favoritos são mantidos.</span>
                    <Button variant="destructive" size="sm" disabled={sellable.length === 0} onClick={() => {
                      const problem = change(sellPokemon(pickedList));
                      setMessage(problem ?? `Vendeu ${sellable.length} Pokémon por ${formatMoney(sellTotal)}.`);
                      if (!problem) setPicked(new Set());
                      setConfirmSell(false);
                    }}>Vender</Button>
                    <Button variant="outline" size="sm" onClick={() => setConfirmSell(false)}>Cancelar</Button>
                  </div>
                ) : (
                  <Button variant="outline" disabled={picked.size === 0}
                    onClick={() => setConfirmSell(true)}><Coins /> Vender{sellTotal > 0 ? ` · ${formatMoney(sellTotal)}` : ''}</Button>
                )}
              </div>
            </>
          ) : selected ? (
            <>
              <div className="pc-detail-head">
                <PokemonSprite pokemon={selected.pokemon} className="dex-portrait" />
                <div className="min-w-0">
                  <h2 className="truncate font-bold">{pokemonName(selected.pokemon)}</h2>
                  <p className="truncate text-sm text-muted-foreground">
                    {selected.pokemon.nickname ? `${speciesName(selected.pokemon)} · ` : ''}Nv {selected.pokemon.level}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">{selectedEntry?.types.map((type) => <TypeBadge key={type} type={type} />)}</div>
                </div>
              </div>
              <div className="pc-actions">
                <Button onClick={() => setPanelUid(selected.pokemon.uid)}>Ver ficha</Button>
                <Button variant="outline" onClick={() => { setMovingUid(selected.pokemon.uid); setMessage(''); }}><Hand /> Mover</Button>
                <Button variant="outline" aria-pressed={selected.pokemon.favorite}
                  onClick={() => apply((current) => setFavorite(current, [selected.pokemon.uid], !selected.pokemon.favorite))}>
                  <Heart fill={selected.pokemon.favorite ? 'currentColor' : 'none'} /> {selected.pokemon.favorite ? 'Favorito' : 'Favoritar'}
                </Button>
                {selected.place.kind === 'team'
                  ? <Button variant="outline" onClick={() => apply((current) => sendToPc(current, selected.pokemon.uid))}>Enviar ao PC</Button>
                  : <Button variant="outline" onClick={() => apply((current) => withdraw(current, selected.pokemon.uid))}>Levar à equipe</Button>}
              </div>
              <p className="text-xs text-muted-foreground">Arraste um Pokémon para outra vaga, ou use Mover. Soltar uma vaga ocupada troca os dois.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Selecione um Pokémon para ver os detalhes e movê-lo. Ctrl + ← e Ctrl + → trocam de caixa.</p>
          )}
          <Button variant={multi ? 'default' : 'outline'} aria-pressed={multi} onClick={toggleMulti}>
            <ListChecks /> {multi ? 'Sair da seleção' : 'Selecionar vários'}
          </Button>
        </section>
      </aside>

      <PokemonDialog uid={panelUid} state={state} change={change} onClose={() => setPanelUid(null)}
        onOpenPokedex={(species) => { setPanelUid(null); onOpenPokedex(species); }} />
    </div>
  );
}
