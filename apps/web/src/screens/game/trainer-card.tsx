import { useState } from 'react';
import { BookOpen, CalendarDays, CircleDollarSign, Clock, Coins, Crosshair, Medal, Skull, Pencil, Sparkles, Swords, Trophy, Users, type LucideIcon } from 'lucide-react';
import { TrainerSpritePreview } from '@/components/sprite-preview';
import { TrainerSpritePicker } from '@/screens/trainer-sprite-picker';
import { pokedexTotal, totalBadges, type JourneyProgress, type JourneySave } from '@/lib/journey-saves';
import { getTrainerSprite } from '@/lib/trainer-sprites';

const numbers = new Intl.NumberFormat('pt-BR');
const dates = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

export function formatMoney(value: number) {
  return `₽ ${numbers.format(value)}`;
}

function formatPlayTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'Menos de 1 min';
  const hours = Math.floor(minutes / 60);
  return hours ? `${numbers.format(hours)} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
}

function formatStart(createdAt: string | null) {
  return createdAt ? dates.format(new Date(createdAt)) : 'Não registrado';
}

function winRate({ wins, losses }: JourneyProgress['stats']) {
  const battles = wins + losses;
  return battles ? `${Math.round((wins / battles) * 100)}%` : '—';
}

/** Dinheiro e fichas do cassino, usados na barra superior e na Visão geral. */
export function Wallet({ progress, className = '' }: { progress: JourneyProgress; className?: string }) {
  return (
    <ul className={`game-wallet ${className}`} aria-label="Dinheiro e fichas">
      <li title="Dinheiro">
        <Coins aria-hidden="true" />
        <span className="sr-only">Dinheiro: </span>
        <span>{formatMoney(progress.money)}</span>
      </li>
      <li title="Fichas do cassino">
        <CircleDollarSign aria-hidden="true" />
        <span className="sr-only">Fichas do cassino: </span>
        <span>{numbers.format(progress.casinoChips)}</span>
      </li>
    </ul>
  );
}

function Fact({ icon: Icon, label, value, hint, progress }: {
  icon: LucideIcon; label: string; value: string; hint?: string; progress?: number;
}) {
  return (
    <div className="trainer-fact">
      <dt><Icon aria-hidden="true" />{label}</dt>
      <dd>{value}</dd>
      {hint && <small>{hint}</small>}
      {progress !== undefined && (
        <span className="trainer-fact-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, progress)}%` }} /></span>
      )}
    </div>
  );
}

/** Cartão de informações do treinador: identidade à esquerda, jornada e estatísticas ocupando o resto da tela. */
export function TrainerCard({ save, onChangeSprite }: { save: JourneySave; onChangeSprite: (id: string) => Promise<void> }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { progress } = save;
  const { stats } = progress;
  const sprite = getTrainerSprite(save.trainerSprite);
  const battles = stats.wins + stats.losses;

  return (
    <article className="trainer-card" aria-label={`Cartão de ${save.trainer}`}>
      <header className="trainer-identity">
        <TrainerSpritePicker value={save.trainerSprite} gender={save.gender} includeUnclassified={false} onChange={(id) => {
          if (id === save.trainerSprite) return;
          setError('');
          setSaving(true);
          void onChangeSprite(id)
            .catch(() => setError('Não foi possível salvar a troca de sprite. Tente novamente.'))
            .finally(() => setSaving(false));
        }} trigger={
          <button type="button" className="trainer-card-sprite" aria-label="Trocar sprite do treinador"
            title="Trocar sprite do treinador" aria-disabled={saving} onClick={(event) => { if (saving) event.preventDefault(); }}>
            {sprite && <TrainerSpritePreview sprite={sprite} />}
            <span className="trainer-card-edit"><Pencil size={16} aria-hidden="true" /></span>
          </button>
        } />
        {error && <p role="alert" className="text-sm">{error}</p>}
        <div className="trainer-identity-text">
          <small>Cartão do treinador</small>
          <h2>{save.trainer}</h2>
        </div>
        <Wallet progress={progress} className="game-wallet-card" />
      </header>

      <div className="trainer-sections">
        <section className="trainer-section" aria-labelledby="trainer-progress">
          <h3 id="trainer-progress" className="trainer-card-heading">Jornada</h3>
          <dl className="trainer-facts">
            <Fact icon={BookOpen} label="Pokédex" value={`${numbers.format(progress.caughtSpecies.length)} / ${numbers.format(pokedexTotal)}`}
              hint="espécies únicas capturadas" progress={(progress.caughtSpecies.length / pokedexTotal) * 100} />
            <Fact icon={Medal} label="Insígnias" value={`${progress.badges} / ${totalBadges}`}
              hint="conquistadas" progress={(progress.badges / totalBadges) * 100} />
            <Fact icon={Skull} label="Modo" value={progress.mode === 'permadeath' ? 'Morte permanente' : 'Normal'}
              hint={progress.cycle > 0 ? `Novo Jogo+ · jogo zerado ${progress.cycle}x` : 'dificuldade da jornada'} />
            <Fact icon={Clock} label="Tempo" value={formatPlayTime(progress.playSeconds)} hint="de jogo" />
            <Fact icon={CalendarDays} label="Início" value={formatStart(progress.createdAt)} hint="criação do save" />
          </dl>
        </section>

        <section className="trainer-section" aria-labelledby="trainer-stats">
          <h3 id="trainer-stats" className="trainer-card-heading">Estatísticas</h3>
          <dl className="trainer-facts">
            <Fact icon={Swords} label="Vitórias / Derrotas" value={`${numbers.format(stats.wins)} / ${numbers.format(stats.losses)}`}
              hint={`${winRate(stats)} de vitórias`} progress={battles ? (stats.wins / battles) * 100 : 0} />
            <Fact icon={Crosshair} label="Capturas" value={numbers.format(stats.captures)} hint="no total" />
            <Fact icon={Sparkles} label="Shinies encontrados" value={numbers.format(stats.shinies)} />
            <Fact icon={Users} label="Treinadores vencidos" value={numbers.format(stats.trainersDefeated)} />
            <Fact icon={Trophy} label="Títulos de torneio" value={numbers.format(stats.tournamentTitles)} />
          </dl>
        </section>
      </div>
    </article>
  );
}
