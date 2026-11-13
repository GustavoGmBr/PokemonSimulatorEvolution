import { useEffect, useState } from 'react';
import { textSpeedOf, useSettings } from '@/lib/settings';

/** Quanto tempo o texto leva para aparecer inteiro na velocidade escolhida em Opções. */
export function typingMs(length: number, cps: number) {
  return Number.isFinite(cps) ? (length / cps) * 1000 : 0;
}

/**
 * Mostra o texto letra por letra, na velocidade de texto escolhida em Opções ("Instantânea" mostra tudo de uma vez).
 * Os leitores de tela recebem o texto inteiro; a parte ainda não digitada ocupa o lugar para a caixa não pular.
 */
export function TypedText({ text }: { text: string }) {
  const cps = textSpeedOf(useSettings().textSpeed).cps;
  const [typed, setTyped] = useState({ text: '', count: 0 });
  const count = !Number.isFinite(cps) ? text.length : typed.text === text ? typed.count : 0;

  useEffect(() => {
    if (!Number.isFinite(cps)) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const next = Math.min(text.length, Math.floor(((now - start) * cps) / 1000));
      setTyped((current) => (current.text === text && current.count === next ? current : { text, count: next }));
      if (next < text.length) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [text, cps]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{text.slice(0, count)}<span className="invisible">{text.slice(count)}</span></span>
    </>
  );
}
