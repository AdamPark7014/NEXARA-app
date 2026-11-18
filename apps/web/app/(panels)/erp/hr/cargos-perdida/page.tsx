"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { apiRequest } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { ETIQUETAS_RH } from "@/lib/hr-etiquetas";
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
  const requestId = useRef(0);
  const [items, setItems] = useState<Cargo[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const permitido = ["rh", "ceo", "dir_admin", "super_admin"].includes(String(user?.roleKey ?? ""));
  const direccion = ["ceo", "dir_admin", "super_admin"].includes(String(user?.roleKey ?? ""));
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
      apiRequest(path, {
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
    if (!token || !permitido) { setItems([]); setLoading(false); return; }
    const request = ++requestId.current;
    setItems([]); setPersonas([]);
    setLoading(true);
    setError(null);
    try {
      const [rCargos, rUsers] = await Promise.all([
        auth("hr/cargos-perdida"),
        auth("users/hr-staff"),
      ]);
      if (!rCargos.ok) throw new Error(await rCargos.text());
      const data = await rCargos.json();
      if (request !== requestId.current) return;
      setItems(data);
      if (!rUsers.ok) throw new Error("No se pudo cargar el personal. Reintenta la carga.");
      if (rUsers.ok) {
        const raw = await rUsers.json();
        const list = Array.isArray(raw) ? raw : raw?.data ?? raw?.items ?? [];
        if (request !== requestId.current) return;
        setPersonas(list.map((u: any) => ({ id: u.id, nombre: u.nombre })).filter((u: Persona) => u.id && u.nombre));
      }
    } catch (e) {
      if (request === requestId.current) setError(formatApiError(e, "No se pudieron cargar los cargos."));
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [token, auth, permitido]);

  useEffect(() => {
    void cargar();
    return () => { requestId.current++; };
  }, [cargar]);

  const crear = async () => {
    if (!token || !permitido || saving) return;
    setSaving(true);
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
    } finally { setSaving(false); }
  };

  if (!token) return <main><h1>Recursos Humanos</h1><p>Inicia sesión para continuar.</p></main>;
  if (!permitido) return <main><h1>Recursos Humanos</h1><p role="alert">Solo RH o dirección pueden consultar esta información.</p></main>;
  return (
    <main style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
      <p><Link href="/erp/hr">← RH</Link> · <Link href="/erp/hr/medidas">Medidas</Link></p>
      <h1 style={{ fontSize: 28, marginTop: 0 }}>Cargo por pérdida (multa interna)</h1>
      <p style={{ color: "var(--ui-fg-2)" }}>
        No es castigo: es la deuda del art. 110 fr. I cuando hubo pérdida o daño a la empresa.
        Tope: un mes de salario; cada semana ≤ 30 % del excedente del mínimo. Requiere PDF de conformidad.
      </p>
      {error ? <p role="alert" style={{ color: "var(--ui-danger)" }}>{error} <button type="button" onClick={() => void cargar()}>Reintentar</button></p> : null}
      {ok ? <p style={{ color: "var(--ui-success)" }}>{ok}</p> : null}

      <ExcelExportadorDinamico
        disabled={loading || Boolean(error)}
        preferenciaKey="nx-excel-cols-hr-cargos"
        titulo="Cargos por pérdida"
        filename="cargos-por-perdida"
        rows={items.map((c) => ({
          fecha: String(c.createdAt),
          persona: c.user?.nombre ?? "",
          monto: Number(c.montoTotal),
          estado: c.estado,
          hechos: c.hechos,
        }))}
        estadoKey="estado"
        estados={["BORRADOR","PENDIENTE_DIRECCION","APROBADO","RECHAZADO","EN_COBRO","CERRADO"].map(value => ({value, label: ETIQUETAS_RH[value]}))}
        getPersonaArea={r => r.persona}
        getFecha={(r) => r.fecha}
        generadoPor={(user as { nombre?: string } | null)?.nombre}
        columns={[
          { key: "fecha", label: "Fecha" },
          { key: "persona", label: "Persona" },
          { key: "monto", label: "Monto", tipo: "dinero" as const, total: "suma" as const },
          { key: "estado", label: "Estado", etiquetas: ETIQUETAS_RH },
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
        <label>Describe la pérdida o daño y cómo ocurrió
          <textarea value={form.hechos} onChange={(e) => setForm({ ...form, hechos: e.target.value })} rows={4} style={{ fontSize: 16, width: "100%" }} />
        </label>
        <label>ID de la actividad que causó la pérdida
          <input value={form.actividadId} onChange={(e) => setForm({ ...form, actividadId: e.target.value })} style={{ minHeight: 44, fontSize: 16, width: "100%" }} />
        </label>
        <label>URL evidencia
          <input value={form.evidenciaUrl} onChange={(e) => setForm({ ...form, evidenciaUrl: e.target.value })} style={{ minHeight: 44, fontSize: 16, width: "100%" }} />
        </label>
        <label>Descargo del trabajador
          <textarea value={form.descargo} onChange={(e) => setForm({ ...form, descargo: e.target.value })} rows={2} style={{ fontSize: 16, width: "100%" }} />
        </label>
        <button type="button" disabled={saving || loading || !form.userId || form.hechos.trim().length < 10 || !form.actividadId || !form.evidenciaUrl.trim() || !form.descargo.trim() || Number(form.montoTotal) <= 0} onClick={() => void crear()} style={{ minHeight: 44, background: "var(--ui-primary)", color: "#fff", border: 0, borderRadius: 8 }}>
          {saving ? "Guardando…" : "Registrar cargo"}
        </button>
      </section>

      {loading ? <p role="status">Cargando…</p> : null}
      {!loading && !error && items.length === 0 ? <p>No hay cargos registrados. Completa la evidencia y el descargo para registrar uno.</p> : null}
      {!loading && items.length >= 200 ? <p>Se muestran los 200 registros más recientes; el Excel incluye esta lista.</p> : null}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {items.map((c) => (
          <li key={c.id} style={{ border: "1px solid var(--ui-border)", borderRadius: 12, padding: 12 }}>
            <strong>{c.user?.nombre ?? "Persona"}</strong> · ${Number(c.montoTotal).toLocaleString("es-MX", { minimumFractionDigits: 2 })} · {ETIQUETAS_RH[c.estado] ?? c.estado}
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
            {direccion && c.estado === "PENDIENTE_DIRECCION" ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={{ minHeight: 40 }} onClick={() => void auth(`hr/cargos-perdida/${c.id}/decidir`, { method: "POST", body: JSON.stringify({ accion: "aprobar" }) }).then(async r => { if (!r.ok) throw new Error(await r.text()); await cargar(); }).catch((e) => setError(formatApiError(e)))}>Aprobar</button>
                <button type="button" style={{ minHeight: 40 }} onClick={() => {
                  const motivo = window.prompt("Motivo del rechazo");
                  if (!motivo?.trim()) return;
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
