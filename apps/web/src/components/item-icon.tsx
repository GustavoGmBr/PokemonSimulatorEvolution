import { useState } from 'react';

const itemsUrl = `${import.meta.env.BASE_URL}recursos/Itens`;

/** Ícone do item (recursos/Itens/<nome>.png). Itens sem imagem própria (as Mega Pedras novas, por exemplo) usam a pedra genérica. */
export function ItemIcon({ item, size = 40 }: { item: string; size?: number }) {
  // 0 = imagem do item; 1 = pedra genérica; 2 = nenhuma imagem carregou.
  const [attempt, setAttempt] = useState(0);
  if (attempt > 1) return <span className="item-icon item-icon-missing" style={{ width: size, height: size }} aria-hidden="true" />;
  return (
    <img key={attempt} className="item-icon" src={`${itemsUrl}/${attempt === 0 ? encodeURIComponent(item) : 'generico'}.png`} alt="" width={size} height={size}
      loading="lazy" decoding="async" draggable={false} style={{ width: size, height: size }} onError={() => setAttempt(attempt + 1)} />
  );
}
