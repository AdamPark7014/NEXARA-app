"use client";

import { useCallback, useEffect, useState } from "react";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { RangoFechasContabilidad } from "@/components/contabilidad/RangoFechasContabilidad";
import { descargarExcelContabilidad } from "@/lib/contabilidad-excel";
import {
  rangoDePresetContabilidad,
  type ContabilidadFechaPreset,
  type RangoContabilidad,
} from "@/lib/contabilidad-fechas";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";

type Pestana = "recibidos" | "emitidos" | "cancelados" | "alertas";

const TITULO_PESTANA: Record<Pestana, string> = {
  recibidos: "Recibidos",
  emitidos: "Emitidos",
  cancelados: "Cancelados",
  alertas: "Alertas",
};

type Item = {
  id: number;
  issueDate: string;
  emisorName?: string | null;
  emisorRfc?: string | null;
  totalAmount: number;
  taxAmount: number;
  cfdiUuid?: string | null;
  satEstatus?: string | null;
  lista69B?: string | null;
  poliza?: { estado: string; confianza: string } | null;
};

export default function BuzonSatPage() {
  const { token, user } = useUser();
  const [pestana, setPestana] = useState<Pestana>("recibidos");
  const [preset, setPreset] = useState<ContabilidadFechaPreset>("este_mes");
  const [rango, setRango] = useState<RangoContabilidad>(() => rangoDePresetContabilidad("este_mes"));
  const [items, setItems] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        pestana,
        desde: rango.desde,
        hasta: rango.hasta,
      });
      const data = await erpFetch<{ items: Item[] }>(`accounting/buzon-sat?${q}`, token);
      setItems(data.items ?? []);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setCargando(false);
    }
  }, [token, pestana, rango]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function excel() {
    await descargarExcelContabilidad({
      nombreArchivo: `cfdi-${pestana}`,
      tituloHoja: "Buzón SAT",
      titulo: `Buzón SAT · ${TITULO_PESTANA[pestana]}`,
      rango,
      columnas: [
        { key: "issueDate", header: "Fecha", tipo: "fecha" },
        { key: "emisorName", header: "Emisor", ancho: 44, ajustar: true },
        { key: "emisorRfc", header: "RFC emisor", ancho: 16 },
        { key: "cfdiUuid", header: "UUID", ancho: 42 },
        { key: "satEstatus", header: "Estatus SAT", ancho: 14, etiquetas: { VIGENTE: "Vigente", CANCELADO: "Cancelado" } },
        { key: "lista69B", header: "Lista 69-B", ancho: 14, etiquetas: { PRESUNTO: "Presunto", DEFINITIVO: "Definitivo" } },
        { key: "totalAmount", header: "Total", tipo: "moneda" },
        { key: "taxAmount", header: "IVA", tipo: "moneda" },
      ],
      filas: items as unknown as Record<string, unknown>[],
      columnasConTotal: [6, 7],
      generadoPor: user?.nombre ?? null,
    });
  }

  return (
    <MesaPagina
      titulo="Buzón SAT"
      descripcion="CFDI emitidos y recibidos del SAT. La IA no guarda nada sin que lo veas: aquí revisas el buzón."
      secundarias={
        <button type="button" onClick={() => void excel()} style={{ minHeight: 40 }}>
          Excel
        </button>
      }
      primaria={
        <button type="button" onClick={() => void cargar()} style={{ minHeight: 40 }}>
          Actualizar
        </button>
      }
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        {(["recibidos", "emitidos", "cancelados", "alertas"] as Pestana[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPestana(p)}
            style={{
              minHeight: 40,
              fontWeight: pestana === p ? 700 : 400,
              borderBottom: pestana === p ? "2px solid var(--primary, #168570)" : "2px solid transparent",
            }}
          >
            {TITULO_PESTANA[p]}
          </button>
        ))}
      </div>
      <RangoFechasContabilidad
        pantalla="cfdi"
        preset={preset}
        value={rango}
        onChange={(p, r) => {
          setPreset(p);
          setRango(r);
        }}
      />
      {error ? <p role="alert">{error}</p> : null}
      {cargando ? (
        <p>Cargando…</p>
      ) : items.length === 0 ? (
        <p>No hay CFDI en este rango. Con la e.firma montada, el cron de las 06:00 llena el buzón solo.</p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th align="left">Fecha</th>
                <th align="left">Emisor</th>
                <th align="left">RFC</th>
                <th align="right">Total</th>
                <th align="left">UUID</th>
                <th align="left">69-B</th>
                <th align="left">Póliza</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td>{String(r.issueDate).slice(0, 10)}</td>
                  <td>{r.emisorName}</td>
                  <td>{r.emisorRfc}</td>
                  <td align="right">
                    {Number(r.totalAmount).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
                  </td>
                  <td title={r.cfdiUuid ?? ""}>{r.cfdiUuid ? `…${r.cfdiUuid.slice(-4)}` : ""}</td>
                  <td style={{ color: r.lista69B ? "#b91c1c" : undefined }}>{r.lista69B ?? ""}</td>
                  <td>{r.poliza?.estado ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </MesaPagina>
  );
}
