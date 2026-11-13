import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { ballColumn, ballFramePosition, ballRows, ballSheetUrl, preloadBallSheet } from '@/lib/ball-fx';
import '@/styles/ball-fx.css';

export interface BallPoint { x: number; y: number }

export interface BallPlan {
  /** Nome da bola (`poke-ball`, `ultra-ball`…). */
  ball: string;
  /** Unidade das coordenadas: `%` do bloco onde a bola está, ou `px`. */
  unit: '%' | 'px';
  /** De onde a bola sai (a mão do treinador). */
  from: BallPoint;
  /** Onde ela atinge o Pokémon (o centro dele). */
  to: BallPoint;
  /** Onde ela cai e rola (o chão, aos pés dele). */
  ground: BallPoint;
  /** Altura do arco do arremesso, na mesma unidade. */
  arc: number;
  /** Lado do quadro da bola (ex.: `16cqw`, `120px`); sem isso vale o do componente. */
  cell?: string;
  /** Capturou? E quantos balanços (0 a 3) a bola dá antes de abrir ou fechar de vez. */
  caught: boolean;
  shakes: number;
  /** 1 = normal; 2 = o dobro da velocidade. */
  speed?: number;
  /** A bola abriu: é a hora de o Pokémon sumir para dentro dela. */
  onOpen?: () => void;
  /** A bola se abriu sozinha (o Pokémon escapou): é a hora de ele reaparecer. */
  onRelease?: () => void;
}

export interface BallFxHandle {
  /** Arremessa e anima até o fim. Com captura, a bola fica parada no chão até `clear()`. */
  play(plan: BallPlan): Promise<void>;
  /** Tira a bola da tela. */
  clear(): void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const bounce = (t: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) { const u = t - 1.5 / d; return n * u * u + 0.75; }
  if (t < 2.5 / d) { const u = t - 2.25 / d; return n * u * u + 0.9375; }
  const u = t - 2.625 / d;
  return n * u * u + 0.984375;
};

/** A Poké Bola da captura: arremesso, abertura que engole o Pokémon, queda, balanços e o resultado. */
export const BallFx = forwardRef<BallFxHandle, { cell: string; className?: string }>(function BallFx({ cell, className }, ref) {
  const element = useRef<HTMLSpanElement>(null);
  const token = useRef(0);
  const frame = useRef<number | null>(null);

  useEffect(() => { preloadBallSheet(); }, []);
  useEffect(() => () => {
    token.current += 1;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  useImperativeHandle(ref, () => ({
    async play(plan) {
      const el = element.current;
      if (!el) return;
      token.current += 1;
      const mine = token.current;
      const alive = () => token.current === mine && element.current === el;
      const speed = plan.speed ?? 1;
      const column = ballColumn(plan.ball);
      const unit = plan.unit;

      const show = (row: number) => { el.style.backgroundPosition = ballFramePosition(column, row); };
      const place = (x: number, y: number) => { el.style.left = `${x}${unit}`; el.style.top = `${y}${unit}`; };
      const wait = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms / speed); });
      const tween = (ms: number, step: (t: number) => void) => new Promise<void>((resolve) => {
        const start = performance.now();
        const tick = (now: number) => {
          if (!alive()) { resolve(); return; }
          const t = Math.min(1, (now - start) / (ms / speed));
          step(t);
          if (t < 1) frame.current = requestAnimationFrame(tick); else resolve();
        };
        frame.current = requestAnimationFrame(tick);
      });

      el.style.setProperty('--cell', plan.cell ?? cell);
      el.style.rotate = '0deg';
      el.style.opacity = '1';
      el.dataset.on = 'true';
      show(ballRows.spin[0]);
      place(plan.from.x, plan.from.y);

      // 1. Arremesso: a bola gira no ar em arco até o Pokémon.
      await tween(720, (t) => {
        place(lerp(plan.from.x, plan.to.x, t), lerp(plan.from.y, plan.to.y, t) - plan.arc * 4 * t * (1 - t));
        show(ballRows.spin[Math.floor(t * 720 / 70) % ballRows.spin.length]!);
      });
      if (!alive()) return;

      // 2. A bola abre, a luz engole o Pokémon e ela fecha.
      plan.onOpen?.();
      for (const row of ballRows.open) { show(row); await wait(row < 7 ? 80 : 60); if (!alive()) return; }
      show(ballRows.closed);
      await wait(120);

      // 3. Cai no chão e quica.
      await tween(420, (t) => place(lerp(plan.to.x, plan.ground.x, t), lerp(plan.to.y, plan.ground.y, bounce(t))));
      if (!alive()) return;
      await wait(350);

      // 4. Balanços: a bola chacoalha de um lado para o outro.
      for (let i = 0; i < plan.shakes; i += 1) {
        await tween(560, (t) => { el.style.rotate = `${26 * Math.sin(t * Math.PI * 2.4) * (1 - t * 0.35)}deg`; });
        el.style.rotate = '0deg';
        if (!alive()) return;
        await wait(380);
      }
      if (!alive()) return;
      await wait(plan.shakes === 0 ? 250 : 120);

      // 5. Resultado.
      if (plan.caught) {
        for (const row of ballRows.caught) { show(row); await wait(110); if (!alive()) return; }
      } else {
        for (const row of ballRows.release) {
          show(row);
          if (row === ballRows.release[1]) plan.onRelease?.();
          await wait(95);
          if (!alive()) return;
        }
        await tween(260, (t) => { el.style.opacity = String(1 - t); });
        if (alive()) el.dataset.on = 'false';
      }
    },
    clear() {
      token.current += 1;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (element.current) element.current.dataset.on = 'false';
    },
  }), [cell]);

  return <span ref={element} className={['ball-fx', className].filter(Boolean).join(' ')} data-on="false" aria-hidden="true"
    style={{ ['--cell' as string]: cell, backgroundImage: `url("${ballSheetUrl}")` }} />;
});
