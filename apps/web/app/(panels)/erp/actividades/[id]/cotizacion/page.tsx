"use client";

/**
 * Trabajar una sola cotización sin tener el módulo (Velocidad Core, Ola 5). Partidas, cantidades y precios;
 * costo, margen, enviar y las demás cotizaciones se quedan con quien la pidió. El acceso lo decide la API
 * en cada petición y se cierra solo al terminar la actividad.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@/components/base";
import { toast } from "@/components/Toast";
import { useUser } from "@/components/UserContext";
import { guardarCotizacionAbierta, leerCotizacionAbierta, sumaDePartidas, type CotizacionAbierta, type PartidaAbierta } from "@/lib/cotizacion-abierta-api";
import { formatApiError } from "@/lib/erp-api";

const celda = { padding: "6px 8px", borderTop: "1px solid var(--ui-border)", verticalAlign: "middle" } as const;
const entrada = { width: "100%", minHeight: 36, padding: "0 8px", border: "1px solid var(--ui-border)", borderRadius: 8, font: "inherit" } as const;

export default function CotizacionAbiertaPage() {
  const params = useParams();
  const activityId = Number(params?.id);
  const { token } = useUser();
  const [a, setA] = useState<CotizacionAbierta | null>(null);
  const [partidas, setPartidas] = useState<PartidaAbierta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token || !activityId) return;
    try {
      const d = await leerCotizacionAbierta(token, activityId);
      setA(d);
      setPartidas(d?.partidas ?? []);
    } catch (e) {
      setError(formatApiError(e, "No se pudo abrir la cotización"));
    } finally {
      setCargando(false);
    }
  }, [token, activityId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiar = (i: number, cambio: Partial<PartidaAbierta>) => setPartidas((l) => l.map((p, j) => (j === i ? { ...p, ...cambio } : p)));

  const guardar = async () => {
    if (!token || !a?.version) return;
    setGuardando(true);
    setError(null);
    try {
      const d = await guardarCotizacionAbierta(token, activityId, a.version, partidas);
      setA(d);
      setPartidas(d.partidas ?? []);
      toast.success("Guardado");
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar"));
      if (/volvimos a cargar/.test(String((e as Error)?.message ?? ""))) void cargar();
    } finally {
      setGuardando(false);
    }
  };

  const volver = <Link href={`/erp/actividades/${activityId}`} style={{ fontWeight: 600, color: "var(--ui-primary)" }}>Regresar a la actividad</Link>;

  if (cargando) return <p style={{ padding: 16 }}>Abriendo la cotización…</p>;
  if (!a || !a.puedeEditar) {
    return (
      <div style={{ display: "grid", gap: 10, padding: 16 }}>
        <Alert tone="warning">{a ? "El acceso a esta cotización ya se cerró." : "Esta cotización no está abierta para ti."}</Alert>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {volver}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, padding: 16 }}>
      <header style={{ display: "grid", gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{a.folio}</h2>
        <span style={{ color: "var(--ui-fg-2)" }}>{[a.titulo, a.cliente].filter(Boolean).join(" · ")}</span>
      </header>
      <Alert tone="info">Acceso solo a esta cotización, hasta que termines tu actividad. Te la abrió {a.otorgadoPor}. Quien te la pidió revisa el margen y la envía.</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ui-fg-3)", fontSize: 12.5 }}>
              <th style={{ padding: "6px 8px", minWidth: 240 }}>Concepto</th>
              <th style={{ padding: "6px 8px", width: 110 }}>Unidad</th>
              <th style={{ padding: "6px 8px", width: 90 }}>Cantidad</th>
              <th style={{ padding: "6px 8px", width: 130 }}>Precio</th>
              <th style={{ padding: "6px 8px", width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {partidas.map((p, i) => (
              <tr key={p.id ?? `nueva-${i}`}>
                <td style={celda}><input aria-label="Concepto" style={entrada} value={p.name} onChange={(e) => cambiar(i, { name: e.target.value })} /></td>
                <td style={celda}><input aria-label="Unidad" style={entrada} value={p.unit ?? ""} onChange={(e) => cambiar(i, { unit: e.target.value })} /></td>
                <td style={celda}><input aria-label="Cantidad" inputMode="numeric" style={entrada} value={p.qty} onChange={(e) => cambiar(i, { qty: Number(e.target.value.replace(/\D/g, "")) })} /></td>
                <td style={celda}><input aria-label="Precio" inputMode="decimal" style={entrada} value={p.unitPrice} onChange={(e) => cambiar(i, { unitPrice: Number(e.target.value.replace(/[^\d.]/g, "")) })} /></td>
                <td style={celda}>
                  <Button variant="tertiary" onClick={() => setPartidas((l) => l.filter((_, j) => j !== i))} aria-label={`Quitar ${p.name}`}>
                    Quitar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <Button variant="tertiary" onClick={() => setPartidas((l) => [...l, { name: "", unit: "pieza", qty: 1, unitPrice: 0 }])}>
          Agregar partida
        </Button>
        <span style={{ color: "var(--ui-fg-2)" }}>
          Suma de partidas, antes de IVA: <b>{sumaDePartidas(partidas).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}</b>
        </span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Button variant="primary" loading={guardando} onClick={() => void guardar()}>
          Guardar
        </Button>
        {volver}
      </div>
    </div>
  );
}
