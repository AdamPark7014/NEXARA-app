"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/components/UserContext";
import { apiRequest } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { ETIQUETAS_RH } from "@/lib/hr-etiquetas";
import { contar } from "@/lib/plural";
import ExcelExportadorDinamico from "@/components/excel/ExcelExportadorDinamico";
import HrModuleRail from "@/components/hr/HrModuleRail";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import PedirTexto, { type PedirTextoEstado } from "@/components/ui/PedirTexto";
import { Alert, Badge, Button, ButtonLink, Card, CardHead, Field, Input, Select, Textarea } from "@/components/base";
import s from "@/components/hr/rh-legal.module.css";

const pesos = (n: number | string) =>
  `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const [pedir, setPedir] = useState<PedirTextoEstado | null>(null);
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

  /** Llamada que cambia un cargo: avisa si el servidor la rechaza y recarga la lista. */
  const cambiar = async (ruta: string, init: RequestInit, hecho?: string) => {
    const r = await auth(ruta, init);
    if (!r.ok) throw new Error(await r.text());
    if (hecho) setOk(hecho);
    await cargar();
  };

  if (!token) return <Alert tone="info">Inicia sesión para continuar.</Alert>;
  if (!permitido) return <Alert tone="danger" role="alert">Solo RH o dirección pueden consultar esta información.</Alert>;
  const faltaParaRegistrar =
    !form.userId || form.hechos.trim().length < 10 || !form.actividadId || !form.evidenciaUrl.trim() || !form.descargo.trim() || Number(form.montoTotal) <= 0;
  return (
    <div className={s.page}>
      <PageHeader
        title="Cargos por pérdida"
        subtitle="No es castigo: es la deuda del art. 110 fr. I cuando hubo pérdida o daño a la empresa. Tope: un mes de salario; cada semana, hasta 30 % del excedente del mínimo. Requiere conformidad firmada en PDF."
        density="ops"
        actions={
          <>
            <ButtonLink variant="ghost" href="/erp/hr/medidas">Medidas disciplinarias</ButtonLink>
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
          </>
        }
      />

      <HrModuleRail />

      {error ? (
        <Alert tone="danger" role="alert" action={<Button size="sm" variant="secondary" onClick={() => void cargar()}>Reintentar</Button>}>
          {error}
        </Alert>
      ) : null}
      {ok ? <Alert tone="success" role="status" onDismiss={() => setOk(null)}>{ok}</Alert> : null}

      <Card>
        <CardHead title="Registrar cargo" subtitle="Queda en borrador hasta que subas la conformidad firmada y lo mandes a dirección." />
        <div className={s.form}>
          <Field label="Persona" required>
            <Select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              <option value="">Elige…</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Monto de la pérdida" required hint="En pesos.">
            <Input type="number" min={1} step="0.01" inputMode="decimal" value={form.montoTotal} onChange={(e) => setForm({ ...form, montoTotal: e.target.value })} />
          </Field>
          <div className={s.ancho}>
            <Field label="Qué se perdió o dañó y cómo ocurrió" required hint="Mínimo 10 letras.">
              <Textarea rows={4} value={form.hechos} onChange={(e) => setForm({ ...form, hechos: e.target.value })} />
            </Field>
          </div>
          <Field label="Número de la actividad" required hint="El número que aparece en la dirección de la actividad, por ejemplo 482.">
            <Input inputMode="numeric" value={form.actividadId} onChange={(e) => setForm({ ...form, actividadId: e.target.value })} />
          </Field>
          <Field label="Enlace a la evidencia" required hint="Pega el enlace de la foto o del documento.">
            <Input type="url" inputMode="url" placeholder="https://…" value={form.evidenciaUrl} onChange={(e) => setForm({ ...form, evidenciaUrl: e.target.value })} />
          </Field>
          <div className={s.ancho}>
            <Field label="Descargo del trabajador" required hint="Lo que la persona dice sobre lo ocurrido.">
              <Textarea rows={2} value={form.descargo} onChange={(e) => setForm({ ...form, descargo: e.target.value })} />
            </Field>
          </div>
          <div className={s.pie}>
            <Button variant="primary" loading={saving} disabled={loading || faltaParaRegistrar} onClick={() => void crear()}>
              Registrar cargo
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead
          title="Cargos registrados"
          subtitle={loading ? "Cargando…" : items.length ? contar(items.length, "cargo") : undefined}
        />
        {!loading && !error && items.length === 0 ? (
          <div className={s.vacio}>
            <EmptyState title="No hay cargos registrados" description="Completa la evidencia y el descargo para registrar uno." />
          </div>
        ) : null}
        {!loading && items.length >= 200 ? (
          <p className={s.nota} style={{ padding: "0 var(--ui-s5) var(--ui-s3)" }}>
            Se muestran los 200 registros más recientes; el Excel incluye esta lista.
          </p>
        ) : null}
        <ul className={s.lista}>
          {items.map((c) => (
            <li key={c.id} className={s.fila}>
              <div className={s.cabeza}>
                <span className={s.nombre}>{c.user?.nombre ?? "Persona"}</span>
                <span className={s.monto}>{pesos(c.montoTotal)}</span>
                <Badge tone="outline" size="sm">{ETIQUETAS_RH[c.estado] ?? c.estado}</Badge>
              </div>
              <p className={s.hechos}>{c.hechos}</p>
              {c.planCuotasJson?.topeSemanal != null ? (
                <p className={s.nota}>
                  Plan: {contar(c.planCuotasJson.cuotas?.length ?? 0, "cuota")} · tope semanal {pesos(c.planCuotasJson.topeSemanal)} · tope del mes {pesos(c.planCuotasJson.topeMensual ?? 0)}
                </p>
              ) : null}
              {c.estado === "BORRADOR" ? (
                <div className={s.acciones}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setPedir({
                        titulo: "Adjuntar la conformidad firmada",
                        etiqueta: "Enlace al PDF",
                        descripcion: "Pega el enlace del PDF con la firma de la persona.",
                        placeholder: "https://…",
                        confirmar: "Guardar",
                        minimo: 8,
                        fn: (pdfUrl) =>
                          cambiar(`hr/cargos-perdida/${c.id}/conformidad`, { method: "PATCH", body: JSON.stringify({ pdfUrl }) }, "Conformidad guardada."),
                      })
                    }
                  >
                    Adjuntar conformidad
                  </Button>
                  <Button
                    size="sm"
                    variant="tonal"
                    onClick={() =>
                      void cambiar(`hr/cargos-perdida/${c.id}/enviar`, { method: "POST", body: "{}" }, "Enviado a dirección.").catch((e) => setError(formatApiError(e)))
                    }
                  >
                    Enviar a dirección
                  </Button>
                </div>
              ) : null}
              {direccion && c.estado === "PENDIENTE_DIRECCION" ? (
                <div className={s.acciones}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setPedir({
                        titulo: "Rechazar el cargo",
                        etiqueta: "Motivo del rechazo",
                        confirmar: "Rechazar",
                        minimo: 1,
                        peligro: true,
                        fn: (motivo) =>
                          cambiar(`hr/cargos-perdida/${c.id}/decidir`, { method: "POST", body: JSON.stringify({ accion: "rechazar", motivo }) }, "Cargo rechazado."),
                      })
                    }
                  >
                    Rechazar
                  </Button>
                  <Button
                    size="sm"
                    variant="tonal"
                    onClick={() =>
                      void cambiar(`hr/cargos-perdida/${c.id}/decidir`, { method: "POST", body: JSON.stringify({ accion: "aprobar" }) }, "Cargo aprobado.").catch((e) => setError(formatApiError(e)))
                    }
                  >
                    Aprobar
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <PedirTexto estado={pedir} onCerrar={() => setPedir(null)} />
    </div>
  );
}
