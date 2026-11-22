"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HrModuleRail from "@/components/hr/HrModuleRail";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { Alert, Button, Card, CardHead, DateInput, Field, Input, Select, StatusBadge } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { lunesDe } from "@/lib/control-nomina";
import { contar } from "@/lib/plural";
import s from "./incidencias.module.css";

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

/** Como se lee en pantalla; el valor que viaja al servidor no cambia. */
const TIPO_TEXTO: Record<string, string> = {
  FALTA_JUSTIFICADA: "Falta justificada",
  FALTA_INJUSTIFICADA: "Falta injustificada",
  RETARDO: "Retardo",
  PERMISO_CON_GOCE: "Permiso con goce",
  PERMISO_SIN_GOCE: "Permiso sin goce",
  INCAPACIDAD: "Incapacidad",
  VACACIONES: "Vacaciones",
  HORAS_EXTRA: "Horas extra",
  BONO: "Bono",
  DESCUENTO: "Descuento",
  PRESTAMO: "Préstamo",
  OTRO: "Otro",
};

// Sin `export`: una página de Next solo puede exportar lo suyo (default, metadata…); con otro
// nombre la compilación de producción falla («is not a valid Page export field»).
function textoTipo(tipo: string): string {
  if (TIPO_TEXTO[tipo]) return TIPO_TEXTO[tipo];
  const limpio = tipo.toLowerCase().replace(/_/g, " ");
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

const ESTADO: Record<string, { texto: string; tono: "neutral" | "success" | "danger" }> = {
  REGISTRADA: { texto: "Registrada", tono: "neutral" },
  APLICADA: { texto: "En prenómina", tono: "success" },
  CANCELADA: { texto: "Cancelada", tono: "danger" },
};

/** «21 nov 2026» a partir del día guardado, sin que la zona horaria lo recorra. */
function textoDia(fecha: string): string {
  const dia = String(fecha).slice(0, 10);
  const d = new Date(`${dia}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dia;
  return d.toLocaleDateString("es-MX", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

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
  const archivo = useRef<HTMLInputElement>(null);
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

  const columnas: Column<Incidencia>[] = [
    { key: "fecha", label: "Fecha", width: 120, render: (r) => <span className={s.fecha}>{textoDia(r.fecha)}</span> },
    { key: "persona", label: "Persona", render: (r) => <span className={s.fuerte}>{r.user?.nombre || `Persona ${r.userId}`}</span> },
    { key: "tipo", label: "Tipo", width: 170, render: (r) => textoTipo(r.tipo) },
    { key: "concepto", label: "Concepto", render: (r) => r.concepto },
    { key: "cantidad", label: "Cantidad", width: 96, align: "right", numeric: true, render: (r) => r.cantidad ?? "—" },
    { key: "monto", label: "Monto", width: 110, align: "right", numeric: true, render: (r) => r.monto ?? "—" },
    {
      key: "estado",
      label: "Estado",
      width: 130,
      render: (r) => {
        const e = ESTADO[r.estado] ?? { texto: textoTipo(r.estado), tono: "neutral" as const };
        return <StatusBadge label={e.texto} tone={e.tono} size="sm" dot />;
      },
    },
  ];
  const faltaParaRegistrar = !form.userId || !form.fecha || form.concepto.trim().length < 2;

  return (
    <div className={s.page}>
      <PageHeader
        title="Incidencias de personal"
        subtitle="Entrada única para faltas, permisos, descuentos y extras. Alimenta la prenómina semanal."
        density="ops"
        actions={
          <>
            <input
              ref={archivo}
              className="ui-sr-only"
              type="file"
              accept=".xlsx"
              aria-label="Archivo de Excel con incidencias"
              tabIndex={-1}
              disabled={!puedeEscribir || ocupado}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void ejecutar(() => importar(f));
                e.target.value = "";
              }}
            />
            <Button variant="secondary" disabled={!puedeEscribir || ocupado} onClick={() => archivo.current?.click()}>
              Importar Excel
            </Button>
            <Button variant="primary" disabled={!puedeEscribir || ocupado || loading} onClick={() => void ejecutar(aplicar)}>
              Aplicar a prenómina
            </Button>
          </>
        }
      />

      <HrModuleRail />

      <div className={s.semana}>
        <Field label="Semana" hint="Se toma el lunes de la semana que elijas.">
          <DateInput
            disabled={loading || ocupado}
            value={semana}
            onChange={(e) => setSemana(lunesDe(e.target.value || isoLocal()))}
          />
        </Field>
      </div>

      {error ? (
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button size="sm" variant="secondary" disabled={loading} onClick={() => cargar().catch((e) => setError(e.message))}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}
      {ok ? (
        <Alert tone="success" role="status" onDismiss={() => setOk(null)}>
          {ok}
        </Alert>
      ) : null}
      {!puedeEscribir ? <Alert tone="info">Solo RH o dirección pueden registrar y aplicar incidencias.</Alert> : null}

      <Card>
        <CardHead title="Alta rápida" subtitle="Queda en la semana elegida arriba." />
        <div className={s.alta}>
          <div className={s.campos}>
            <Field label="Persona" required>
              <Select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                <option value="">Elige…</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha" required>
              <DateInput value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
            <Field label="Tipo" required>
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>{textoTipo(t)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Cantidad" hint="Días u horas, si aplica.">
              <Input inputMode="decimal" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
            </Field>
            <Field label="Monto" hint="En pesos, si aplica.">
              <Input inputMode="decimal" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
            </Field>
            <div className={s.ancho}>
              <Field label="Concepto" required>
                <Input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className={s.pie}>
            <Button variant="primary" disabled={!puedeEscribir || ocupado || faltaParaRegistrar} onClick={() => void ejecutar(alta)}>
              Registrar
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead
          title="Incidencias de la semana"
          subtitle={loading ? "Cargando incidencias…" : rows.length ? contar(rows.length, "incidencia") : undefined}
        />
        <DataTable
          columns={columnas}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          density="compact"
          flush
          ariaLabel="Incidencias de la semana"
          emptyTitle="Sin incidencias en esta semana"
          emptyDescription="Lo que registres o importes para esta semana aparece aquí."
        />
      </Card>

      {totales.length ? (
        <Card>
          <CardHead title="Totales por persona" />
          <ul className={s.totales}>
            {totales.map(([nombre, tipos]) => (
              <li key={nombre}>
                <span className={s.fuerte}>{nombre}</span>
                <span className={s.tenue}>
                  {Object.entries(tipos).map(([t, n]) => `${textoTipo(t)} × ${n}`).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
