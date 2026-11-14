import { useEffect, useMemo, useState } from 'react';
import { Bell, Coins, Lock, Pin, PinOff, RefreshCw, Search, ShoppingBag, Sparkles } from 'lucide-react';
import { getPokemon, normalizeDexSearch, typeLabels } from '@pokesim-evolution/data/pokedex';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChangeGame, GameState } from '@/lib/game-state';
import { gradeOf, ivStars } from '@/lib/ivs';
import {
  buyEntry, isRegionUnlocked, marketRefreshMs, marketRefreshPrice, marketSize, msUntilRefresh, needsSync, openMarket,
  pinEntry, pokemonValue, refreshMarket, sellPokemon, type MarketEntry,
} from '@/lib/market';
import type { OwnedPokemon } from '@/lib/pokemon-collection';
import { GameSprite, TypeBadge } from './pokedex-media';
import { PokemonSprite, pokemonName } from './pokemon-ui';
import { formatMoney } from './trainer-card';
import '@/styles/shop.css';

const maxStars = 4;
const starFilters = [0, 2, 3, 4] as const;
const generations = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const typeIds = Object.keys(typeLabels);
const minutesLeft = (ms: number) => Math.max(0, Math.ceil(ms / 60_000));

type SellSort = 'value' | 'level' | 'stars' | 'name';
const sellSortLabels: Record<SellSort, string> = { value: 'Maior valor', level: 'Maior nível', stars: 'Mais estrelas', name: 'Nome' };

function StarRow({ count }: { count: number }) {
  return (
    <span className="market-stars" role="img" aria-label={`${count} de ${maxStars} estrelas de IV`} data-stars={count}>
      <strong aria-hidden="true">{count}/{maxStars}</strong>
      <span className="market-star-icons" aria-hidden="true">
        <span>{'★'.repeat(count)}</span><span>{'☆'.repeat(maxStars - count)}</span>
      </span>
    </span>
  );
}

type Props = { game: GameState; change: ChangeGame };

/** Mercado Pokémon: compra de Pokémon prontos (estoque que renova a cada hora) e venda dos da coleção. */
export default function MarketScreen({ game, change }: Props) {
  const { money, market } = game.progress;
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [message, setMessage] = useState('O estoque renova a cada hora. Fixe o que quiser guardar.');
  const [now, setNow] = useState(() => Date.now());

  // Relógio do estoque; ao virar a hora (ou na primeira visita) o estoque é sorteado.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const stale = needsSync(market, now);
  useEffect(() => { if (stale) change(openMarket(Date.now())); }, [stale]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = market?.entries ?? [];
  const available = entries.filter((entry) => entry.available).length;
  const owned = useMemo(() => [
    ...game.collection.team.map((pokemon) => ({ pokemon, inTeam: true })),
    ...game.collection.boxes.flatMap((box) => box.slots).filter((slot): slot is OwnedPokemon => slot !== null).map((pokemon) => ({ pokemon, inTeam: false })),
  ], [game.collection]);

  return (
    <div className="market">
      <div className="shop-tabs" role="tablist" aria-label="Mercado">
        <button type="button" role="tab" aria-selected={tab === 'buy'} onClick={() => setTab('buy')}>
          <ShoppingBag aria-hidden="true" /> Comprar <span className="shop-badge">{available}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'sell'} onClick={() => setTab('sell')}>
          <Coins aria-hidden="true" /> Vender <span className="shop-badge">{owned.filter(({ pokemon }) => !pokemon.favorite).length}</span>
        </button>
      </div>

      {tab === 'buy'
        ? <BuyTab entries={entries} money={money} now={now} loading={stale && entries.length === 0} change={change} setMessage={setMessage} />
        : <SellTab owned={owned} change={change} setMessage={setMessage} />}

      <p role="status" className="game-panel market-message">{message}</p>
    </div>
  );
}

function BuyTab({ entries, money, now, loading, change, setMessage }: {
  entries: MarketEntry[]; money: number; now: number; loading: boolean; change: ChangeGame; setMessage: (text: string) => void;
}) {
  const [stars, setStars] = useState(0);
  const [shinyOnly, setShinyOnly] = useState(false);
  const [type, setType] = useState('');
  const [generation, setGeneration] = useState(0);
  const left = msUntilRefresh(now);
  const filtered = stars > 0 || shinyOnly || type !== '' || generation > 0;

  const highlights = entries.filter((entry) => entry.available && (entry.shiny || ivStars(entry.ivs) >= maxStars));
  const visible = entries.filter((entry) => {
    const info = getPokemon(entry.species);
    return ivStars(entry.ivs) >= stars && (!shinyOnly || entry.shiny) && (!type || info?.types.includes(type)) && (!generation || info?.generation === generation);
  });

  function act(update: Parameters<ChangeGame>[0], success: string) {
    const problem = change(update);
    setMessage(problem ?? success);
  }

  return (
    <section className="game-panel market-panel" aria-label="Pokémon à venda">
      <div className="market-renew">
        <div className="min-w-0 grow">
          <span>Estoque renova em <b>{minutesLeft(left)} min</b></span>
          <div className="market-meter" role="img" aria-label={`Faltam ${minutesLeft(left)} minutos`}>
            <span style={{ width: `${Math.round(Math.min(1, Math.max(0, left / marketRefreshMs)) * 100)}%` }} />
          </div>
        </div>
        <Button variant="outline" disabled={money < marketRefreshPrice}
          onClick={() => act(refreshMarket(Date.now()), 'Estoque renovado!')}>
          <RefreshCw /> Renovar agora ({formatMoney(marketRefreshPrice)})
        </Button>
      </div>

      {highlights.length > 0 && (
        <p className="market-alert" role="status">
          <Bell aria-hidden="true" /> Destaque no estoque: {highlights.map((entry) => {
            const info = getPokemon(entry.species);
            return `${entry.shiny ? '✦ ' : ''}${info?.displayName ?? `#${entry.species}`} (${'★'.repeat(ivStars(entry.ivs))})`;
          }).join(', ')}
        </p>
      )}

      <div className="market-filters" aria-label="Filtros">
        <div className="shop-pills" role="group" aria-label="Estrelas de IV">
          {starFilters.map((count) => (
            <button key={count} type="button" aria-pressed={stars === count} onClick={() => setStars(count)}>
              {count === 0 ? 'Todas' : `${count}★${count < maxStars ? '+' : ''}`}
            </button>
          ))}
          <button type="button" aria-pressed={shinyOnly} onClick={() => setShinyOnly((value) => !value)}><Sparkles aria-hidden="true" /> Brilhante</button>
        </div>
        <select className="pc-select" aria-label="Tipo" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">Todos os tipos</option>
          {typeIds.map((id) => <option key={id} value={id}>{typeLabels[id]}</option>)}
        </select>
        <select className="pc-select" aria-label="Geração" value={generation} onChange={(event) => setGeneration(Number(event.target.value))}>
          <option value={0}>Todas as gerações</option>
          {generations.map((id) => <option key={id} value={id}>Geração {id}</option>)}
        </select>
        {filtered && (
          <Button variant="outline" size="sm" onClick={() => { setStars(0); setShinyOnly(false); setType(''); setGeneration(0); }}>
            Limpar ({visible.length}/{entries.length})
          </Button>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Preparando o estoque…</p>}
      {!loading && visible.length === 0 && <p className="text-sm text-muted-foreground">Nenhum Pokémon com esses filtros.</p>}
      <ul className="market-grid">
        {visible.map((entry) => {
          const info = getPokemon(entry.species);
          const name = info?.displayName ?? `Espécie ${entry.species}`;
          const count = ivStars(entry.ivs);
          const locked = !isRegionUnlocked(entry.species);
          const missing = entry.price - money;
          return (
            <li key={entry.id} className="market-card" data-grade={gradeOf(entry) ?? undefined} data-sold={!entry.available} data-pinned={entry.favorite}>
              <div className="market-art">
                {info ? <GameSprite sprite={info.sprite} shiny={entry.shiny} label={name} className="market-sprite" /> : <span className="market-sprite" />}
                {entry.shiny && <span className="market-tag market-tag-shiny"><Sparkles aria-hidden="true" /> Brilhante</span>}
                {locked && <span className="market-tag market-tag-lock" title="Região bloqueada: preço dobrado"><Lock aria-hidden="true" /> ×2</span>}
                {!entry.available && <span className="market-sold">Vendido</span>}
              </div>
              <div className="market-body">
                <h3 className="truncate font-bold">{name}</h3>
                <div className="market-types">{info?.types.map((entryType) => <TypeBadge key={entryType} type={entryType} />)}</div>
                <div className="market-line"><StarRow count={count} /><span className="text-xs text-muted-foreground">Nv 1 · Ger. {info?.generation ?? '—'}</span></div>
                <strong className="market-price">{formatMoney(entry.price)}</strong>
                {entry.available && missing > 0 && <span className="text-xs text-destructive">faltam {formatMoney(missing)}</span>}
              </div>
              <div className="market-actions">
                <Button size="sm" disabled={!entry.available || money < entry.price}
                  onClick={() => act(buyEntry(entry.id, Date.now()), `Você comprou ${name} por ${formatMoney(entry.price)}!`)}>
                  {entry.available ? 'Comprar' : 'Vendido'}
                </Button>
                <Button variant="outline" size="icon-sm" disabled={!entry.available} aria-pressed={entry.favorite}
                  aria-label={entry.favorite ? `Soltar ${name} do estoque` : `Fixar ${name} no estoque`}
                  title={entry.favorite ? 'Fixado: não some na renovação' : 'Fixar para guardar na renovação'}
                  onClick={() => act(pinEntry(entry.id, !entry.favorite, Date.now()), entry.favorite ? `${name} não está mais fixado.` : `${name} fixado: fica no estoque nas renovações.`)}>
                  {entry.favorite ? <PinOff /> : <Pin />}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Todos chegam no nível 1, com 2★ ou mais de IVs. Preço base {formatMoney(10_000)}; brilhante ×5, 3★ ×1,5 e 4★ ×2. O cadeado (×2) marca uma região ainda bloqueada.
        São {marketSize} Pokémon por hora; lendários e míticos entram depois da Elite dos 4.
      </p>
    </section>
  );
}

function SellTab({ owned, change, setMessage }: {
  owned: { pokemon: OwnedPokemon; inTeam: boolean }[]; change: ChangeGame; setMessage: (text: string) => void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [text, setText] = useState('');
  const [sort, setSort] = useState<SellSort>('value');
  const [minStars, setMinStars] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const list = useMemo(() => {
    const needle = normalizeDexSearch(text);
    const by: Record<SellSort, (a: OwnedPokemon, b: OwnedPokemon) => number> = {
      value: (a, b) => pokemonValue(b) - pokemonValue(a),
      level: (a, b) => b.level - a.level || pokemonValue(b) - pokemonValue(a),
      stars: (a, b) => ivStars(b.ivs) - ivStars(a.ivs) || pokemonValue(b) - pokemonValue(a),
      name: (a, b) => pokemonName(a).localeCompare(pokemonName(b), 'pt-BR'),
    };
    return owned
      .filter(({ pokemon }) => ivStars(pokemon.ivs) >= minStars
        && (!needle || normalizeDexSearch(`${pokemonName(pokemon)} ${getPokemon(pokemon.species)?.displayName ?? ''}`).includes(needle)))
      .sort((a, b) => by[sort](a.pokemon, b.pokemon));
  }, [owned, text, sort, minStars]);

  const chosen = owned.filter(({ pokemon }) => picked.has(pokemon.uid) && !pokemon.favorite);
  const total = chosen.reduce((sum, { pokemon }) => sum + pokemonValue(pokemon), 0);
  const markable = list.filter(({ pokemon }) => !pokemon.favorite && !pokemon.shiny && ivStars(pokemon.ivs) < 3);

  function toggle(uid: string) {
    setConfirming(false);
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(uid)) next.add(uid);
      return next;
    });
  }

  function sell() {
    const problem = change(sellPokemon(chosen.map(({ pokemon }) => pokemon.uid)));
    setConfirming(false);
    if (problem) { setMessage(problem); return; }
    setPicked(new Set());
    setMessage(`Vendeu ${chosen.length} Pokémon por ${formatMoney(total)}!`);
  }

  return (
    <section className="game-panel market-panel" aria-label="Vender Pokémon">
      <div className="market-filters" aria-label="Filtros de venda">
        <label className="shop-search">
          <Search aria-hidden="true" />
          <Input type="search" aria-label="Buscar por nome" placeholder="Buscar por nome…" value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <select className="pc-select" aria-label="Ordenar" value={sort} onChange={(event) => setSort(event.target.value as SellSort)}>
          {(Object.keys(sellSortLabels) as SellSort[]).map((key) => <option key={key} value={key}>{sellSortLabels[key]}</option>)}
        </select>
        <div className="shop-pills" role="group" aria-label="Estrelas de IV">
          {starFilters.map((count) => (
            <button key={count} type="button" aria-pressed={minStars === count} onClick={() => setMinStars(count)}>
              {count === 0 ? 'Todas' : `${count}★${count < maxStars ? '+' : ''}`}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" disabled={markable.length === 0}
          onClick={() => { setConfirming(false); setPicked((current) => new Set([...current, ...markable.map(({ pokemon }) => pokemon.uid)])); }}>
          Marcar a lista (sem ✦ nem 3★+)
        </Button>
        <Button variant="outline" size="sm" disabled={picked.size === 0} onClick={() => { setConfirming(false); setPicked(new Set()); }}>Desmarcar</Button>
      </div>

      {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum Pokémon com esses filtros.</p>}
      <ul className="market-sellgrid">
        {list.map(({ pokemon, inTeam }) => {
          const on = picked.has(pokemon.uid);
          return (
            <li key={pokemon.uid}>
              <button type="button" className="market-sell" aria-pressed={on} disabled={pokemon.favorite}
                data-grade={gradeOf(pokemon) ?? undefined} onClick={() => toggle(pokemon.uid)}
                title={pokemon.favorite ? 'Favoritos não podem ser vendidos' : undefined}>
                <PokemonSprite pokemon={pokemon} className="market-sell-sprite" />
                <span className="market-sell-name">{pokemon.favorite ? '♥ ' : ''}{pokemon.shiny ? '✦ ' : ''}{pokemonName(pokemon)}</span>
                <span className="market-line"><StarRow count={ivStars(pokemon.ivs)} /><span className="text-xs text-muted-foreground">Nv {pokemon.level}</span></span>
                {inTeam && <span className="market-sell-tag">equipe</span>}
                <strong className="market-price">{formatMoney(pokemonValue(pokemon))}</strong>
                {on && <span className="market-check" aria-hidden="true">✔</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="market-sellbar">
        <span><b>{chosen.length}</b> {chosen.length === 1 ? 'escolhido' : 'escolhidos'} · <b>{formatMoney(total)}</b></span>
        {confirming ? (
          <div className="pc-confirm" role="alertdialog" aria-label="Confirmar venda">
            <span>Vender {chosen.length} por {formatMoney(total)}? Não dá para desfazer.</span>
            <Button variant="destructive" size="sm" onClick={sell}>Vender</Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Cancelar</Button>
          </div>
        ) : (
          <Button disabled={chosen.length === 0} onClick={() => setConfirming(true)}><Coins /> Vender selecionados</Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Valor = (metade do preço da bola + 10 por nível) × brilhante (×10) × lendário (×3) × IVs (3★ ×1,5; 4★ ×2). Master Bola: 20 por nível.
        Favoritos (♥) não são vendidos e a equipe precisa manter ao menos um Pokémon.
      </p>
    </section>
  );
}
