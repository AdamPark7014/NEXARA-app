"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import ExcelExportadorDinamico from "@/components/excel/ExcelExportadorDinamico";

type Cargo = {
  id: number;
  montoTotal: string | number;
  hechos: string;
  estado: string;
  conformidadPdfUrl?: string | null;
  planCuotasJson?: { cuotas?: Array<{ semanaIso: string; monto: number }>; topeMensual?: number; topeSemanal?: number } | null;
  createdAt: string;
  user?: { id: number; nombre: string };
};

type Persona = { id: number; nombre: string };

export default function CargosPerdidaPage() {
  const { token, user } = useUser();
  const [items, setItems] = useState<Cargo[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    userId: "",
    montoTotal: "",
    hechos: "",
    actividadId: "",
    descargo: "",
    evidenciaUrl: "",
  });

  const auth = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(buildApiUrl(path), {
        ...init,
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers as Record<string, string> | undefined),
        },
      }),
    [token],
  );

  const cargar = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [rCargos, rUsers] = await Promise.all([
        auth("hr/cargos-perdida"),
        auth("users?limit=100"),
      ]);
      if (!rCargos.ok) throw new Error(await rCargos.text());
      setItems(await rCargos.json());
      if (rUsers.ok) {
        const raw = await rUsers.json();
        const list = Array.isArray(raw) ? raw : raw?.data ?? raw?.items ?? [];
        setPersonas(list.map((u: any) => ({ id: u.id, nombre: u.nombre })).filter((u: Persona) => u.id && u.nombre));
      }
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar los cargos."));
    } finally {
      setLoading(false);
    }
  }, [token, auth]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const crear = async () => {
    if (!token) return;
    setError(null);
    setOk(null);
    try {
      const res = await auth("hr/cargos-perdida", {
        method: "POST",
        body: JSON.stringify({
          userId: Number(form.userId),
          montoTotal: Number(form.montoTotal),
          hechos: form.hechos,
          actividadId: form.actividadId ? Number(form.actividadId) : undefined,
          descargo: form.descargo,
          evidenciaUrl: form.evidenciaUrl || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOk("Cargo por pérdida (multa interna) registrado en borrador. Sube la conformidad firmada.");
      setForm({ userId: "", montoTotal: "", hechos: "", actividadId: "", descargo: "", evidenciaUrl: "" });
      await cargar();
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  return (
    <main style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
      <p><Link href="/erp/hr">← RH</Link> · <Link href="/erp/hr/medidas">Medidas</Link></p>
      <h1 style={{ fontSize: 28, marginTop: 0 }}>Cargo por pérdida (multa interna)</h1>
      <p style={{ color: "var(--ui-fg-2)" }}>
        No es castigo: es la deuda del art. 110 fr. I cuando hubo pérdida o daño a la empresa.
        Tope: un mes de salario; cada semana ≤ 30 % del excedente del mínimo. Requiere PDF de conformidad.
      </p>
      {error ? <p role="alert" style={{ color: "var(--ui-danger)" }}>{error}</p> : null}
      {ok ? <p style={{ color: "var(--ui-success)" }}>{ok}</p> : null}

      <ExcelExportadorDinamico
        preferenciaKey="nx-excel-cols-hr-cargos"
        titulo="Cargos por pérdida"
        filename="cargos-por-perdida"
        rows={items.map((c) => ({
          fecha: String(c.createdAt).slice(0, 10),
          persona: c.user?.nombre ?? "",
          monto: Number(c.montoTotal),
          estado: c.estado,
          hechos: c.hechos,
        }))}
        getFecha={(r) => r.fecha}
        generadoPor={(user as { nombre?: string } | null)?.nombre}
        columns={[
          { key: "fecha", label: "Fecha" },
          { key: "persona", label: "Persona" },
          { key: "monto", label: "Monto", tipo: "dinero" as const, total: "suma" as const },
          { key: "estado", label: "Estado" },
          { key: "hechos", label: "Hechos" },
        ]}
      />

      <section style={{ display: "grid", gap: 10, margin: "20px 0", maxWidth: 560 }}>
        <label>Persona
          <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} style={{ minHeight: 44, fontSize: 16, width: "100%" }}>
            <option value="">—</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label>Monto de la pérdida (MXN)
          <input type="number" min={1} step="0.01" value={form.montoTotal} onChange={(e) => setForm({ ...form, montoTotal: e.target.value })} style={{ minHeight: 44, fontSize: 16, width: "100%" }} />
        </label>
        <label>Hechos / vínculo con incidencia o actividad
          <textarea value={form.hechos} onChange={(e) => setForm({ ...form, hechos: e.target.value })} rows={4} style={{ fontSize: 16, width: "100%" }} />
        </label>
        <label>ID actividad (opcional)
          <input value={form.actividadId} onChange={(e) => setForm({ ...form, actividadId: e.target.value })} style={{ minHeight: 44, fontSize: 16, width: "100%" }} />
        </label>
        <label>URL evidencia
          <input value={form.evidenciaUrl} onChange={(e) => setForm({ ...form, evidenciaUrl: e.target.value })} style={{ minHeight: 44, fontSize: 16, width: "100%" }} />
        </label>
        <label>Descargo del trabajador
          <textarea value={form.descargo} onChange={(e) => setForm({ ...form, descargo: e.target.value })} rows={2} style={{ fontSize: 16, width: "100%" }} />
        </label>
        <button type="button" onClick={() => void crear()} style={{ minHeight: 44, background: "var(--ui-primary)", color: "#fff", border: 0, borderRadius: 8 }}>
          Registrar cargo
        </button>
      </section>

      {loading ? <p role="status">Cargando…</p> : null}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {items.map((c) => (
          <li key={c.id} style={{ border: "1px solid var(--ui-border)", borderRadius: 12, padding: 12 }}>
            <strong>{c.user?.nombre ?? "Persona"}</strong> · ${Number(c.montoTotal).toLocaleString("es-MX", { minimumFractionDigits: 2 })} · {c.estado}
            <p style={{ whiteSpace: "pre-wrap" }}>{c.hechos}</p>
            {c.planCuotasJson?.topeSemanal != null ? (
              <p style={{ fontSize: 13, color: "var(--ui-fg-2)" }}>
                Plan: {c.planCuotasJson.cuotas?.length ?? 0} cuotas · tope semanal ${Number(c.planCuotasJson.topeSemanal).toFixed(2)} · tope mes ${Number(c.planCuotasJson.topeMensual ?? 0).toFixed(2)}
              </p>
            ) : null}
            {c.estado === "BORRADOR" ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={{ minHeight: 40 }}
                  onClick={() => {
                    const pdfUrl = window.prompt("URL del PDF de conformidad firmada");
                    if (!pdfUrl) return;
                    void auth(`hr/cargos-perdida/${c.id}/conformidad`, { method: "PATCH", body: JSON.stringify({ pdfUrl }) })
                      .then(async (r) => { if (!r.ok) throw new Error(await r.text()); setOk("Conformidad guardada."); return cargar(); })
                      .catch((e) => setError(formatApiError(e)));
                  }}
                >
                  Adjuntar conformidad PDF
                </button>
                <button
                  type="button"
                  style={{ minHeight: 40 }}
                  onClick={() =>
                    void auth(`hr/cargos-perdida/${c.id}/enviar`, { method: "POST", body: "{}" })
                      .then(async (r) => { if (!r.ok) throw new Error(await r.text()); setOk("Enviado a dirección."); return cargar(); })
                      .catch((e) => setError(formatApiError(e)))
                  }
                >
                  Enviar a dirección
                </button>
              </div>
            ) : null}
            {c.estado === "PENDIENTE_DIRECCION" ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={{ minHeight: 40 }} onClick={() => void auth(`hr/cargos-perdida/${c.id}/decidir`, { method: "POST", body: JSON.stringify({ accion: "aprobar" }) }).then(cargar).catch((e) => setError(formatApiError(e)))}>Aprobar</button>
                <button type="button" style={{ minHeight: 40 }} onClick={() => {
                  const motivo = window.prompt("Motivo del rechazo") || "";
                  void auth(`hr/cargos-perdida/${c.id}/decidir`, { method: "POST", body: JSON.stringify({ accion: "rechazar", motivo }) }).then(cargar).catch((e) => setError(formatApiError(e)));
                }}>Rechazar</button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
