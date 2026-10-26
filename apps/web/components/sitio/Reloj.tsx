"use client";

import { useEffect, useState } from "react";

const formato = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "America/Mexico_City",
});

/** Hora de la Ciudad de México que avanza cada segundo (detalle «en vivo» del tablero). */
export default function Reloj({ desfase = 0 }: { desfase?: number }) {
  const [hora, setHora] = useState("--:--:--");
  useEffect(() => {
    const tic = () => setHora(formato.format(new Date(Date.now() - desfase * 1000)));
    tic();
    const id = window.setInterval(tic, 1000);
    return () => window.clearInterval(id);
  }, [desfase]);
  return <span suppressHydrationWarning>{hora}</span>;
}
