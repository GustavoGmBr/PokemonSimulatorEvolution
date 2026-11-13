import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(serverRoot, '../..');

function fromRepo(value: string | undefined, fallback: string): string {
  return path.resolve(repoRoot, value && value.trim() ? value : fallback);
}

/**
 * Pacote do Windows: o inicializador define POKESIM_HOME com a pasta de instalação
 * (saves em <pasta>/saves, imagens e músicas em <pasta>/recursos, interface em <pasta>/app/web).
 * Sem POKESIM_HOME o servidor roda a partir do repositório.
 */
const home = process.env.POKESIM_HOME?.trim() ? path.resolve(process.env.POKESIM_HOME) : undefined;

export const config = {
  host: '127.0.0.1',
  // A mesma porta do Pokémon Simulator Remake; o navegador guarda preferências por endereço.
  port: Number(process.env.POKESIM_PORT ?? 34600),
  dbPath: process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : home ? path.join(home, 'saves/game.db') : fromRepo(undefined, 'apps/server/data/game.db'),
  recursosDir: process.env.RECURSOS_DIR ? path.resolve(process.env.RECURSOS_DIR) : home ? path.join(home, 'recursos') : fromRepo(undefined, 'recursos'),
  webDist: process.env.WEB_DIST ? path.resolve(process.env.WEB_DIST) : home ? path.join(home, 'app/web') : fromRepo(undefined, 'apps/web/dist'),
  /** versão exibida no console e usada pelo atualizador */
  version: process.env.POKESIM_VERSION ?? 'dev',
};
