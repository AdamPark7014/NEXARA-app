"use client";

import { useRef, type CSSProperties, type PointerEvent } from "react";
import v from "./vivo.module.css";

/** Visor de cámara sobre una foto: la mira sigue al cursor y amplía lo que tiene debajo. Con el dedo, pasea sola. */
export default function Visor({ src }: { src: string }) {
  const raiz = useRef<HTMLDivElement>(null);
  const alMover = (e: PointerEvent) => {
    const el = raiz.current;
    if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--vx", ((e.clientX - r.left) / r.width).toFixed(4));
    el.style.setProperty("--vy", ((e.clientY - r.top) / r.height).toFixed(4));
    el.setAttribute("data-mira", "");
  };
  return (
    <div
      ref={raiz}
      className={v.visor}
      style={{ "--foto": `url(${src})` } as CSSProperties}
      onPointerMove={alMover}
      onPointerLeave={() => raiz.current?.removeAttribute("data-mira")}
      aria-hidden="true"
    >
      <span className={v.lente} />
    </div>
  );
}
