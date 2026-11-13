// Rádio do jogo: toca, em ordem aleatória, as músicas de recursos/Sons/Musicas (ligada em Opções).
import { useSyncExternalStore } from 'react';
import { getSettings } from '@/lib/settings';
import { pickTrack } from '@/lib/radio-order';

export type RadioTrack = { file: string; title: string };
export type RadioStatus = {
  /** Há músicas na pasta? */
  available: boolean;
  /** Tocando de fato (o navegador pode segurar o som até o primeiro clique ou tecla). */
  playing: boolean;
  /** O navegador bloqueou o som automático: toca assim que o jogador interagir com a página. */
  waiting: boolean;
  title: string | null;
};

/** Músicas de recursos/Sons/Musicas (sem as vinhetas curtas): a lista vem do vite (dev) ou do launcher ao iniciar. */
let radioTracks: readonly RadioTrack[] = [];

export const radioTrackUrl = `${import.meta.env.BASE_URL}recursos/Sons/Musicas`;

async function loadTracks() {
  try {
    const response = await fetch(`${radioTrackUrl}/lista.json`, { cache: 'no-cache' });
    const list: unknown = response.ok ? await response.json() : [];
    radioTracks = Array.isArray(list)
      ? list.filter((item): item is RadioTrack => typeof item === 'object' && item !== null && typeof (item as RadioTrack).file === 'string' && typeof (item as RadioTrack).title === 'string')
      : [];
  } catch {
    radioTracks = [];
  }
  publish({ available: radioTracks.length > 0 });
  sync();
}

export const trackUrl = (track: RadioTrack) => `${radioTrackUrl}/${encodeURIComponent(track.file)}`;

const changeEvent = 'pokesim-radio';
let status: RadioStatus = { available: false, playing: false, waiting: false, title: null };
let audio: HTMLAudioElement | null = null;
let current: number | null = null;

function publish(patch: Partial<RadioStatus>) {
  status = { ...status, ...patch };
  window.dispatchEvent(new Event(changeEvent));
}

function startTrack(index: number) {
  if (!audio) return;
  const track = radioTracks[index];
  if (!track) return;
  current = index;
  audio.src = trackUrl(track);
  publish({ title: track.title });
  void play();
}

async function play() {
  if (!audio) return;
  try {
    await audio.play();
    publish({ playing: true, waiting: false });
  } catch {
    publish({ playing: false, waiting: getSettings().radioEnabled });
  }
}

/** Pula para outra faixa (botão "Próxima" em Opções). */
export function nextTrack() {
  if (!audio || !getSettings().radioEnabled) return;
  startTrack(pickTrack(radioTracks.length, current));
}

function sync() {
  const { radioEnabled, radioVolume } = getSettings();
  if (!radioEnabled || radioTracks.length === 0) {
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; current = null; }
    publish({ playing: false, waiting: false, title: null });
    return;
  }
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', () => startTrack(pickTrack(radioTracks.length, current)));
    audio.addEventListener('error', () => { if (audio) window.setTimeout(() => startTrack(pickTrack(radioTracks.length, current)), 1000); });
    audio.volume = radioVolume;
    startTrack(pickTrack(radioTracks.length, null));
    return;
  }
  audio.volume = radioVolume;
  if (audio.paused && !status.playing) void play();
}

/** Liga o rádio ao que está salvo em Opções; chame uma vez ao iniciar. */
export function startRadio() {
  const unlock = () => { if (status.waiting) void play(); };
  window.addEventListener('pokesim-settings', sync);
  window.addEventListener('storage', sync);
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  void loadTracks();
  return () => {
    window.removeEventListener('pokesim-settings', sync);
    window.removeEventListener('storage', sync);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    audio?.pause();
    audio = null;
    current = null;
  };
}

function subscribe(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  return () => window.removeEventListener(changeEvent, listener);
}

export function useRadio(): RadioStatus {
  return useSyncExternalStore(subscribe, () => status, () => status);
}
