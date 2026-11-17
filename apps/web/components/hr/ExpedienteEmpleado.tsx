"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/PageState";
import { Tag } from "@/components/ui/DataTable";
import { formatApiError } from "@/lib/erp-api";
import { obtenerExpediente, solicitarCambioRh } from "@/lib/hr-expediente-api";
import { toast } from "@/components/Toast";
import { FormField, FormGrid } from "@/components/ui/FormField";

type Props = { token: string; userId: string | number };

const inp: React.CSSProperties = {
  width: "100%", minHeight: 40, padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--foreground)", boxSizing: "border-box",
};

const etiquetas: Record<string, string> = {
  VACATION: "Vacaciones", VACACIONES: "Vacaciones", PERMISSION: "Permiso", PERMISO: "Permiso",
  SICK: "Incapacidad", PERSONAL: "Permiso personal", PENDING: "Pendiente",
  MATERNITY: "Maternidad", PATERNITY: "Paternidad", BEREAVEMENT: "Fallecimiento de un familiar",
  UNPAID: "Permiso sin goce de sueldo", OTRO: "Otro evento",
  APPROVED: "Aprobado", REJECTED: "Rechazado", CANCELLED: "Cancelado",
  ALTA: "Alta", CAMBIO_PUESTO: "Cambio de puesto", CAMBIO_JEFE: "Cambio de jefe",
  AJUSTE_SUELDO: "Ajuste de sueldo", DOCUMENTO: "Documento agregado", BAJA: "Baja",
};

const texto = (valor: string) => etiquetas[valor] ?? valor;

export default function ExpedienteEmpleado({ token, userId }: Props) {
  const [respuesta, setRespuesta] = useState<{ key: string; data: any } | null>(null);
  const scope = `${token}:${userId}`;
  const data = respuesta?.key === scope ? respuesta.data : null;
  const request = useRef(0);
  const enviando = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [puestoNuevo, setPuestoNuevo] = useState("");
  const [sueldoNuevo, setSueldoNuevo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const current = ++request.current;
    if (!token || !Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) {
      setRespuesta(null);
      setError(!token ? "Inicia sesión para consultar el expediente." : "No encontramos a esa persona.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const out = await obtenerExpediente(token, Number(userId));
      if (current !== request.current) return;
      setRespuesta({ key: `${token}:${userId}`, data: out });
      setError(null);
    } catch (e) {
      if (current !== request.current) return;
      setError(formatApiError(e, "No se pudo cargar el expediente."));
      setRespuesta(null);
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    setPuestoNuevo("");
    setSueldoNuevo("");
    void load();
    return () => { request.current++; };
  }, [load]);

  const pedirCambio = async (tipo: "CAMBIO_PUESTO" | "AJUSTE_SUELDO", valor: string) => {
    if (enviando.current) return;
    enviando.current = true;
    setBusy(true);
    try {
      await solicitarCambioRh(token, { userId: Number(userId), tipo, valor });
      toast.success("Solicitud enviada a dirección.");
      setPuestoNuevo("");
      setSueldoNuevo("");
      await load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo enviar la solicitud."));
    } finally {
      enviando.current = false;
      setBusy(false);
    }
  };

  if (!token) return <EmptyState title="Inicia sesión" description="Inicia sesión para consultar el expediente." />;
  if (loading && !data) return <div role="status" aria-label="Cargando expediente"><SkeletonList rows={5} /></div>;
  if (error && !data) {
    return (
      <EmptyState
        title="No se pudo cargar el expediente"
        description={error}
        action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
      />
    );
  }
  if (!data) return <EmptyState title="Sin expediente" description="No hay datos de expediente disponibles para esta persona." />;

  const { laborales, sensibles, documentos, incidencias, permisos, timeline, permisosVista } = data;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && (
        <InlineAlert
          variant="warning"
          message={error}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
        />
      )}

      <Section title="Datos laborales">
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12, margin: 0 }}>
          {[
            ["Número NEX", laborales.employeeNumber],
            ["Puesto", laborales.puesto],
            ["Área", laborales.area],
            ["Jefe", laborales.manager?.nombre],
            ["Ingreso", laborales.fechaIngreso ? new Date(laborales.fechaIngreso).toLocaleDateString("es-MX") : null],
            ["Contrato", laborales.tipoContrato],
            ["Estatus RH", laborales.estadoRRHH],
            ["Fin de contrato", laborales.contratoVenceAt ? new Date(laborales.contratoVenceAt).toLocaleDateString("es-MX") : null],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{label}</dt>
              <dd style={{ margin: "4px 0 0" }}>{value || "Sin registrar"}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {permisosVista?.sensibles ? (
        <Section title="Datos personales (solo RH y dirección)">
          {!sensibles ? (
            <InlineAlert variant="info" dense message="Aún no hay ficha sensible capturada." />
          ) : (
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12, margin: 0 }}>
              {[
                ["RFC", sensibles.rfc],
                ["CURP", sensibles.curp],
                ["NSS", sensibles.nss],
                ["Teléfono", sensibles.telefono],
                ["Domicilio", [sensibles.direccion, sensibles.colonia, sensibles.ciudad].filter(Boolean).join(", ")],
                ["Emergencia", [sensibles.contactoEmergenciaNombre, sensibles.contactoEmergenciaTelefono].filter(Boolean).join(" · ")],
                ["Sueldo semanal", sensibles.sueldoSemanal != null ? String(sensibles.sueldoSemanal) : null],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{label}</dt>
                  <dd style={{ margin: "4px 0 0" }}>{value || "Sin registrar"}</dd>
                </div>
              ))}
            </dl>
          )}
          {permisosVista.puedeEditar && (
            <div style={{ marginTop: 16 }}>
              <FormGrid>
                <FormField label="Solicitar cambio de puesto">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={inp} value={puestoNuevo} onChange={(e) => setPuestoNuevo(e.target.value)} placeholder="Puesto nuevo" />
                    <Button size="sm" disabled={busy || !puestoNuevo.trim()} onClick={() => void pedirCambio("CAMBIO_PUESTO", puestoNuevo)}>Enviar</Button>
                  </div>
                </FormField>
                <FormField label="Solicitar ajuste de sueldo (aprueba dirección)">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={inp} value={sueldoNuevo} onChange={(e) => setSueldoNuevo(e.target.value)} placeholder="Sueldo semanal" inputMode="decimal" />
                    <Button size="sm" disabled={busy || !sueldoNuevo.trim()} onClick={() => void pedirCambio("AJUSTE_SUELDO", sueldoNuevo)}>Enviar</Button>
                  </div>
                </FormField>
              </FormGrid>
            </div>
          )}
        </Section>
      ) : (
        <InlineAlert variant="info" dense message="Los datos personales sensibles solo los ven RH y dirección." />
      )}

      <Section title="Documentos del expediente">
        {!documentos?.length ? (
          <EmptyState title="Sin documentos" description="INE, comprobante, contrato, CSF, acta, CURP o NSS." />
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {documentos.map((d: any) => (
              <li key={d.id} style={{ marginBottom: 6 }}>
                <Tag size="sm">{d.tipo}</Tag>{" "}
                {typeof d.archivoUrl === "string" && (/^https:\/\//i.test(d.archivoUrl) || /^\/uploads\//.test(d.archivoUrl))
                  ? <a href={d.archivoUrl} target="_blank" rel="noreferrer">Ver archivo</a>
                  : <span>Archivo no disponible</span>}
                {d.expiresAt ? ` · vence ${new Date(d.expiresAt).toLocaleDateString("es-MX")}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Incidencias">
        {!incidencias?.length ? (
          <p style={{ color: "var(--text-tertiary)", margin: 0 }}>Sin incidencias registradas.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {incidencias.map((i: any) => (
              <li key={i.id}>{new Date(i.fecha).toLocaleDateString("es-MX")} · {i.tipo} · {i.concepto}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Permisos y vacaciones">
        {!permisos?.length ? (
          <p style={{ color: "var(--text-tertiary)", margin: 0 }}>Sin solicitudes.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {permisos.map((p: any) => (
              <li key={p.id}>{texto(p.type)} · {texto(p.status)} · {new Date(p.startDate).toLocaleDateString("es-MX")} → {new Date(p.endDate).toLocaleDateString("es-MX")}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Línea de tiempo">
        {!timeline?.length ? (
          <p style={{ color: "var(--text-tertiary)", margin: 0 }}>Aún no hay eventos registrados.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {timeline.map((e: any) => (
              <li key={e.id}>
                {new Date(e.createdAt).toLocaleString("es-MX")} · {texto(e.tipo)}
                {e.actor?.nombre ? ` · ${e.actor.nombre}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
