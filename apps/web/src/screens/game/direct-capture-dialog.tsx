import { Sparkles } from 'lucide-react';
import { getBattleItem } from '@pokesim-evolution/data/battle-data';
import { getPokemon } from '@pokesim-evolution/data/pokedex';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { GameState } from '@/lib/game-state';
import { ivQuality, starText } from '@/lib/ivs';
import { battleBag, directCaptureOdds } from '@/lib/battle/session';
import type { WildEncounter } from '@/lib/wild';
import { GameSprite } from './pokedex-media';
import '@/styles/iv.css';

/**
 * Captura direta: só escolhe a bola da mochila. Quem arremessa e anima é a tela do mapa,
 * e o resultado aparece na própria animação (sem mensagem).
 */
export default function DirectCaptureDialog({ encounter, game, onThrow, onClose }: {
  encounter: WildEncounter;
  game: GameState;
  onThrow: (ball: string) => void;
  onClose: () => void;
}) {
  const entry = getPokemon(encounter.species);
  const name = entry?.displayName ?? `Espécie ${encounter.species}`;
  const quality = ivQuality(encounter.ivs);
  const balls = battleBag(game.progress.bag, 'wild').balls;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm" onOpenAutoFocus={(event) => { if (balls.length > 0) return; event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {name} · Nv {encounter.level}
            {encounter.shiny && <span className="wild-shiny"><Sparkles aria-hidden="true" /> Brilhante</span>}
          </DialogTitle>
          <DialogDescription>
            Captura direta: sem batalha, uma única tentativa. Se o Pokémon escapar, ele some do mapa.
          </DialogDescription>
        </DialogHeader>

        <div className="wild-dialog-body">
          {entry && <GameSprite sprite={entry.sprite} shiny={encounter.shiny} label={name} className="wild-dialog-sprite" />}
          {quality.stars > 0 && (
            <p className="wild-iv" data-stars={quality.stars}>
              <span className="wild-stars" role="img" aria-label={`${quality.stars} de 4 estrelas`}>{starText(quality.stars)}</span>
              <span>{quality.label} · IVs {quality.percentage}%</span>
            </p>
          )}
        </div>

        <>
            {balls.length === 0 ? (
              <p role="status" className="text-sm text-muted-foreground">Você não tem Poké Bolas na mochila.</p>
            ) : (
              <div className="grid gap-2" role="group" aria-label="Escolha a Poké Bola">
                {balls.map((ball) => {
                  const odds = directCaptureOdds(encounter, ball.name, game.collection.team);
                  return (
                    <Button key={ball.name} variant="outline" className="h-auto justify-between py-2 text-left" onClick={() => onThrow(ball.name)}>
                      <span className="min-w-0">
                        <strong className="block">{ball.displayName}</strong>
                        <span className="block whitespace-normal text-xs font-normal text-muted-foreground">{getBattleItem(ball.name)?.description}</span>
                      </span>
                      <span className="text-right text-sm"><b>{odds >= 1 ? '100%' : `${Math.max(1, Math.round(odds * 100))}%`}</b><br /><small>×{ball.quantity}</small></span>
                    </Button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Cancelar</Button></div>
        </>
      </DialogContent>
    </Dialog>
  );
}
