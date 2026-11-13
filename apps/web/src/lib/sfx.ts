// Efeitos sonoros de recursos/Sons/Efeitos: música de abertura da batalha, captura e Pokémon brilhante.
import { duckRadio } from '@/lib/radio';
import { getSettings } from '@/lib/settings';

export const effects = {
  /** Música de abertura da batalha (~15 s). */
  battle: { file: 'pokemon-battle.mp3', duck: false },
  /** Fanfarra da captura (~5 s). */
  catching: { file: 'pokemon-catching.mp3', duck: true },
  /** Brilho de um Pokémon shiny que aparece (~1 s). */
  shiny: { file: 'shiny-pokemon.mp3', duck: true },
} as const;
export type EffectId = keyof typeof effects;

export const effectUrl = (id: EffectId) => `${import.meta.env.BASE_URL}recursos/Sons/Efeitos/${effects[id].file}`;

export type PlayingEffect = { stop: () => void; done: Promise<void> };
const none: PlayingEffect = { stop: () => {}, done: Promise.resolve() };

/**
 * Toca um efeito (se estiverem ligados em Opções). Efeitos curtos abaixam o rádio para 10% enquanto tocam.
 * `done` resolve ao terminar, ao parar ou se o navegador/arquivo não permitir o som; nunca rejeita.
 */
export function playEffect(id: EffectId): PlayingEffect {
  const { effectsEnabled, effectsVolume } = getSettings();
  if (!effectsEnabled || effectsVolume <= 0 || typeof Audio === 'undefined') return none;
  const audio = new Audio(effectUrl(id));
  audio.volume = effectsVolume;
  const release = effects[id].duck ? duckRadio() : () => {};
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => { finish = () => { release(); resolve(); }; });
  audio.addEventListener('ended', finish);
  audio.addEventListener('error', finish);
  audio.play().catch(finish); // som bloqueado até o primeiro clique/tecla: segue sem efeito
  return {
    stop: () => { audio.pause(); finish(); },
    done,
  };
}
