// Os 9 mapas de selvagens. A ordem importa: quando um tipo aparece em mais de um mapa, vale o primeiro.
export const wildMaps = [
  { id: 'campina', name: 'Campina', types: ['normal', 'flying'], description: 'Campo aberto com grama baixa, trilhas de terra, cercas e um celeiro.' },
  { id: 'floresta', name: 'Floresta', types: ['grass', 'bug'], description: 'Mata fechada com clareiras, troncos caídos, cogumelos e flores.' },
  { id: 'litoral', name: 'Litoral', types: ['water'], description: 'Praia com ondas, rochas na maré, um píer de madeira e uma ilhota.' },
  { id: 'vulcao', name: 'Vulcão', types: ['fire', 'ground', 'rock'], description: 'Cratera de lava, chão de cinza, fissuras brilhantes e cânions secos.' },
  { id: 'caverna', name: 'Caverna e mina', types: ['rock', 'steel', 'ground'], description: 'Túneis escuros com trilhos de carrinho, vigas, cristais e veios de metal.' },
  { id: 'pantano', name: 'Pântano sombrio', types: ['poison', 'ghost', 'dark'], description: 'Água turva, árvores tortas e névoa, com um cemitério e uma capela em ruínas.' },
  { id: 'tecnologico', name: 'Complexo tecnológico', types: ['electric', 'steel', 'psychic'], description: 'Laboratório e usina com postes de energia, painéis e cabos pelo chão.' },
  { id: 'pico', name: 'Pico nevado', types: ['ice', 'fighting'], description: 'Cume com neve, pinheiros cobertos, caverna de gelo e um dojo ao ar livre.' },
  { id: 'santuario', name: 'Santuário místico', types: ['dragon', 'fairy', 'psychic'], description: 'Clareira com cogumelos gigantes que brilham, lago cristalino e um altar de pedra.' },
] as const;

export type WildMapId = (typeof wildMaps)[number]['id'];

export const wildMapIds: readonly string[] = wildMaps.map((map) => map.id);

export function getWildMap(id: WildMapId) {
  return wildMaps.find((map) => map.id === id)!;
}

// A região de uma espécie é a geração dela.
export const regionNames = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'] as const;
