"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import HrModuleRail from "@/components/hr/HrModuleRail";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { lunesDe } from "@/lib/control-nomina";

type Incidencia = {
  id: number;
  userId: number;
  fecha: string;
  tipo: string;
  concepto: string;
  cantidad?: string | number | null;
  monto?: string | number | null;
  estado: string;
  semanaNomina?: string | null;
  user?: { id: number; nombre: string; employeeNumber?: string | null };
};

const TIPOS = [
  "FALTA_JUSTIFICADA",
  "FALTA_INJUSTIFICADA",
  "RETARDO",
  "PERMISO_CON_GOCE",
  "PERMISO_SIN_GOCE",
  "INCAPACIDAD",
  "VACACIONES",
  "HORAS_EXTRA",
  "BONO",
  "DESCUENTO",
  "PRESTAMO",
  "OTRO",
] as const;

function isoLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function HrIncidenciasPage() {
  const { token, user } = useUser();
  const puedeEscribir = ["rh", "ceo", "super_admin"].includes(user?.roleKey || "");
  const [semana, setSemana] = useState(() => lunesDe(isoLocal()));
  const [rows, setRows] = useState<Incidencia[]>([]);
  const [personas, setPersonas] = useState<Array<{ id: number; nombre: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState({
    userId: "",
    fecha: isoLocal(),
    tipo: "RETARDO",
    concepto: "",
    cantidad: "",
    monto: "",
  });

  const cargar = useCallback(async () => {
    if (!token) return;
    setError(null);
    setLoading(true);
    setRows([]);
    try {
    const res = await fetch(buildApiUrl(`hr/incidencias?semana=${encodeURIComponent(semana)}`), {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (!res.ok) throw new Error("No se pudieron cargar las incidencias.");
    setRows(await res.json());
    } finally { setLoading(false); }
  }, [token, semana]);

  useEffect(() => {
    cargar().catch((e) => setError(e instanceof Error ? e.message : "Error al cargar"));
  }, [cargar]);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    const listarPersonal = async () => {
      const personas: Array<{ id: number; nombre: string }> = [];
      for (let page = 1; ; page++) {
        const res = await fetch(buildApiUrl(`users?limit=100&page=${page}`), {
          headers: { Authorization: `Bearer ${token}` }, credentials: "include",
        });
        if (!res.ok) throw new Error("No se pudo cargar la lista de personas.");
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.data || data?.items || [];
        const nuevos = list.filter((u: any) => u.id && u.nombre && !personas.some((p) => p.id === u.id));
        personas.push(...nuevos.map((u: any) => ({ id: u.id, nombre: u.nombre })));
        if (list.length < 100 || !nuevos.length || (data.total != null && personas.length >= data.total)) break;
      }
      if (!cancelado) setPersonas(personas);
    };
    void listarPersonal().catch((e) => { if (!cancelado) setError(e instanceof Error ? e.message : "No se pudo cargar la lista de personas."); });
    return () => { cancelado = true; };
  }, [token]);

  const totales = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const r of rows) {
      if (r.estado === "CANCELADA") continue;
      const nombre = r.user?.nombre || String(r.userId);
      const cur = map.get(nombre) || {};
      cur[r.tipo] = (cur[r.tipo] || 0) + 1;
      map.set(nombre, cur);
    }
    return [...map.entries()];
  }, [rows]);

  const ejecutar = async (accion: () => Promise<void>) => {
    if (ocupado) return;
    setOcupado(true);
    setOk(null);
    try { await accion(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar la acción."); }
    finally { setOcupado(false); }
  };

  const alta = async () => {
    if (!token) return;
    setError(null);
    setOk(null);
    const res = await fetch(buildApiUrl("hr/incidencias"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        userId: Number(form.userId),
        fecha: form.fecha,
        tipo: form.tipo,
        concepto: form.concepto,
        cantidad: form.cantidad || undefined,
        monto: form.monto || undefined,
        semanaNomina: semana,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message || "No se pudo registrar.");
    }
    setForm((f) => ({ ...f, concepto: "", cantidad: "", monto: "" }));
    setOk("Incidencia registrada.");
    await cargar();
  };

  const aplicar = async () => {
    if (!token) return;
    setError(null);
    const res = await fetch(buildApiUrl("hr/incidencias/aplicar-semana"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ semana }),
    });
    if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.message || "No se pudo aplicar a prenómina."); }
    const out = await res.json();
    setOk(`Aplicadas ${out.aplicadas} incidencias a prenómina.`);
    await cargar();
  };

  const importar = async (file: File) => {
    if (!token) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(buildApiUrl("hr/incidencias/importar"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
      body: fd,
    });
    if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.message || "No se pudo importar el Excel."); }
    const out = await res.json();
    setOk(`Importadas ${out.creadas}. No reconocidas: ${out.noReconocidas?.length || 0}.`);
    await cargar();
  };

  return (
    <div style={{ display: "grid", gap: 16, padding: "16px 20px", width: "100%", boxSizing: "border-box", minWidth: 0, maxWidth: 1200, margin: "0 auto" }}>
      <HrModuleRail />
      <header>
        <p style={{ margin: 0, color: "var(--ds-muted, var(--text-secondary))", fontSize: 13 }}>RR. HH. · Bitácora</p>
        <h1 style={{ margin: "4px 0 0", fontSize: 28 }}>Incidencias de personal</h1>
        <p style={{ marginTop: 6, color: "var(--ds-muted, var(--text-secondary))" }}>
          Entrada única para faltas, permisos, descuentos y extras. Alimenta la prenómina semanal.
        </p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", minWidth: 0 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Semana (lunes)
          <input type="date" disabled={loading || ocupado} value={semana} onChange={(e) => setSemana(lunesDe(e.target.value || isoLocal()))} />
        </label>
        <button type="button" disabled={!puedeEscribir || ocupado || loading} onClick={() => void ejecutar(aplicar)}>
          Aplicar a prenómina
        </button>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Importar Excel
          <input
            style={{ maxWidth: "100%", minWidth: 0 }}
            type="file"
            accept=".xlsx"
            disabled={!puedeEscribir || ocupado}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void ejecutar(() => importar(f));
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {error ? <div role="alert" style={{ color: "var(--ds-danger, var(--danger))" }}>{error} <button type="button" disabled={loading} onClick={() => cargar().catch((e) => setError(e.message))}>Reintentar</button></div> : null}
      {ok ? <p role="status" style={{ color: "var(--ds-success, var(--success))" }}>{ok}</p> : null}

      {!puedeEscribir ? <p>Solo RH o dirección pueden registrar y aplicar incidencias.</p> : null}
      <section style={{ display: "grid", minWidth: 0, gap: 8, padding: 16, border: "1px solid var(--ds-border, var(--border))", borderRadius: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Alta rápida</h2>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Persona
            <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              <option value="">Elige…</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Fecha
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Tipo
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>{t.toLowerCase().replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Cantidad
            <input value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Monto
            <input value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, gridColumn: "1 / -1" }}>
            Concepto
            <input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
          </label>
        </div>
        <button type="button" disabled={!puedeEscribir || ocupado || !form.userId || !form.fecha || form.concepto.trim().length < 2} onClick={() => void ejecutar(alta)}>
          Registrar
        </button>
      </section>

      {loading ? <p role="status">Cargando incidencias…</p> : null}
      <section aria-busy={loading} style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              <th align="left">Fecha</th>
              <th align="left">Persona</th>
              <th align="left">Tipo</th>
              <th align="left">Concepto</th>
              <th align="right">Cant.</th>
              <th align="right">Monto</th>
              <th align="left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{String(r.fecha).slice(0, 10)}</td>
                <td>{r.user?.nombre || r.userId}</td>
                <td>{r.tipo}</td>
                <td>{r.concepto}</td>
                <td align="right">{r.cantidad ?? "—"}</td>
                <td align="right">{r.monto ?? "—"}</td>
                <td>{r.estado}</td>
              </tr>
            ))}
            {!loading && !error && !rows.length ? (
              <tr>
                <td colSpan={7}>Sin incidencias en esta semana.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {totales.length ? (
        <section>
          <h2 style={{ fontSize: 18 }}>Totales por persona</h2>
          <ul>
            {totales.map(([nombre, tipos]) => (
              <li key={nombre}>
                <strong>{nombre}</strong>: {Object.entries(tipos).map(([t, n]) => `${t} ×${n}`).join(", ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
