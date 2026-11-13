import { useState, type ReactElement } from 'react';
import { Check, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TrainerSpritePreview } from '@/components/sprite-preview';
import { defaultSpriteByGender, getTrainerSprite, trainerSprites, type TrainerGender } from '@/lib/trainer-sprites';

export function TrainerSpritePicker({ value, gender, onChange, trigger, includeUnclassified = true }: {
  value: string;
  gender: TrainerGender;
  onChange: (id: string) => void;
  trigger?: ReactElement;
  includeUnclassified?: boolean;
}) {
  const [query, setQuery] = useState('');
  const selected = getTrainerSprite(value) ?? getTrainerSprite(defaultSpriteByGender[gender]);
  const words = query.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/\.png\s*$/, '').split(/[\s_-]+/).filter(Boolean);
  const matches = trainerSprites.filter((sprite) => (sprite.gender === gender || (includeUnclassified && sprite.gender === null)) &&
    words.every((word) => sprite.id.toLowerCase().includes(word)));

  return (
    <Dialog onOpenChange={(open) => { if (open) setQuery(''); }}>
      <DialogTrigger asChild>
        {trigger ?? <Button type="button" variant="outline" className="h-auto w-full justify-start gap-3 p-2 text-left">
          {selected && <TrainerSpritePreview sprite={selected} />}
          <span className="min-w-0 flex-1 whitespace-normal">
            <span className="block text-xs text-muted-foreground">Sprite do jogador</span>
            <strong>{selected?.label ?? 'Escolher sprite'}</strong>
          </span>
          <ChevronRight aria-hidden="true" className="mr-1" />
        </Button>}
      </DialogTrigger>
      <DialogContent className="h-[min(36rem,calc(100dvh-2rem))] grid-rows-[auto_auto_minmax(0,1fr)] sm:max-w-xl"
        onOpenAutoFocus={(event) => {
          const input = event.currentTarget instanceof HTMLElement
            ? event.currentTarget.querySelector<HTMLInputElement>('input[type="search"]') : null;
          if (input) {
            event.preventDefault();
            input.focus();
          }
        }}>
        <DialogHeader>
          <DialogTitle>Sprite do jogador</DialogTitle>
          <DialogDescription>Escolha a aparência do seu treinador.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label htmlFor="trainer-sprite-search" className="sr-only">Pesquisar sprites</label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="trainer-sprite-search" type="search" className="pl-9" value={query}
              placeholder="Pesquisar por nome ou arquivo" onChange={(event) => setQuery(event.target.value)} />
          </div>
          <p role="status" className="text-xs text-muted-foreground">
            {matches.length === 1 ? '1 sprite encontrado' : `${matches.length} sprites encontrados`}
          </p>
        </div>
        <div className="min-h-0 overflow-y-auto p-1">
          {matches.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum sprite corresponde à busca.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 sm:grid-cols-4">
              {matches.map((sprite) => (
                <li key={sprite.id}>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" title={`${sprite.id}.png`}
                      aria-pressed={selected?.id === sprite.id} onClick={() => onChange(sprite.id)}
                      className="relative h-full min-h-24 w-full flex-col gap-1 px-1 py-2 whitespace-normal aria-pressed:border-primary aria-pressed:bg-secondary">
                      {selected?.id === sprite.id && <Check aria-hidden="true" className="absolute top-1 right-1 text-primary" />}
                      <TrainerSpritePreview sprite={sprite} lazy />
                      <span className="text-xs leading-tight">{sprite.label}</span>
                    </Button>
                  </DialogClose>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
