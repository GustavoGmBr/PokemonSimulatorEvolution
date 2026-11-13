import items from '../catalog/shop-items.json';

// Itens à venda na Loja (os mesmos do jogo antigo). Os preços já estão com o ajuste de economia do jogo antigo (+50%).
export const shopCategories = [
  { id: 'captura', label: 'Bolas' },
  { id: 'cura', label: 'Cura' },
  { id: 'evolucao', label: 'Evolução' },
  { id: 'mega', label: 'Mega' },
  { id: 'primal', label: 'Primal' },
  { id: 'ivs', label: 'IVs' },
  { id: 'buff', label: 'Amuletos' },
] as const;
export type ShopCategory = (typeof shopCategories)[number]['id'];

export type ShopItem = { name: string; displayName: string; category: ShopCategory; description: string; price: number };

export const shopItems: readonly ShopItem[] = items as ShopItem[];
const byName = new Map(shopItems.map((item) => [item.name, item]));

export function getShopItem(name: string) {
  return byName.get(name);
}
