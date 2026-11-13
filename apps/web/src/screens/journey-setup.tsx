import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { gameModes, starterGenerations, type GameMode, type JourneyDraft, type Starter } from '@/lib/journey-saves';
import { defaultSpriteByGender, getTrainerSprite, type TrainerGender } from '@/lib/trainer-sprites';
import { firstJourneyGenerations, StarterPicker } from './starter-picker';
import { TrainerSpritePicker } from './trainer-sprite-picker';

export function JourneySetup({ draft, onSave, submitLabel = 'Salvar alterações' }: {
  draft?: JourneyDraft;
  onSave: (draft: JourneyDraft, mode: GameMode) => Promise<void>;
  submitLabel?: string;
}) {
  const [trainer, setTrainer] = useState(draft?.trainer ?? '');
  const [starter, setStarter] = useState<Starter | null>(draft?.starter ?? null);
  const [gender, setGender] = useState<TrainerGender>(draft?.gender ?? 'male');
  const [trainerSprite, setTrainerSprite] = useState(draft?.trainerSprite ?? defaultSpriteByGender.male);
  const [mode, setMode] = useState<GameMode>('normal');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Saves antigos podem ter um inicial de outra geração: a geração dele continua visível para não sumir da tela.
  const savedGeneration = draft && starterGenerations.find(({ starters }) => starters.some(([name]) => name === draft.starter))?.generation;
  const generations = savedGeneration && !firstJourneyGenerations.includes(savedGeneration) ? [...firstJourneyGenerations, savedGeneration] : firstJourneyGenerations;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trainer.trim() || !starter || saving) return;

    setSaving(true);
    setError('');
    try {
      await onSave({ trainer: trainer.trim(), starter, trainerSprite, gender }, mode);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'O navegador não conseguiu guardar a jornada.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{draft ? 'Sua jornada' : 'Nova jornada'}</DialogTitle>
        <DialogDescription>Escolha seu nome, sua aparência e seu primeiro Pokémon.</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="grid gap-5">
        <div className="grid gap-2">
          <label htmlFor="trainer-name" className="text-sm font-bold">Nome do treinador</label>
          <Input id="trainer-name" value={trainer} maxLength={24} autoComplete="off"
            placeholder="Digite seu nome" onChange={(event) => setTrainer(event.target.value)} required />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Gênero do treinador</legend>
          <div className="flex gap-3">
            {(['male', 'female'] as const).map((choice) => (
              <label key={choice} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <input type="radio" name="trainer-gender" checked={gender === choice} onChange={() => {
                  setGender(choice);
                  if (getTrainerSprite(trainerSprite)?.gender !== choice) setTrainerSprite(defaultSpriteByGender[choice]);
                }} />
                {choice === 'male' ? 'Menino' : 'Menina'}
              </label>
            ))}
          </div>
        </fieldset>
        <TrainerSpritePicker value={trainerSprite} gender={gender} onChange={setTrainerSprite} />
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Pokémon inicial</legend>
          <StarterPicker value={starter} onChange={setStarter} generations={generations} />
        </fieldset>
        {!draft && (
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Modo de jogo</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {gameModes.map((option) => (
                <label key={option.id} className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-accent">
                  <input type="radio" name="game-mode" className="mt-1" checked={mode === option.id} onChange={() => setMode(option.id)} />
                  <span><strong>{option.label}</strong><span className="block text-xs text-muted-foreground">{option.description}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={!trainer.trim() || !starter || saving}>{submitLabel}</Button>
      </form>
    </>
  );
}
