// Preferências do jogador, guardadas neste navegador (valem para todos os saves).
// "Reduzir animações" tem o seu próprio hook (use-motion-preference.ts).
import { useSyncExternalStore } from 'react';
import { gameStorage } from './game-storage.ts';

export const themes = [
  { id: 'auto', label: 'Automático', description: 'Segue o claro/escuro do sistema.', swatch: ['#f5f4eb', '#294429'] },
  { id: 'floresta', label: 'Floresta', description: 'O tema clássico, em verde.', swatch: ['#f5f4eb', '#294429'] },
  { id: 'oceano', label: 'Oceano', description: 'Claro, em tons de azul.', swatch: ['#ebf0f5', '#294a6b'] },
  { id: 'vulcao', label: 'Vulcão', description: 'Claro, em tons de vermelho.', swatch: ['#f5ede9', '#6b2e29'] },
  { id: 'eletrico', label: 'Elétrico', description: 'Claro, em tons de amarelo.', swatch: ['#f5f3e3', '#5c4a10'] },
  { id: 'noturno', label: 'Noturno', description: 'Escuro, para jogar de noite.', swatch: ['#161d17', '#a9c875'] },
] as const;
export type ThemeId = (typeof themes)[number]['id'];

export const textSpeeds = [
  { id: 'slow', label: 'Lenta', cps: 28 },
  { id: 'normal', label: 'Normal', cps: 60 },
  { id: 'fast', label: 'Rápida', cps: 130 },
  { id: 'instant', label: 'Instantânea', cps: Infinity },
] as const;
export type TextSpeedId = (typeof textSpeeds)[number]['id'];

export const animationSpeeds = [
  { id: 'slow', label: 'Lenta', factor: 0.6 },
  { id: 'normal', label: 'Normal', factor: 1 },
  { id: 'fast', label: 'Rápida', factor: 1.6 },
  { id: 'faster', label: 'Muito rápida', factor: 2.5 },
] as const;
export type AnimationSpeedId = (typeof animationSpeeds)[number]['id'];

export type Settings = {
  theme: ThemeId;
  textSpeed: TextSpeedId;
  animationSpeed: AnimationSpeedId;
  radioEnabled: boolean;
  /** 0 a 1, em passos de 5%. */
  radioVolume: number;
  videoEnabled: boolean;
  /** Efeitos sonoros (música de abertura da batalha, captura, shiny). */
  effectsEnabled: boolean;
  /** 0 a 1, em passos de 5%. */
  effectsVolume: number;
  /** Auto-batalha: o jogo escolhe o golpe de cada turno (e quem entra quando um Pokémon cai). */
  autoBattle: boolean;
};

export const defaultSettings: Settings = {
  theme: 'auto', textSpeed: 'normal', animationSpeed: 'normal', radioEnabled: false, radioVolume: 0.5, videoEnabled: false, effectsEnabled: true, effectsVolume: 0.7, autoBattle: false,
};

const storageKey = 'pokesim-evolution:settings';
const changeEvent = 'pokesim-settings';

function pick<T extends { id: string }>(options: readonly T[], value: unknown, fallback: T['id']): T['id'] {
  return options.some((option) => option.id === value) ? (value as T['id']) : fallback;
}

/** Lê o que foi guardado; qualquer campo ausente ou inválido volta ao padrão. */
export function readSettings(raw: string | null): Settings {
  if (!raw) return defaultSettings;
  try {
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== 'object' || saved === null) return defaultSettings;
    const value = saved as Record<string, unknown>;
    const level = (raw: unknown, fallback: number) => Math.round(Math.min(1, Math.max(0, typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback)) * 20) / 20;
    return {
      theme: pick(themes, value.theme, defaultSettings.theme),
      textSpeed: pick(textSpeeds, value.textSpeed, defaultSettings.textSpeed),
      animationSpeed: pick(animationSpeeds, value.animationSpeed, defaultSettings.animationSpeed),
      radioEnabled: value.radioEnabled === true,
      radioVolume: level(value.radioVolume, defaultSettings.radioVolume),
      videoEnabled: value.videoEnabled === true,
      effectsEnabled: value.effectsEnabled !== false,
      effectsVolume: level(value.effectsVolume, defaultSettings.effectsVolume),
      autoBattle: value.autoBattle === true,
    };
  } catch {
    return defaultSettings;
  }
}

let snapshot: Settings | null = null;
let snapshotRaw: string | null = null;

function rawSettings() {
  try { return gameStorage.getItem(storageKey); } catch { return null; }
}

export function getSettings(): Settings {
  const raw = rawSettings();
  if (snapshot === null || raw !== snapshotRaw) { snapshot = readSettings(raw); snapshotRaw = raw; }
  return snapshot;
}

export function updateSettings(patch: Partial<Settings>) {
  const next = readSettings(JSON.stringify({ ...getSettings(), ...patch }));
  try { gameStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* sem armazenamento: vale só nesta sessão */ }
  snapshot = next;
  snapshotRaw = rawSettings();
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  window.addEventListener('storage', listener);
  return () => { window.removeEventListener(changeEvent, listener); window.removeEventListener('storage', listener); };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, () => defaultSettings);
}

export const textSpeedOf = (id: TextSpeedId) => textSpeeds.find((speed) => speed.id === id)!;
export const animationFactorOf = (id: AnimationSpeedId) => animationSpeeds.find((speed) => speed.id === id)!.factor;

// ---------- Efeitos na página (tema e velocidade de animações) ----------

/** O tema que vale agora: "auto" vira Noturno ou Floresta conforme o sistema. */
export function resolveTheme(theme: ThemeId, systemDark: boolean): Exclude<ThemeId, 'auto'> {
  return theme === 'auto' ? (systemDark ? 'noturno' : 'floresta') : theme;
}

/** Aplica o tema e a velocidade de animações no <html> e acompanha mudanças; chame uma vez ao iniciar. */
export function startSettingsEffects() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  const apply = () => {
    const { theme, animationSpeed } = getSettings();
    const resolved = resolveTheme(theme, media.matches);
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved === 'noturno' ? 'dark' : 'light';
    root.style.setProperty('--anim-speed', String(animationFactorOf(animationSpeed)));
  };
  apply();
  window.addEventListener(changeEvent, apply);
  window.addEventListener('storage', apply);
  media.addEventListener('change', apply);
  return () => {
    window.removeEventListener(changeEvent, apply);
    window.removeEventListener('storage', apply);
    media.removeEventListener('change', apply);
  };
}
