import type { Tone } from "@/components/base";
import type { Tono } from "@/lib/proyectos-api";

/** El tono de proyectos (`ok`, `alerta`…) en el tono de las insignias del sistema. */
const TONO_BASE: Record<Tono, Tone> = {
  info: "info",
  ok: "success",
  alerta: "warning",
  peligro: "danger",
  neutral: "neutral",
};

export function toneDe(tono: Tono | undefined | null): Tone {
  return (tono && TONO_BASE[tono]) || "neutral";
}
