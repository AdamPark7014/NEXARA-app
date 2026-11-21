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
import { Alert, Badge, Button, ButtonLink, Card, CardHead, Field, Input, Select, Textarea } from "@/components/base";
import s from "@/components/hr/rh-legal.module.css";

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
  const requestId = useRef(0);
  const [items, setItems] = useState<Medida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const permitido = ["rh", "ceo", "dir_admin", "super_admin"].includes(String(user?.roleKey ?? ""));
  const direccion = ["ceo", "dir_admin", "super_admin"].includes(String(user?.roleKey ?? ""));
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
    if (!token || !permitido) { setItems([]); setLoading(false); return; }
    const request = ++requestId.current;
    setItems([]); setPersonas([]);
    setLoading(true);
    setError(null);
    try {
      const [res, rUsers] = await Promise.all([
        apiRequest("hr/medidas-disciplinarias", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }),
        apiRequest("users/hr-staff", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }),
      ]);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (request !== requestId.current) return;
      setItems(data);
      if (!rUsers.ok) throw new Error("No se pudo cargar el personal. Reintenta la carga.");
      if (rUsers.ok) {
        const raw = await rUsers.json();
        const list = Array.isArray(raw) ? raw : raw?.data ?? raw?.items ?? [];
        if (request !== requestId.current) return;
        setPersonas(list.map((u: any) => ({ id: u.id, nombre: u.nombre })).filter((u: any) => u.id && u.nombre));
      }
    } catch (e) {
      if (request === requestId.current) setError(formatApiError(e, "No se pudieron cargar las medidas."));
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [token, permitido]);

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
      const res = await apiRequest("hr/medidas-disciplinarias", {
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
    } finally { setSaving(false); }
  };

  if (!token) return <Alert tone="info">Inicia sesión para continuar.</Alert>;
  if (!permitido) return <Alert tone="danger" role="alert">Solo RH o dirección pueden consultar esta información.</Alert>;
  const faltaParaRegistrar = !form.userId || form.hechos.trim().length < 10;
  return (
    <div className={s.page}>
      <PageHeader
        title="Medidas disciplinarias"
        subtitle="Amonestación, acta y suspensión hasta 8 días. Las multas al trabajador están prohibidas (art. 107 LFT); los descuentos solo proceden por los supuestos del art. 110."
        density="ops"
        actions={
          <>
            <ButtonLink variant="ghost" href="/erp/hr/cargos-perdida">Cargos por pérdida</ButtonLink>
            <ExcelExportadorDinamico
              disabled={loading || Boolean(error)}
              preferenciaKey="nx-excel-cols-hr-medidas"
              titulo="Medidas disciplinarias"
              filename="medidas-disciplinarias"
              rows={items.map((m) => ({
                fecha: String(m.createdAt),
                persona: m.user?.nombre ?? "",
                tipo: m.tipo,
                estado: m.estado,
                hechos: m.hechos,
              }))}
              estadoKey="estado"
              estados={["BORRADOR","NOTIFICADA","FIRMADA","CERRADA","ANULADA"].map(value => ({value, label: ETIQUETAS_RH[value]}))}
              getPersonaArea={r => r.persona}
              getFecha={(r) => r.fecha}
              generadoPor={(user as { nombre?: string } | null)?.nombre}
              columns={[
                { key: "fecha", label: "Fecha" },
                { key: "persona", label: "Persona" },
                { key: "tipo", label: "Tipo", etiquetas: ETIQUETAS_RH },
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
        <CardHead title="Registrar medida" subtitle="Queda en el expediente de la persona." />
        <div className={s.form}>
          <Field label="Persona" required>
            <Select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              <option value="">Elige…</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Tipo" required>
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="AMONESTACION_VERBAL">Amonestación verbal</option>
              <option value="AMONESTACION_ESCRITA">Amonestación escrita</option>
              <option value="ACTA_ADMINISTRATIVA">Acta administrativa</option>
              <option value="SUSPENSION">Suspensión (1 a 8 días)</option>
            </Select>
          </Field>
          <div className={s.ancho}>
            <Field label="Hechos" required hint="Qué pasó, cuándo y dónde. Mínimo 10 letras.">
              <Textarea rows={4} value={form.hechos} onChange={(e) => setForm({ ...form, hechos: e.target.value })} />
            </Field>
          </div>
          {form.tipo === "ACTA_ADMINISTRATIVA" ? (
            <>
              <Field label="Testigos">
                <Textarea rows={2} value={form.testigos} onChange={(e) => setForm({ ...form, testigos: e.target.value })} />
              </Field>
              <Field label="Descargo del trabajador">
                <Textarea rows={2} value={form.descargo} onChange={(e) => setForm({ ...form, descargo: e.target.value })} />
              </Field>
            </>
          ) : null}
          {form.tipo === "SUSPENSION" ? (
            <Field label="Días de suspensión" hint="De 1 a 8.">
              <Input type="number" min={1} max={8} value={form.diasSuspension} onChange={(e) => setForm({ ...form, diasSuspension: e.target.value })} />
            </Field>
          ) : null}
          <div className={s.pie}>
            <Button variant="primary" loading={saving} disabled={loading || faltaParaRegistrar} onClick={() => void crear()}>
              Registrar medida
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead
          title="Medidas registradas"
          subtitle={loading ? "Cargando…" : items.length ? contar(items.length, "medida") : undefined}
        />
        {!loading && !error && items.length === 0 ? (
          <div className={s.vacio}>
            <EmptyState title="No hay medidas registradas" description="Usa el formulario de arriba para registrar la primera." />
          </div>
        ) : null}
        {!loading && items.length >= 200 ? (
          <p className={s.nota} style={{ padding: "0 var(--ui-s5) var(--ui-s3)" }}>
            Se muestran los 200 registros más recientes; el Excel incluye esta lista.
          </p>
        ) : null}
        <ul className={s.lista}>
          {items.map((m) => (
            <li key={m.id} className={s.fila}>
              <div className={s.cabeza}>
                <span className={s.nombre}>{m.user?.nombre ?? "Persona"}</span>
                <Badge tone="neutral" size="sm">{ETIQUETAS_RH[m.tipo] ?? m.tipo}</Badge>
                <Badge tone="outline" size="sm">{ETIQUETAS_RH[m.estado] ?? m.estado}</Badge>
              </div>
              <p className={s.hechos}>{m.hechos}</p>
              {m.avisoReglamento ? <p className={s.aviso}>{m.avisoReglamento}</p> : null}
              {m.user?.id ? (
                <div className={s.acciones}>
                  <ButtonLink size="sm" variant="ghost" href={`/erp/hr/${m.user.id}`}>Ver expediente</ButtonLink>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
