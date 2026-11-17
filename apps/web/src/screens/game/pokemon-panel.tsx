import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Coins, Footprints, Heart, Monitor, Users } from 'lucide-react';
import { formatDexNumber, getPokemon } from '@pokesim-evolution/data/pokedex';
import { getPokemonDetails, type BaseStats } from '@pokesim-evolution/data/pokedex-details';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { onCollection, type ChangeGame, type GameState } from '@/lib/game-state';
import { maxIv, maxTotalIv, ivQuality, starText, statKeys, statLabels as ivLabels } from '@/lib/ivs';
import { pokemonValue, sellPokemon } from '@/lib/market';
import {
  companionOf, getAt, locate, maxNicknameLength, move, sendToPc, setCompanion, setFavorite, setNickname, withdraw,
  type Collection, type Result,
} from '@/lib/pokemon-collection';
import { TypeBadge } from './pokedex-media';
import { formatMoney } from './trainer-card';
import { MovesSection } from './moves-section';
import { TrainingActions } from './inventory-screen';
import { EvolutionLine } from './evolution-line';
import { formOf } from '@/lib/training';
import { PokemonMarks, PokemonSprite, pokemonName, speciesName } from './pokemon-ui';

const statLabels = {
  hp: 'HP', atk: 'Ataque', def: 'Defesa', spa: 'Ataque especial', spd: 'Defesa especial', spe: 'Velocidade',
} as const;
const measure = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function prettyName(name: string) {
  return name.replace(/(^|-)([a-z])/g, (_, separator: string, letter: string) =>
    (separator ? ' ' : '') + letter.toUpperCase());
}

export default function PokemonPanel({ uid, state, change, onClose, onOpenPokedex }: {
  uid: string;
  state: GameState;
  change: ChangeGame;
  onClose: () => void;
  onOpenPokedex: (species: number) => void;
}) {
  const place = locate(state.collection, uid);
  const pokemon = place && getAt(state.collection, place);
  const entry = pokemon ? getPokemon(pokemon.species) : undefined;
  const species = pokemon?.species;

  const [details, setDetails] = useState<Awaited<ReturnType<typeof getPokemonDetails>>>();
  const [unavailable, setUnavailable] = useState(false);
  const [nickname, setNicknameDraft] = useState(pokemon?.nickname ?? '');
  const [message, setMessage] = useState('');
  const [confirmSell, setConfirmSell] = useState(false);

  useEffect(() => {
    if (!entry) return;
    let active = true;
    setDetails(undefined);
    setUnavailable(false);
    void getPokemonDetails(entry.id, entry.generation).then((data) => {
      if (!active) return;
      setDetails(data);
      setUnavailable(!data);
    }).catch(() => {
      if (active) setUnavailable(true);
    });
    return () => { active = false; };
  }, [entry]);

  // A espécie só muda por fora (troca do inicial); o apelido em edição acompanha o Pokémon exibido.
  useEffect(() => { setNicknameDraft(pokemon?.nickname ?? ''); }, [uid, species, pokemon?.nickname]);

  if (!pokemon || !place || !entry) return null;
  const form = formOf(pokemon);

  function run(operation: (collection: Collection) => Result) {
    setMessage(change(onCollection(operation)) ?? '');
  }

  function saveNickname(event: FormEvent) {
    event.preventDefault();
    run((collection) => setNickname(collection, uid, nickname));
  }

  const inTeam = place.kind === 'team';
  const teamIndex = inTeam ? place.index : -1;
  const teamLength = state.collection.team.length;
  const isCompanion = companionOf(state.collection).uid === uid;
  const nicknameChanged = nickname.trim() !== (pokemon.nickname ?? '');
  const quality = ivQuality(pokemon.ivs);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><span>{pokemonName(pokemon)}</span><PokemonMarks pokemon={pokemon} /></DialogTitle>
          <DialogDescription>
            {inTeam ? `Vaga ${teamIndex + 1} da equipe` : `PC · ${state.collection.boxes[place.kind === 'box' ? place.box : 0]?.name}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <PokemonSprite pokemon={pokemon} className="dex-portrait" />
          <div className="grid min-w-0 gap-1.5">
            <p className="dex-species-meta">
              {pokemon.nickname ? `${speciesName(pokemon)} · ` : ''}{formatDexNumber(entry.id)} <span>·</span> Nv {pokemon.level}
            </p>
            <div className="flex flex-wrap gap-2">{(form?.types ?? entry.types).map((type) => <TypeBadge key={type} type={type} />)}</div>
            {details && (
              <p className="text-xs text-muted-foreground">
                {details.height === null ? '—' : `${measure.format(details.height)} m`} · {details.weight === null ? '—' : `${measure.format(details.weight)} kg`}
              </p>
            )}
          </div>
        </div>

        <MovesSection pokemon={pokemon} state={state} change={change} />
        <details open className="rounded-lg border p-3">
          <summary className="cursor-pointer font-bold">Evolução e formas</summary>
          <div className="mt-3 grid gap-4">
            {details ? <EvolutionLine chain={details.evolutionChain} currentSpecies={pokemon.species} /> :
              <p role="status" className="text-sm text-muted-foreground">{unavailable ? 'Linha evolutiva indisponível.' : 'Carregando linha evolutiva…'}</p>}
            {formOf(pokemon) && <p className="text-sm text-muted-foreground">Forma atual: <strong className="text-foreground">{formOf(pokemon)?.displayName}</strong></p>}
            <div className="grid gap-2 border-t pt-3">
              <h3 className="text-sm font-bold">Evoluções e formas disponíveis</h3>
              <TrainingActions pokemon={pokemon} game={state} change={change} mode="evolution" emptyText="Nenhuma evolução ou forma disponível no momento." />
            </div>
          </div>
        </details>
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer font-bold">Treinamento</summary>
          <div className="mt-3"><TrainingActions pokemon={pokemon} game={state} change={change} mode="training" emptyText="Nenhum item de treinamento disponível na mochila." /></div>
        </details>

        <section className="grid gap-2" aria-labelledby="panel-stats">
          <h3 id="panel-stats" className="game-section-title">Atributos base</h3>
          {details ? (
            <dl className="dex-stats">
              {(Object.keys(statLabels) as (keyof BaseStats)[]).map((stat) => (
                <div key={stat}>
                  <dt>{statLabels[stat]}</dt>
                  <dd>
                    <span className="dex-stat-track" aria-hidden="true"><span style={{ width: `${(form?.baseStats ?? details.baseStats)[stat] / 255 * 100}%` }} /></span>
                    <strong>{(form?.baseStats ?? details.baseStats)[stat]}</strong>
                  </dd>
                </div>
              ))}
            </dl>
          ) : <p role="status" className="text-sm text-muted-foreground">{unavailable ? 'Atributos indisponíveis.' : 'Carregando…'}</p>}
          {details && details.abilities.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Habilidades:</strong>{' '}
              {details.abilities.map(({ name, hidden }) => `${prettyName(name)}${hidden ? ' (oculta)' : ''}`).join(', ')}
            </p>
          )}
        </section>

        <section className="grid gap-2" aria-labelledby="panel-ivs">
          <h3 id="panel-ivs" className="game-section-title">Valores individuais (IVs)</h3>
          <p className="wild-iv wild-iv-left" data-stars={quality.stars}>
            <span className="wild-stars" data-stars={quality.stars} role="img" aria-label={`${quality.stars} de 4 estrelas`}>{starText(quality.stars)}</span>
            <span>{quality.label} · {quality.total}/{maxTotalIv} ({quality.percentage}%)</span>
          </p>
          <dl className="dex-stats iv-list">
            {statKeys.map((stat) => (
              <div key={stat} className={pokemon.ivs[stat] === maxIv ? 'iv-max' : undefined}>
                <dt>{ivLabels[stat]}</dt>
                <dd>
                  <span className="dex-stat-track" aria-hidden="true"><span style={{ width: `${pokemon.ivs[stat] / maxIv * 100}%` }} /></span>
                  <strong>{pokemon.ivs[stat]}</strong>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="grid gap-3" aria-labelledby="panel-manage">
          <h3 id="panel-manage" className="game-section-title">Gerenciar</h3>

          <form className="flex gap-2" onSubmit={saveNickname}>
            <Input value={nickname} maxLength={maxNicknameLength} placeholder={`Apelido (${speciesName(pokemon)})`}
              aria-label="Apelido" onChange={(event) => setNicknameDraft(event.target.value)} />
            <Button type="submit" variant="outline" disabled={!nicknameChanged}>Salvar</Button>
          </form>

          <div className="flex flex-wrap gap-2">
            <Button variant={pokemon.favorite ? 'default' : 'outline'} aria-pressed={pokemon.favorite}
              onClick={() => run((collection) => setFavorite(collection, [uid], !pokemon.favorite))}>
              <Heart fill={pokemon.favorite ? 'currentColor' : 'none'} /> {pokemon.favorite ? 'Favorito' : 'Favoritar'}
            </Button>

            {inTeam ? (
              <>
                <Button variant={isCompanion ? 'default' : 'outline'} aria-pressed={isCompanion} disabled={isCompanion}
                  onClick={() => run((collection) => setCompanion(collection, uid))}>
                  <Footprints /> {isCompanion ? 'Companheiro' : 'Definir como companheiro'}
                </Button>
                <Button variant="outline" onClick={() => run((collection) => sendToPc(collection, uid))}><Monitor /> Enviar ao PC</Button>
                <Button variant="outline" disabled={teamIndex === 0} aria-label="Subir na equipe"
                  onClick={() => run((collection) => move(collection, place, { kind: 'team', index: teamIndex - 1 }))}><ArrowUp /> Subir</Button>
                <Button variant="outline" disabled={teamIndex >= teamLength - 1} aria-label="Descer na equipe"
                  onClick={() => run((collection) => move(collection, place, { kind: 'team', index: teamIndex + 1 }))}><ArrowDown /> Descer</Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => run((collection) => withdraw(collection, uid))}><Users /> Levar à equipe</Button>
            )}

            <Button variant="outline" onClick={() => onOpenPokedex(pokemon.species)}><BookOpen /> Ver na Pokédex</Button>
          </div>

          {confirmSell ? (
            <div className="pc-confirm" role="alertdialog" aria-label="Confirmar venda">
              <span>Vender {pokemonName(pokemon)} por {formatMoney(pokemonValue(pokemon))}? Isso não pode ser desfeito.</span>
              <Button variant="destructive" size="sm" onClick={() => {
                const problem = change(sellPokemon([uid]));
                if (problem) { setMessage(problem); setConfirmSell(false); return; }
                onClose();
              }}>Vender</Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmSell(false)}>Cancelar</Button>
            </div>
          ) : (
            <Button variant="outline" className="justify-self-start" disabled={pokemon.favorite}
              title={pokemon.favorite ? 'Tire o favorito antes de vender' : undefined}
              onClick={() => { setMessage(''); setConfirmSell(true); }}><Coins /> Vender · {formatMoney(pokemonValue(pokemon))}</Button>
          )}

          {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
          <p className="text-xs text-muted-foreground">Os itens chegam junto com a mochila do jogo.</p>
        </section>
      </DialogContent>
    </Dialog>
  );
}
