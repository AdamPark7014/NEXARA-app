"use client";

/**
 * «Tu día»: lo que hoy espera algo del CEO, en una lista corta y en el orden en que conviene atenderlo.
 * Es el mismo resumen que llega como aviso cada mañana (GET /api/executive/brief).
 *
 * Si el servicio falla o todavía no existe (API antiguo), no estorba: el panel se oculta y el tablero
 * sigue como siempre.
 */
import { useCallback, useEffect, useState } from "react";
import { DashPanel, ListRow, DashPill, DashEmpty, DashSkeleton } from "@/components/dashboard/DashKit";
import { buildApiUrl } from "@/lib/api-base";

export type TuDiaItem = {
  clave: string;
  texto: string;
  url: string;
  tono: "alerta" | "atencion" | "info";
};

export type TuDia = {
  fecha: string;
  vacio: boolean;
  prioridad: "alta" | "normal";
  titulo: string;
  mensaje: string;
  items: TuDiaItem[];
};

const TONO: Record<TuDiaItem["tono"], { color: string; pill: "danger" | "warning" | "neutral"; etiqueta: string }> = {
  alerta: { color: "var(--danger)", pill: "danger", etiqueta: "Urgente" },
  atencion: { color: "var(--warning)", pill: "warning", etiqueta: "Pendiente" },
  info: { color: "var(--border-strong, var(--border))", pill: "neutral", etiqueta: "Aviso" },
};

/** Rutas que la API nombra (`/erp/...`) → solo se enlazan las internas. */
const enlace = (url: string) => (url.startsWith("/erp/") ? url : undefined);

export async function fetchTuDia(token: string): Promise<TuDia> {
  const res = await fetch(buildApiUrl("executive/brief"), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as TuDia;
}

export default function TuDiaPanel({ token }: { token: string | null | undefined }) {
  const [data, setData] = useState<TuDia | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetchTuDia(token)
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      // Un error de refresco no borra lo que ya se mostraba.
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (!token || (failed && !data)) return null;

  return (
    <DashPanel
      title="Tu día"
      subtitle={data ? (data.vacio ? "Nada requiere tu atención ahora" : "Lo que hoy espera algo de ti") : "Revisando pendientes…"}
      action="Aprobaciones"
      actionHref="/erp/approvals"
    >
      {loading && !data ? (
        <DashSkeleton rows={3} height={16} />
      ) : !data || data.vacio ? (
        <DashEmpty title="Todo al día" description="Sin aprobaciones, cobranza vencida ni compras atrasadas." />
      ) : (
        data.items.map((item) => {
          const tono = TONO[item.tono] ?? TONO.atencion;
          return (
            <ListRow
              key={item.clave}
              href={enlace(item.url)}
              accent={tono.color}
              title={item.texto}
              trail={<DashPill tone={tono.pill}>{tono.etiqueta}</DashPill>}
            />
          );
        })
      )}
    </DashPanel>
  );
}
