"use client";

/**
 * «Tu día»: lo que hoy espera algo del CEO, en una lista corta y en el orden en que conviene atenderlo.
 * Es el mismo resumen que llega como aviso cada mañana (GET /api/executive/brief).
 *
 * Si el servicio falla o todavía no existe (API antiguo), no estorba: el panel se oculta y el tablero
 * sigue como siempre.
 */
import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
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

/** Preferencia de la persona: no recibir avisos informativos, solo este resumen y lo urgente. */
export const PREF_SOLO_RESUMEN = "notificaciones.solo_resumen";

async function leerSoloResumen(token: string): Promise<boolean> {
  const res = await fetch(buildApiUrl(`user-preferences/${encodeURIComponent(PREF_SOLO_RESUMEN)}`), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return false;
  const valor = (await res.text().catch(() => "")).trim().replace(/^"|"$/g, "").toLowerCase();
  return valor === "1" || valor === "true";
}

async function guardarSoloResumen(token: string, activo: boolean): Promise<void> {
  const res = await fetch(buildApiUrl("user-preferences"), {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ key: PREF_SOLO_RESUMEN, value: activo ? "1" : "0" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

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
  const [soloResumen, setSoloResumen] = useState<boolean | null>(null);
  const [errorPref, setErrorPref] = useState(false);
  const [prefPendiente, setPrefPendiente] = useState<boolean | null>(null);

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

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    leerSoloResumen(token)
      .then((v) => {
        if (!cancelado) setSoloResumen(v);
      })
      .catch(() => {
        if (!cancelado) setSoloResumen(false);
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  const cambiarSoloResumen = (activo: boolean) => {
    if (!token) return;
    const anterior = soloResumen;
    setSoloResumen(activo); // se ve al instante; si no se guarda, vuelve a como estaba
    setErrorPref(false);
    setPrefPendiente(activo);
    guardarSoloResumen(token, activo).catch(() => {
      setSoloResumen(anterior);
      setErrorPref(true);
    });
  };

  if (!token || (failed && !data)) return null;

  return (
    <DashPanel
      title="Tu día"
      subtitle={data ? (data.vacio ? undefined : "Lo que hoy espera algo de ti") : "Revisando pendientes…"}
      action="Aprobaciones"
      actionHref="/erp/approvals"
    >
      {loading && !data ? (
        <DashSkeleton rows={3} height={16} />
      ) : !data || data.vacio ? (
        <DashEmpty title="Todo al día" />
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
      {soloResumen !== null && (
        <label
          style={{ display: "flex", gap: 8, alignItems: "center", alignSelf: "flex-start", margin: "12px 12px 4px", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={soloResumen}
            onChange={(e) => cambiarSoloResumen(e.target.checked)}
            style={{ width: 18, height: 18, minWidth: 18, minHeight: 18, flex: "0 0 auto", margin: 0, padding: 0 }}
          />
          <span>Solo el resumen y lo urgente.</span>
        </label>
      )}
      {failed && data && (
        <p role="alert" style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 12px 4px", fontSize: 13, color: "var(--danger)" }}>
          No pudimos actualizar.
          <Button size="sm" variant="secondary" onClick={load} loading={loading}>Reintentar</Button>
        </p>
      )}
      {errorPref && prefPendiente !== null && (
        <p role="alert" style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 12px", fontSize: 13, color: "var(--danger)" }}>
          No se pudo guardar.
          <Button size="sm" variant="secondary" onClick={() => cambiarSoloResumen(prefPendiente)}>Reintentar</Button>
        </p>
      )}
    </DashPanel>
  );
}
