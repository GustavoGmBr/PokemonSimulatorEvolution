import { useMemo, useState } from 'react';
import { Minus, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { shopCategories, shopItems, type ShopCategory, type ShopItem } from '@pokesim-evolution/data/shop-items';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ItemIcon } from '@/components/item-icon';
import type { ChangeGame, GameState } from '@/lib/game-state';
import { buyCart, cartCount, cartLines, cartTotal, itemLimit, premierGift, type Cart } from '@/lib/shop';
import { PREMIER_BALL, PREMIER_EVERY } from '@/lib/battle/items';
import { formatMoney } from './trainer-card';
import '@/styles/shop.css';

const quickAmounts = [1, 5, 10] as const;
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

type Props = { game: GameState; change: ChangeGame };

/** Loja de itens: os mesmos produtos do jogo antigo, com carrinho. As compras valem tudo ou nada. */
export default function ShopScreen({ game, change }: Props) {
  const { money, bag } = game.progress;
  const [category, setCategory] = useState<ShopCategory>('captura');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Cart>({});
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('Escolha os produtos para montar o carrinho.');

  const total = cartTotal(cart);
  const count = cartCount(cart);
  const lines = cartLines(cart);
  const gift = premierGift(cart, bag);
  const needle = normalize(query);
  const visible = useMemo(() => shopItems.filter((item) =>
    needle ? normalize(`${item.displayName} ${item.description}`).includes(needle) : item.category === category), [category, needle]);
  const perCategory = (id: ShopCategory) => Object.entries(cart).reduce((sum, [name, quantity]) =>
    sum + (shopItems.find((item) => item.name === name)?.category === id ? quantity : 0), 0);

  function available(item: ShopItem) {
    return Math.max(0, itemLimit(item.name) - (bag[item.name] ?? 0) - (cart[item.name] ?? 0));
  }

  function add(item: ShopItem, amount: number) {
    const room = available(item);
    if (amount > 0 && room === 0) { setMessage(`${item.displayName}: limite da mochila atingido.`); return; }
    const delta = amount > 0 ? Math.min(amount, room) : Math.max(amount, -(cart[item.name] ?? 0));
    if (delta === 0) return;
    const next = { ...cart, [item.name]: (cart[item.name] ?? 0) + delta };
    if (next[item.name] === 0) delete next[item.name];
    setCart(next);
    setConfirming(false);
    setMessage(delta > 0 ? `${delta}× ${item.displayName} no carrinho.` : `${-delta}× ${item.displayName} fora do carrinho.`);
  }

  function pay() {
    const spent = total;
    const problem = change(buyCart(cart));
    setConfirming(false);
    if (problem) { setMessage(problem); return; }
    setCart({});
    setMessage(`Compra feita! Você gastou ${formatMoney(spent)}.${gift > 0 ? ` Ganhou ${gift}× Bola Premier de brinde!` : ''} Volte sempre!`);
  }

  return (
    <div className="shop">
      <section className="game-panel shop-catalog" aria-label="Produtos">
        <div className="shop-tabs" role="tablist" aria-label="Categorias">
          {shopCategories.map((entry) => {
            const inCart = perCategory(entry.id);
            return (
              <button key={entry.id} type="button" role="tab" aria-selected={!needle && entry.id === category}
                onClick={() => { setQuery(''); setCategory(entry.id); }}>
                {entry.label}{inCart > 0 && <span className="shop-badge">{inCart}</span>}
              </button>
            );
          })}
        </div>
        <label className="shop-search">
          <Search aria-hidden="true" />
          <Input type="search" aria-label="Buscar produto" placeholder="Buscar em todos os produtos…" value={query}
            onChange={(event) => setQuery(event.target.value)} />
        </label>

        {visible.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>}
        <ul className="shop-grid">
          {visible.map((item) => {
            const quantity = cart[item.name] ?? 0;
            const owned = bag[item.name] ?? 0;
            const room = available(item);
            return (
              <li key={item.name} className="shop-item" data-in-cart={quantity > 0}>
                <div className="shop-item-head">
                  <ItemIcon item={item.name} size={40} />
                  <div className="min-w-0">
                    <strong className="block truncate">{item.displayName}</strong>
                    <span className="shop-price">{formatMoney(item.price)}</span>
                  </div>
                </div>
                <p className="shop-desc">{item.description}</p>
                <div className="shop-stock">
                  <span>{owned >= itemLimit(item.name) ? 'Limite na mochila' : `Na mochila: ${owned}`}</span>
                  <b>No carrinho: {quantity}</b>
                </div>
                <div className="shop-controls" role="group" aria-label={`Quantidade de ${item.displayName}`}>
                  <Button variant="outline" size="icon-sm" aria-label={`Tirar 1× ${item.displayName}`} disabled={quantity === 0}
                    onClick={() => add(item, -1)}><Minus /></Button>
                  {quickAmounts.map((amount) => (
                    <Button key={amount} variant="outline" size="sm" className="px-2.5" aria-label={`Adicionar ${amount}× ${item.displayName}`}
                      disabled={room === 0} onClick={() => add(item, amount)}>+{amount}</Button>
                  ))}
                  <Button variant="outline" size="sm" className="px-2.5" disabled={room <= 1} onClick={() => add(item, room)}>Máx</Button>
                </div>
              </li>
            );
          })}
        </ul>
        {category === 'captura' && !needle && (
          <p className="text-xs text-muted-foreground">A cada {PREMIER_EVERY} Poké Bolas compradas de uma vez, você ganha uma Bola Premier de brinde.</p>
        )}
      </section>

      <aside className="game-panel shop-cart" aria-label="Carrinho">
        <div className="game-panel-heading">
          <h2><ShoppingCart className="inline size-5" aria-hidden="true" /> Carrinho</h2>
          <span className="text-sm text-muted-foreground">{count} {count === 1 ? 'unidade' : 'unidades'}</span>
        </div>
        {lines.length === 0 ? <p className="text-sm text-muted-foreground">Vazio. Escolha uma quantidade nos produtos.</p> : (
          <ul className="shop-lines">
            {lines.map(({ item, quantity }) => (
              <li key={item.name}>
                <ItemIcon item={item.name} size={28} />
                <span className="min-w-0 truncate">{item.displayName} <b>×{quantity}</b></span>
                <strong>{formatMoney(item.price * quantity)}</strong>
              </li>
            ))}
            {gift > 0 && (
              <li className="shop-gift"><ItemIcon item={PREMIER_BALL} size={28} /><span>Bola Premier <b>×{gift}</b> (brinde)</span><strong>grátis</strong></li>
            )}
          </ul>
        )}
        <dl className="shop-sums">
          <div><dt>Total</dt><dd data-short={total > money}>{formatMoney(total)}</dd></div>
          <div><dt>Seu dinheiro</dt><dd>{formatMoney(money)}</dd></div>
          <div><dt>Saldo depois</dt><dd data-short={money - total < 0}>{formatMoney(money - total)}</dd></div>
        </dl>
        {confirming ? (
          <div className="pc-confirm" role="alertdialog" aria-label="Confirmar compra">
            <span>Pagar {formatMoney(total)}?</span>
            <Button size="sm" onClick={pay}>Pagar</Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Cancelar</Button>
          </div>
        ) : (
          <Button disabled={count === 0 || total > money} onClick={() => setConfirming(true)}>Comprar</Button>
        )}
        {count > 0 && !confirming && (
          <Button variant="outline" onClick={() => { setCart({}); setMessage('Carrinho esvaziado.'); }}><Trash2 /> Esvaziar</Button>
        )}
        {total > money && <p role="alert" className="text-sm text-destructive">Faltam {formatMoney(total - money)} para pagar este carrinho.</p>}
        <p role="status" className="shop-message">{message}</p>
      </aside>
    </div>
  );
}
