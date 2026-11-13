import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Pastas de recursos/ que o jogo pode pedir, com as extensões permitidas em cada uma. */
export const publicFolders: Record<string, readonly string[]> = {
  Pokemons: ['.png'], Shinys: ['.png'], Mapas: ['.png'], Arenas: ['.png'], Pokebolas: ['.png'], Itens: ['.png'], Treinadores: ['.png'], Sons: ['.mp3'],
};

const MIN_MUSIC_BYTES = 100_000;

export interface Track { file: string; title: string }

/** "03 - Pallet Town.mp3" → "Pallet Town". */
export function musicTitle(file: string): string {
  return path.basename(file, path.extname(file)).replace(/^\d+\s*-\s*/, '').trim();
}

function entries(dir: string): { name: string; size: number }[] {
  try {
    return readdirSync(dir).flatMap((name) => {
      try {
        const stat = statSync(path.join(dir, name));
        return stat.isFile() ? [{ name, size: stat.size }] : [];
      } catch { return []; }
    });
  } catch { return []; }
}

/** Músicas de recursos/Sons/Musicas (sem as vinhetas curtas). */
export function musicList(recursosDir: string): Track[] {
  return entries(path.join(recursosDir, 'Sons', 'Musicas'))
    .filter((entry) => entry.name.toLowerCase().endsWith('.mp3') && entry.size >= MIN_MUSIC_BYTES)
    .map((entry) => ({ file: entry.name, title: musicTitle(entry.name) }))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

export function pngList(recursosDir: string, folder: string): string[] {
  return entries(path.join(recursosDir, folder)).filter((entry) => entry.name.toLowerCase().endsWith('.png')).map((entry) => entry.name).sort();
}
