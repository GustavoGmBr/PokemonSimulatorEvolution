// Loja de itens: carrinho, limites e compra. Os itens e preços são os do jogo antigo (packages/data/catalog/shop-items.json).
import { getShopItem } from '@pokesim-evolution/data/shop-items';
import { MAX_STACK, PREMIER_BALL, PREMIER_EVERY, UNIQUE_ITEMS } from './battle/items';
import type { GameUpdate } from './game-state';
import type { Bag } from './journey-saves';

/** Itens e quantidades escolhidos para comprar (pelo nome do item). */
export type Cart = Record<string, number>;

/** Quantos de um item cabem na mochila: amuletos e afins, só um; o resto, até 99. */
export const itemLimit = (name: string) => (UNIQUE_ITEMS.has(name) ? 1 : MAX_STACK);

export function cartLines(cart: Cart) {
  return Object.entries(cart).flatMap(([name, quantity]) => {
    const item = getShopItem(name);
    return item && quantity > 0 ? [{ item, quantity }] : [];
  });
}

export const cartCount = (cart: Cart) => cartLines(cart).reduce((sum, line) => sum + line.quantity, 0);
export const cartTotal = (cart: Cart) => cartLines(cart).reduce((sum, line) => sum + line.item.price * line.quantity, 0);

/** Bolas Premier de brinde: uma a cada 10 Poké Bolas compradas de uma vez (respeitando o limite da mochila). */
export function premierGift(cart: Cart, bag: Bag) {
  return Math.min(Math.floor((cart['poke-ball'] ?? 0) / PREMIER_EVERY), Math.max(0, MAX_STACK - (bag[PREMIER_BALL] ?? 0)));
}

/** Compra o carrinho inteiro: ou tudo passa, ou nada. */
export function buyCart(cart: Cart): GameUpdate {
  return (state) => {
    const lines = cartLines(cart);
    if (lines.length === 0) return 'O carrinho está vazio.';
    const bag: Bag = { ...state.progress.bag };
    let total = 0;
    for (const { item, quantity } of lines) {
      if (!Number.isSafeInteger(quantity) || quantity < 1) return 'Quantidade inválida.';
      if ((bag[item.name] ?? 0) + quantity > itemLimit(item.name)) {
        return UNIQUE_ITEMS.has(item.name) ? `${item.displayName}: só é possível ter um.` : `${item.displayName}: máximo de ${MAX_STACK} na mochila.`;
      }
      bag[item.name] = (bag[item.name] ?? 0) + quantity;
      total += item.price * quantity;
    }
    if (total > state.progress.money) return 'Dinheiro insuficiente.';
    const gift = premierGift(cart, state.progress.bag);
    if (gift > 0) bag[PREMIER_BALL] = (bag[PREMIER_BALL] ?? 0) + gift;
    return { ...state, progress: { ...state.progress, money: state.progress.money - total, bag } };
  };
}
