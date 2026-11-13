import {
  Backpack, BookOpen, CircleHelp, Coins, Compass, Crosshair, Gamepad2, House, IdCard, ListChecks, Medal, Monitor,
  PawPrint, Search, Settings2, ShoppingBag, Skull, Store, Swords, Trophy, Users,
  type LucideIcon,
} from 'lucide-react';

import { registerShortcutDefaults, shortcutKey } from '@/lib/controls';

type Area = { id: string; label: string; key: string; icon: LucideIcon; description: string };

/** A tecla de cada atalho vem de Opções → Controles: `key` é lida na hora, então reflete a troca sem recarregar. */
function withConfigurableKey<T extends { id: string; key: string }>(items: readonly T[], scope: string): T[] {
  return items.map((item) => Object.defineProperty({ ...item }, 'key', { enumerable: true, get: () => shortcutKey(`${scope}:${item.id}`) }));
}

const defaultAreas = [
  { id: 'mochila', label: 'Mochila', key: 'N', icon: Backpack, description: 'Consulte seus itens por categoria e use recursos de treinamento.' },
  { id: 'equipes', label: 'Equipes salvas', key: 'Q', icon: Users, description: 'Crie formações e alterne a equipe ativa.' },
  { id: 'inicio', label: 'Início', key: 'I', icon: House, description: 'Acompanhe sua jornada em Kanto.' },
  { id: 'treinadores', label: 'Treinadores', key: 'D', icon: Users, description: 'Desafie treinadores e vença batalhas por recompensas.' },
  { id: 'ginasios', label: 'Ginásios', key: 'Y', icon: Medal, description: 'Enfrente líderes de ginásio, a Elite dos 4 e campeões.' },
  { id: 'selvagens', label: 'Selvagens', key: 'G', icon: Compass, description: 'Explore habitats e encontre Pokémon selvagens.' },
  { id: 'torneios', label: 'Torneios', key: 'O', icon: Trophy, description: 'Inscreva sua equipe em competições eliminatórias.' },
  { id: 'chefes', label: 'Chefes', key: 'H', icon: Skull, description: 'Enfrente adversários especiais e dispute recompensas.' },
  { id: 'pokedex', label: 'Pokédex', key: 'P', icon: BookOpen, description: 'Consulte espécies, formas e evoluções da Pokédex Nacional.' },
  { id: 'equipe', label: 'Equipe', key: 'E', icon: Crosshair, description: 'Veja os Pokémon que viajam com você.' },
  { id: 'pc', label: 'PC', key: 'S', icon: Monitor, description: 'Organize os Pokémon da sua coleção em caixas.' },
  { id: 'loja', label: 'Loja', key: 'L', icon: ShoppingBag, description: 'Compre Poké Bolas, poções, pedras, essências e amuletos.' },
  { id: 'mercado', label: 'Mercado', key: 'R', icon: Store, description: 'Compre Pokémon prontos e venda os da sua coleção.' },
  { id: 'cassino', label: 'Cassino', key: 'J', icon: Gamepad2, description: 'Encontre minijogos e prêmios.' },
  { id: 'opcoes', label: 'Opções', key: ',', icon: Settings2, description: 'Ajuste a apresentação e o modo de exibição do jogo.' },
  { id: 'treinador', label: 'Treinador', key: 'U', icon: IdCard, description: 'Consulte o cartão de informações do seu treinador.' },
  { id: 'missoes', label: 'Missões', key: 'M', icon: ListChecks, description: 'Acompanhe seus objetivos e recompensas.' },
  { id: 'atalhos', label: 'Atalhos', key: 'A', icon: CircleHelp, description: 'Consulte os controles e atalhos de todas as áreas.' },
] as const satisfies readonly Area[];

export const gameAreas = withConfigurableKey(defaultAreas, 'area') as unknown as typeof defaultAreas;

export type GameAreaId = (typeof defaultAreas)[number]['id'];
export const overviewId = 'inicio' satisfies GameAreaId;

export function getArea(id: GameAreaId) {
  return gameAreas.find((area) => area.id === id)!;
}

type Section = { id: string; label: string; icon: LucideIcon; areas: readonly GameAreaId[] };

// Menu lateral: cada seção abre um submenu com suas áreas. "perfil" fica no rodapé, com a foto do treinador.
export const menuSections = [
  { id: 'batalhas', label: 'Batalhas', icon: Swords, areas: ['treinadores', 'ginasios', 'selvagens', 'torneios', 'chefes'] },
  { id: 'pokemons', label: 'Pokémons', icon: PawPrint, areas: ['pokedex', 'equipe', 'equipes', 'pc'] },
  { id: 'comercio', label: 'Comércio', icon: Coins, areas: ['mochila', 'loja', 'mercado', 'cassino'] },
  { id: 'perfil', label: 'Perfil', icon: IdCard, areas: ['opcoes', 'treinador', 'missoes'] },
] as const satisfies readonly Section[];

export const profileSection = menuSections.find(({ id }) => id === 'perfil')!;

export function sectionOf(area: GameAreaId): Section | undefined {
  return menuSections.find((section) => (section.areas as readonly GameAreaId[]).includes(area));
}

// Agrupamento usado pela busca (Ctrl+K) e pela lista de atalhos.
export const areaGroups: readonly { label: string; areas: readonly (typeof gameAreas)[number][] }[] = [
  { label: 'Jornada', areas: [getArea('inicio')] },
  ...menuSections.map((section) => ({ label: section.label, areas: section.areas.map(getArea) })),
  { label: 'Ajuda', areas: [getArea('atalhos')] },
];

// Todos os atalhos do jogo usam Ctrl (⌘ no Mac) + tecla, para não disputar as teclas de jogar (WASD, E, Shift…) nem a digitação.
// Ficam de fora as combinações que o navegador reserva e a página não consegue interceptar (Ctrl+T, Ctrl+N, Ctrl+W)
// e as de copiar/colar/desfazer (Ctrl+C, V, X em texto, Z), por isso algumas letras não seguem a inicial do nome.
const defaultActions = {
  command: { label: 'Buscar no menu', icon: Search, key: 'K' },
  sidebar: { label: 'Alternar menu lateral', key: 'B' },
  fullscreen: { label: 'Alternar tela cheia', key: 'F' },
  motion: { label: 'Alternar redução de animações', key: '.' },
  exit: { label: 'Desconectar', key: 'X' },
  back: { label: 'Voltar à configuração do mapa', key: 'Backspace' },
  confirm: { label: 'Procurar mapa (na configuração)', key: 'Enter' },
} as const;

export const gameActions = Object.fromEntries(
  Object.entries(defaultActions).map(([id, action]) => [id, Object.defineProperty({ ...action }, 'key', { enumerable: true, get: () => shortcutKey(`action:${id}`) })]),
) as unknown as typeof defaultActions;

/** Atalhos padrão (id → tecla): áreas "area:<id>" e ações "action:<id>"; a lista que Opções → Controles permite trocar. */
export const shortcutDefaults: Record<string, string> = {
  ...Object.fromEntries(defaultAreas.map((area) => [`area:${area.id}`, area.key])),
  ...Object.fromEntries(Object.entries(defaultActions).map(([id, action]) => [`action:${id}`, action.key])),
};
registerShortcutDefaults(shortcutDefaults);

const keyNames: Record<string, string> = { backspace: 'Backspace', enter: 'Enter' };

export { defaultActions, defaultAreas };

/** Texto do atalho para mostrar na tela: "Ctrl I", "Ctrl ,", "Ctrl Backspace". */
export function shortcutLabel(key: string) {
  return `Ctrl ${keyNames[key.toLowerCase()] ?? key.toUpperCase()}`;
}

/** Valor de aria-keyshortcuts para o atalho (Control e Meta). */
export function shortcutAria(key: string) {
  const name = keyNames[key.toLowerCase()] ?? key.toUpperCase();
  return `Control+${name} Meta+${name}`;
}

/** O atalho pressionado (com Ctrl/⌘) corresponde a esta tecla? */
export function matchesShortcut(event: { key: string }, key: string) {
  return event.key.toLowerCase() === key.toLowerCase();
}

export function gameUrl(saveId: string, area: GameAreaId = overviewId, pokemonId?: number) {
  const detail = area === 'pokedex' && pokemonId !== undefined ? `/${pokemonId}` : '';
  return `#/jornada/${encodeURIComponent(saveId)}/${area}${detail}`;
}

// Endereços de versões anteriores do menu continuam abrindo a área equivalente.
const legacyAreas: Record<string, GameAreaId> = { batalhas: 'treinadores', pokecassino: 'cassino', itens: 'mochila' };

export function readGameUrl(hash: string) {
  const route = /^#\/jornada\/([^/]+)(?:\/([^/]+)(?:\/(\d+))?)?$/.exec(hash);
  if (!route?.[1]) return null;

  try {
    const area = gameAreas.find(({ id }) => id === (legacyAreas[route[2] ?? ''] ?? route[2]))?.id ?? overviewId;
    return {
      saveId: decodeURIComponent(route[1]),
      area,
      pokemonId: area === 'pokedex' && route[3] ? Number(route[3]) : undefined,
    };
  } catch {
    return null;
  }
}
