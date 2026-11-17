"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import ExcelExportadorDinamico from "@/components/excel/ExcelExportadorDinamico";

type Medida = {
  id: number;
  tipo: string;
  estado: string;
  hechos: string;
  diasSuspension?: number | null;
  avisoReglamento?: string | null;
  createdAt: string;
  user?: { id: number; nombre: string };
};

export default function MedidasDisciplinariasPage() {
  const { token, user } = useUser();
  const [items, setItems] = useState<Medida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [personas, setPersonas] = useState<Array<{ id: number; nombre: string }>>([]);
  const [form, setForm] = useState({
    userId: "",
    tipo: "AMONESTACION_VERBAL",
    hechos: "",
    testigos: "",
    descargo: "",
    diasSuspension: "1",
  });

  const cargar = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [res, rUsers] = await Promise.all([
        fetch(buildApiUrl("hr/medidas-disciplinarias"), {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }),
        fetch(buildApiUrl("users?limit=100"), {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }),
      ]);
      if (!res.ok) throw new Error(await res.text());
      setItems(await res.json());
      if (rUsers.ok) {
        const raw = await rUsers.json();
        const list = Array.isArray(raw) ? raw : raw?.data ?? raw?.items ?? [];
        setPersonas(list.map((u: any) => ({ id: u.id, nombre: u.nombre })).filter((u: any) => u.id && u.nombre));
      }
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar las medidas."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const crear = async () => {
    if (!token) return;
    setError(null);
    setOk(null);
    try {
      const body: Record<string, unknown> = {
        userId: Number(form.userId),
        tipo: form.tipo,
        hechos: form.hechos,
      };
      if (form.tipo === "ACTA_ADMINISTRATIVA") {
        body.testigos = form.testigos;
        body.descargo = form.descargo;
      }
      if (form.tipo === "SUSPENSION") body.diasSuspension = Number(form.diasSuspension);
      const res = await fetch(buildApiUrl("hr/medidas-disciplinarias"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.avisoReglamento) setOk(data.avisoReglamento);
      else setOk("Medida registrada (sin multa: art. 107 LFT).");
      await cargar();
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  return (
    <main style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
      <p style={{ marginBottom: 8 }}><Link href="/erp/hr">← RH</Link> · <Link href="/erp/hr/cargos-perdida">Cargos por pérdida</Link></p>
      <h1 style={{ fontSize: 28, marginTop: 0 }}>Medidas disciplinarias</h1>
      <p style={{ color: "var(--ui-fg-2)" }}>
        Amonestación, acta y suspensión hasta 8 días. Las multas al trabajador están prohibidas (art. 107 LFT).
        Descuentos solo por supuestos del art. 110.
      </p>
      {error ? <p role="alert" style={{ color: "var(--ui-danger)" }}>{error}</p> : null}
      {ok ? <p style={{ color: "var(--ui-success)" }}>{ok}</p> : null}

      <ExcelExportadorDinamico
        preferenciaKey="nx-excel-cols-hr-medidas"
        titulo="Medidas disciplinarias"
        filename="medidas-disciplinarias"
        rows={items.map((m) => ({
          fecha: String(m.createdAt).slice(0, 10),
          persona: m.user?.nombre ?? "",
          tipo: m.tipo,
          estado: m.estado,
          hechos: m.hechos,
        }))}
        getFecha={(r) => r.fecha}
        generadoPor={(user as { nombre?: string } | null)?.nombre}
        columns={[
          { key: "fecha", label: "Fecha" },
          { key: "persona", label: "Persona" },
          { key: "tipo", label: "Tipo" },
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
        <label>Tipo
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={{ minHeight: 44, fontSize: 16, width: "100%" }}>
            <option value="AMONESTACION_VERBAL">Amonestación verbal</option>
            <option value="AMONESTACION_ESCRITA">Amonestación escrita</option>
            <option value="ACTA_ADMINISTRATIVA">Acta administrativa</option>
            <option value="SUSPENSION">Suspensión (1–8 días)</option>
          </select>
        </label>
        <label>Hechos<textarea value={form.hechos} onChange={(e) => setForm({ ...form, hechos: e.target.value })} rows={4} style={{ fontSize: 16, width: "100%" }} /></label>
        {form.tipo === "ACTA_ADMINISTRATIVA" ? (
          <>
            <label>Testigos<textarea value={form.testigos} onChange={(e) => setForm({ ...form, testigos: e.target.value })} rows={2} style={{ fontSize: 16, width: "100%" }} /></label>
            <label>Descargo del trabajador<textarea value={form.descargo} onChange={(e) => setForm({ ...form, descargo: e.target.value })} rows={2} style={{ fontSize: 16, width: "100%" }} /></label>
          </>
        ) : null}
        {form.tipo === "SUSPENSION" ? (
          <label>Días (1–8)<input type="number" min={1} max={8} value={form.diasSuspension} onChange={(e) => setForm({ ...form, diasSuspension: e.target.value })} style={{ minHeight: 44, fontSize: 16, width: "100%" }} /></label>
        ) : null}
        <button type="button" onClick={() => void crear()} style={{ minHeight: 44, background: "var(--ui-primary)", color: "#fff", border: 0, borderRadius: 8 }}>
          Registrar medida
        </button>
      </section>

      {loading ? <p role="status">Cargando…</p> : null}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {items.map((m) => (
          <li key={m.id} style={{ border: "1px solid var(--ui-border)", borderRadius: 12, padding: 12 }}>
            <strong>{m.user?.nombre ?? "Persona"}</strong> · {m.tipo} · {m.estado}
            <p style={{ whiteSpace: "pre-wrap" }}>{m.hechos}</p>
            {m.avisoReglamento ? <p style={{ color: "var(--ui-danger)", fontSize: 13 }}>{m.avisoReglamento}</p> : null}
            <Link href={`/erp/hr/medidas?desempeno=${m.user?.id ?? ""}`}>Desempeño</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
