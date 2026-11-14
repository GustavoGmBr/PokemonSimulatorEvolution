import { Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ItemIcon } from '@/components/item-icon';
import { Button } from '@/components/ui/button';
import * as rules from '@/lib/battle/casino-rules';
import { buyCasinoPrize, casinoAction, casinoPrizes, stakeCandidates, startCasino, type CasinoOutcome, type Result } from '@/lib/casino';
import type { ChangeGame, GameState } from '@/lib/game-state';
import { pokemonValue } from '@/lib/market';
import { itemName } from '@/lib/training';
import { PokemonSprite, pokemonName } from '../pokemon-ui';
import { formatMoney } from '../trainer-card';
import { Coin, SpeciesSprite, times } from './common';
import { DoorsStage, DuelStage } from './picks';
import { RaceStage } from './race';
import { RouletteBoard, RouletteStage } from './roulette';
import { JackStage, PiplupStage, VoltorbStage } from './rounds';
import { SlotsStage } from './slots';
import { WheelStage } from './wheel';
import '@/styles/casino.css';

type Props = { game: GameState; change: ChangeGame };
type Last = { key: number; outcome: CasinoOutcome; multiplier: number; message: string };
type Banner = { multiplier: number; message: string };

const cards: Record<rules.CasinoGame, { item?: string; species?: number; hint: string }> = {
  slots: { item: 'master-ball', hint: '3×3 rolos, 8 linhas' }, roulette: { item: 'great-ball', hint: 'Números, cores e grupos' },
  voltorb: { species: 100, hint: 'Vire cartas, fuja do Voltorb' }, jack: { species: 52, hint: 'Chegue a 21' },
  race: { species: 78, hint: 'Aposte no corredor' }, wheel: { species: 35, hint: 'Até 10×' },
  piplup: { species: 393, hint: 'Pule e resgate' }, doors: { species: 133, hint: 'Ache o Eevee' }, duel: { species: 4, hint: 'Planta, Fogo ou Água' },
};
const amounts = [10, 25, 50, 100, 500];

function verdict(multiplier: number) {
  if (multiplier > 1) return { kind: 'win', title: 'Você ganhou!' } as const;
  if (multiplier === 1) return { kind: 'push', title: 'Aposta devolvida' } as const;
  if (multiplier > 0) return { kind: 'partial', title: 'Retorno parcial' } as const;
  return { kind: 'lose', title: 'Não foi desta vez' } as const;
}

/** Cassino (Game Corner): escolha do jogo, aposta com fichas ou Pokémon, mesa animada e loja de prêmios. */
export default function CasinoScreen({ game, change }: Props) {
  const [id, setId] = useState<rules.CasinoGame>('slots');
  const [mode, setMode] = useState<'chips' | 'pokemon'>('chips');
  const [chips, setChips] = useState('25');
  const [uid, setUid] = useState('');
  const [pick, setPick] = useState(0);
  const [roulette, setRoulette] = useState('color:red');
  const [message, setMessage] = useState('');
  const [last, setLast] = useState<Last>();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const counter = useRef(0);
  const lastRef = useRef<Last | undefined>(undefined);
  lastRef.current = last;

  const real = game.progress.casinoChips;
  // O saldo só muda na tela depois que a animação termina, para não entregar o resultado antes da hora.
  const [shown, setShown] = useState(real);
  useEffect(() => { if (!busy) setShown(real); }, [busy, real]);

  const round = game.progress.casinoRound;
  const visible = round?.game ?? id;
  const candidates = stakeCandidates(game);
  const stakeUid = mode === 'pokemon' ? uid : '';
  const picked = candidates.find((pokemon) => pokemon.uid === uid);
  const locked = busy || Boolean(round);
  const outcomeFor = <T extends CasinoOutcome['game']>(name: T) => (last?.outcome.game === name ? last.outcome as Extract<CasinoOutcome, { game: T }> : undefined);
  const playKey = last?.key;

  const finish = useCallback(() => {
    const current = lastRef.current;
    setBusy(false);
    if (current) setBanner({ multiplier: current.multiplier, message: current.message });
  }, []);

  function run(action: (current: GameState) => Result | string) {
    let feedback = '';
    let outcome: CasinoOutcome | undefined;
    let multiplier: number | undefined;
    const error = change((current) => {
      const result = action(current);
      if (typeof result === 'string') return result;
      feedback = result.message;
      outcome = result.outcome;
      multiplier = result.multiplier;
      return result.state;
    });
    setAbandoning(false);
    if (error) { setMessage(error); setBanner(null); return; }
    setMessage(feedback);
    if (outcome) {
      counter.current += 1;
      setLast({ key: counter.current, outcome, multiplier: multiplier ?? 0, message: feedback });
      setBusy(true);
      setBanner(null);
    } else if (multiplier !== undefined) {
      setBanner({ multiplier, message: feedback });
    } else {
      setBanner(null);
    }
  }
  const play = (action: Parameters<typeof casinoAction>[1], index?: number) => run((current) => casinoAction(current, action, index));
  function start() {
    const [kind, value] = roulette.split(':');
    const bet = rules.parseRouletteBet({ kind, value: kind === 'number' || kind === 'dozen' ? Number(value) : value });
    run((current) => startCasino(current, id, Number(chips), stakeUid, pick, bet));
  }
  function choose(next: rules.CasinoGame) {
    if (locked) return;
    setId(next);
    setPick(0);
    setBanner(null);
    setMessage('');
  }
  const setAmount = (value: number) => setChips(String(Math.max(1, Math.min(rules.MAX_BET, Math.floor(value)))));

  const live = round?.game;
  const stage = (() => {
    switch (visible) {
      case 'slots': return <SlotsStage outcome={outcomeFor('slots')} playKey={playKey} onDone={finish} />;
      case 'roulette': return <RouletteStage outcome={outcomeFor('roulette')} playKey={playKey} onDone={finish} />;
      case 'wheel': return <WheelStage outcome={outcomeFor('wheel')} playKey={playKey} onDone={finish} />;
      case 'race': return <RaceStage outcome={outcomeFor('race')} playKey={playKey} onDone={finish} pick={pick} onPick={setPick} locked={locked} />;
      case 'doors': return <DoorsStage outcome={outcomeFor('doors')} playKey={playKey} onDone={finish} pick={pick} onPick={setPick} locked={locked} />;
      case 'duel': return <DuelStage outcome={outcomeFor('duel')} playKey={playKey} onDone={finish} pick={pick} onPick={setPick} locked={locked} />;
      case 'voltorb': return <VoltorbStage state={live === 'voltorb' ? round!.state as rules.VoltorbState : undefined} outcome={outcomeFor('voltorb')} playKey={playKey} onDone={finish}
        onPick={(index) => play('play', index)} locked={busy} />;
      case 'jack': return <JackStage state={live === 'jack' ? round!.state as rules.JackState : undefined} outcome={outcomeFor('jack')} playKey={playKey} onDone={finish} />;
      case 'piplup': return <PiplupStage state={live === 'piplup' ? round!.state as rules.PiplupState : undefined} outcome={outcomeFor('piplup')} playKey={playKey} onDone={finish} />;
    }
  })();

  const result = banner && !busy ? verdict(banner.multiplier) : null;
  const amount = Number(chips) || 0;
  const cannotStart = busy || (mode === 'pokemon' ? !picked : real < 1 || amount < 1 || amount > real);

  return (
    <div className="cz" data-game={visible}>
      <header className="cz-top">
        <div className="cz-marquee">
          <span className="cz-bulbs" aria-hidden="true" />
          <h2>Game Corner</h2>
          <p>Minijogos, fichas e prêmios</p>
        </div>
        <div className="cz-balance" role="status" aria-label={`${shown} fichas`}>
          <Coin size="lg" /><b>{shown.toLocaleString('pt-BR')}</b><small>fichas</small>
        </div>
      </header>

      <nav className="cz-games" aria-label="Jogos do cassino">
        {rules.CASINO_GAMES.map((name) => {
          const art = cards[name];
          const active = visible === name;
          return (
            <button key={name} type="button" className="cz-game" data-active={active} aria-pressed={active} disabled={locked && !active} onClick={() => choose(name)}>
              <span className="cz-game-art">{art.item ? <ItemIcon item={art.item} size={40} /> : <SpeciesSprite id={art.species!} className="cz-sprite cz-sprite-card" />}</span>
              <b>{rules.CASINO_NAMES[name]}</b>
              <small>{art.hint}</small>
              {rules.ROUND_GAMES.includes(name) && <em>em etapas</em>}
            </button>
          );
        })}
      </nav>

      <div className="cz-floor">
        <section className="cz-table" aria-label={rules.CASINO_NAMES[visible]}>
          <h3 className="cz-table-title">{rules.CASINO_NAMES[visible]}</h3>
          {stage}
          {round && (
            <div className="cz-actions">
              {round.game !== 'voltorb' && <Button className="cz-btn cz-btn-gold" disabled={busy} onClick={() => play('play')}>{round.game === 'jack' ? 'Pedir carta' : 'Pular'}</Button>}
              {round.game === 'jack' && round.state.player.length === 2 && !round.stake.uid && real >= round.stake.chips &&
                <Button className="cz-btn" disabled={busy} onClick={() => play('double')}>Dobrar</Button>}
              <Button className="cz-btn" disabled={busy || (round.game === 'piplup' && round.state.jumps === 0) || (round.game === 'voltorb' && !round.state.revealed.length)}
                onClick={() => play('take')}>{round.game === 'jack' ? 'Parar' : 'Resgatar'}</Button>
              <Button className="cz-btn cz-btn-danger" disabled={busy} onClick={() => (abandoning ? play('abandon') : setAbandoning(true))}>
                {abandoning ? 'Confirmar: perder a aposta' : 'Abandonar'}
              </Button>
            </div>
          )}
          {result && banner && (
            <div className="cz-result" data-kind={result.kind} role="status">
              <b>{result.title}</b><span>{banner.message}</span>
            </div>
          )}
          {!result && message && !busy && <p className="cz-note" role="status">{message}</p>}
          {id === 'roulette' && !round && <RouletteBoard bet={roulette} onBet={setRoulette} disabled={locked} />}
        </section>

        <aside className="cz-side">
          <section className="cz-panel" aria-label="Aposta">
            <h3 className="cz-panel-title">Aposta</h3>
            {round ? (
              <p className="cz-note">Rodada em andamento: {round.stake.uid ? 'um Pokémon está em jogo' : `${round.stake.chips.toLocaleString('pt-BR')} fichas em jogo`}. Termine para apostar de novo.</p>
            ) : (
              <>
                <div className="cz-seg" role="group" aria-label="Apostar com">
                  <button type="button" aria-pressed={mode === 'chips'} disabled={locked} onClick={() => setMode('chips')}><Coin size="sm" /> Fichas</button>
                  <button type="button" aria-pressed={mode === 'pokemon'} disabled={locked} onClick={() => setMode('pokemon')}>Pokémon</button>
                </div>
                {mode === 'chips' ? (
                  <>
                    <div className="cz-amount">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Diminuir aposta" disabled={locked} onClick={() => setAmount(amount - 10)}><Minus /></Button>
                      <input type="number" inputMode="numeric" min={1} max={rules.MAX_BET} value={chips} disabled={locked} aria-label="Quantidade de fichas"
                        onChange={(event) => setChips(event.target.value)} />
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Aumentar aposta" disabled={locked} onClick={() => setAmount(amount + 10)}><Plus /></Button>
                    </div>
                    <div className="cz-quick">
                      {amounts.map((value) => <button key={value} type="button" disabled={locked || real < value} onClick={() => setAmount(value)}>{value}</button>)}
                      <button type="button" disabled={locked || real < 1} onClick={() => setAmount(Math.min(real, rules.MAX_BET))}>Máx.</button>
                    </div>
                  </>
                ) : (
                  <div className="cz-stake">
                    <select value={uid} disabled={locked} aria-label="Pokémon apostado" onChange={(event) => setUid(event.target.value)}>
                      <option value="">Escolha um Pokémon…</option>
                      {candidates.map((pokemon) => <option key={pokemon.uid} value={pokemon.uid}>{pokemonName(pokemon)} · Nv. {pokemon.level}</option>)}
                    </select>
                    {picked ? (
                      <div className="cz-stake-card">
                        <PokemonSprite pokemon={picked} className="cz-sprite cz-sprite-stake" />
                        <span><b>{pokemonName(picked)}</b><small>Nv. {picked.level} · vale {formatMoney(pokemonValue(picked))}</small></span>
                      </div>
                    ) : <p className="cz-note">Só Pokémon que não são favoritos podem ser apostados.</p>}
                    <p className="cz-warn">Uma derrota remove o Pokémon apostado da coleção.</p>
                  </div>
                )}
                <Button className="cz-btn cz-btn-gold cz-play" disabled={cannotStart} onClick={start}>
                  {mode === 'chips' ? <>Jogar <Coin size="sm" /> {amount > 0 ? amount.toLocaleString('pt-BR') : ''}</> : 'Jogar com o Pokémon'}
                </Button>
                {real === 0 && mode === 'chips' && <p className="cz-note">Sem fichas: resgate missões para ganhar mais.</p>}
              </>
            )}
          </section>
        </aside>
      </div>

      <section className="cz-panel" aria-label="Loja de prêmios">
        <h3 className="cz-panel-title">Loja de prêmios</h3>
        <ul className="cz-prizes">
          {casinoPrizes.map(([item, price]) => {
            const owned = game.progress.bag[item] ?? 0;
            const disabled = busy || shown < price || owned >= 99;
            return (
              <li key={item}>
                <button type="button" className="cz-prize" disabled={disabled} aria-label={`${itemName(item)}, ${price.toLocaleString('pt-BR')} fichas`}
                  onClick={() => setMessage(change((current) => buyCasinoPrize(current, item)) ?? `${itemName(item)} comprado.`)}>
                  <ItemIcon item={item} size={36} />
                  <span><b>{itemName(item)}</b><small>Você tem {owned}</small></span>
                  <em><Coin size="sm" />{price.toLocaleString('pt-BR')}</em>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
