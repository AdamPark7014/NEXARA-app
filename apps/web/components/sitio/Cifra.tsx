"use client";

import { useEffect, useRef, useState } from "react";

/** Separa «+200», «< 24 h» o «+10» en prefijo, número y sufijo; un texto sin número queda tal cual. */
function partes(valor: string) {
  const m = valor.match(/^(\D*?)(\d+(?:[.,]\d+)?)(.*)$/);
  if (!m) return null;
  return { antes: m[1], numero: Number(m[2].replace(",", ".")), despues: m[3] };
}

/** Número que sube desde cero la primera vez que entra en pantalla. */
export default function Cifra({ valor, className }: { valor: string; className?: string }) {
  const p = partes(valor);
  const ref = useRef<HTMLSpanElement>(null);
  const [actual, setActual] = useState<number | null>(null);

  useEffect(() => {
    if (!p || !ref.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setActual(0);
    let raf = 0;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        obs.disconnect();
        const inicio = performance.now();
        const dura = 1400;
        const paso = (t: number) => {
          const k = Math.min(1, (t - inicio) / dura);
          const suave = 1 - Math.pow(1 - k, 3);
          setActual(Math.round(p.numero * suave));
          if (k < 1) raf = requestAnimationFrame(paso);
          else setActual(null);
        };
        raf = requestAnimationFrame(paso);
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  return (
    <span ref={ref} className={className} aria-label={valor}>
      <span aria-hidden="true">{p && actual !== null ? `${p.antes}${actual}${p.despues}` : valor}</span>
    </span>
  );
}
