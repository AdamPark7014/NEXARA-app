"use client";

import { useCallback, useEffect, useState } from "react";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { descargarExcelContabilidad } from "@/lib/contabilidad-excel";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";

type Item = {
  id: number;
  estado: string;
  confianza: string;
  explicacion: string | null;
  cuentaGastoCodigo: string | null;
  invoice: {
    id: number;
    invoiceNumber: string;
    emisorName?: string | null;
    emisorRfc?: string | null;
    totalAmount: number;
    issueDate: string;
  };
};

export default function PorContabilizarPage() {
  const { token } = useUser();
  const [items, setItems] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Record<number, string>>({});

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      const data = await erpFetch<{ items: Item[] }>("accounting/buzon-sat/por-contabilizar", token);
      setItems(data.items ?? []);
      setEditando(Object.fromEntries((data.items ?? []).map((i) => [i.id, i.cuentaGastoCodigo ?? ""])));
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function aceptar(id: number) {
    if (!token) return;
    try {
      await erpFetch(`accounting/buzon-sat/por-contabilizar/${id}/aceptar`, token, {
        method: "POST",
        body: JSON.stringify({ cuentaGastoCodigo: editando[id] }),
      });
      toast.success("Póliza aceptada");
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  }

  async function corregir(id: number) {
    if (!token) return;
    try {
      await erpFetch(`accounting/buzon-sat/por-contabilizar/${id}/corregir`, token, {
        method: "POST",
        body: JSON.stringify({ cuentaGastoCodigo: editando[id] }),
      });
      toast.success("Regla guardada para ese proveedor");
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  }

  async function aceptarAltas() {
    if (!token) return;
    try {
      const r = await erpFetch<{ aceptadas: number }>("accounting/buzon-sat/por-contabilizar/aceptar-alta", token, {
        method: "POST",
        body: "{}",
      });
      toast.success(`Aceptadas: ${r.aceptadas}`);
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  }

  return (
    <MesaPagina
      titulo="Por contabilizar"
      descripcion="Propuestas de póliza de CFDI recibidos. Nada entra al libro sin tu clic."
      secundarias={
        <button
          type="button"
          style={{ minHeight: 40 }}
          onClick={() =>
            void descargarExcelContabilidad({
              nombreArchivo: "por-contabilizar",
              tituloHoja: "Por contabilizar",
              columnas: [
                { key: "emisor", header: "Emisor" },
                { key: "total", header: "Total", tipo: "moneda" },
                { key: "cuenta", header: "Cuenta" },
                { key: "confianza", header: "Confianza" },
                { key: "explicacion", header: "Explicación" },
              ],
              filas: items.map((i) => ({
                emisor: i.invoice.emisorName,
                total: i.invoice.totalAmount,
                cuenta: editando[i.id] ?? i.cuentaGastoCodigo,
                confianza: i.confianza,
                explicacion: i.explicacion,
              })),
              columnasConTotal: [1],
            })
          }
        >
          Excel
        </button>
      }
      primaria={
        <button type="button" onClick={() => void aceptarAltas()} style={{ minHeight: 40 }}>
          Aceptar todas las de confianza alta
        </button>
      }
    >
      {error ? <p role="alert">{error}</p> : null}
      {cargando ? (
        <p>Cargando…</p>
      ) : items.length === 0 ? (
        <p>No hay propuestas pendientes. Cuando entre un CFDI al buzón, aparece aquí para que la revises.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "16px 0", display: "grid", gap: 12 }}>
          {items.map((i) => (
            <li
              key={i.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>
                  {i.invoice.emisorName ?? i.invoice.emisorRfc} ·{" "}
                  {Number(i.invoice.totalAmount).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
                </strong>
                <span>Confianza: {i.confianza}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13 }}>{i.explicacion}</p>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                Cuenta
                <input
                  value={editando[i.id] ?? ""}
                  onChange={(e) => setEditando((s) => ({ ...s, [i.id]: e.target.value }))}
                  style={{ minHeight: 36, minWidth: 120 }}
                />
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={{ minHeight: 40 }} onClick={() => void aceptar(i.id)}>
                  Aceptar
                </button>
                <button type="button" style={{ minHeight: 40 }} onClick={() => void corregir(i.id)}>
                  Corregir y recordar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </MesaPagina>
  );
}
