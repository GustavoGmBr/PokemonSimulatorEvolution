import { useRef, useState } from 'react';
const bulbasaur = `${import.meta.env.BASE_URL}recursos/Pokemons/BULBASAUR.png`;
const charmander = `${import.meta.env.BASE_URL}recursos/Pokemons/CHARMANDER.png`;
import { FxStage, type FxStageHandle } from '@/screens/game/battle-fx-stage';
import { animationsOf, fxTypes, palettes, type FxAnimation, type FxType } from '@/lib/battle-fx';

const typeNames: Record<FxType, string> = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', electric: 'Elétrico', grass: 'Planta', ice: 'Gelo', fighting: 'Lutador',
  poison: 'Veneno', ground: 'Terra', flying: 'Voador', psychic: 'Psíquico', bug: 'Inseto', rock: 'Pedra', ghost: 'Fantasma',
  dragon: 'Dragão', dark: 'Sombrio', steel: 'Aço', fairy: 'Fada',
};
const kindNames = { physical: 'Físico', special: 'Especial', status: 'Status' } as const;

/** Galeria das animações de golpes (`#/animacoes`): escolha um tipo e toque cada animação na arena. */
export function FxGalleryScreen() {
  const [type, setType] = useState<FxType>('fire');
  const [side, setSide] = useState<'jogador' | 'adversario'>('jogador');
  const [playing, setPlaying] = useState<string | null>(null);
  const stage = useRef<FxStageHandle>(null);
  const list = animationsOf(type);

  async function play(animation: FxAnimation) {
    setPlaying(animation.id);
    await stage.current?.play(animation, side);
    setPlaying((now) => (now === animation.id ? null : now));
  }

  return (
    <main className="fx-gallery">
      <header>
        <h1>Animações de golpes</h1>
        <p>{fxTypes.length} tipos · {list.length} animações neste tipo.</p>
        <a href="#" className="fx-back">Voltar</a>
      </header>
      <nav className="fx-types" aria-label="Tipo do golpe">
        {fxTypes.map((t) => (
          <button key={t} type="button" aria-pressed={t === type} onClick={() => setType(t)}
            style={{ ['--fx-color' as string]: palettes[t].mid }}>{typeNames[t]}</button>
        ))}
      </nav>
      <div className="fx-layout">
        <div className="fx-view">
          <FxStage ref={stage} scene="campina" playerSheet={bulbasaur} enemySheet={charmander} />
          <div className="fx-sides">
            <button type="button" aria-pressed={side === 'jogador'} onClick={() => setSide('jogador')}>Jogador ataca</button>
            <button type="button" aria-pressed={side === 'adversario'} onClick={() => setSide('adversario')}>Adversário ataca</button>
          </div>
        </div>
        <ul className="fx-list">
          {list.map((animation) => (
            <li key={animation.id}>
              <button type="button" aria-pressed={playing === animation.id} onClick={() => void play(animation)}>
                <strong>{animation.name}</strong>
                <span>{kindNames[animation.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
