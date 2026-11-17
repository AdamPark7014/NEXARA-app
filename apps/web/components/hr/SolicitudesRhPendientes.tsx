"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import { SkeletonList } from "@/components/PageState";
import { decidirSolicitudRh, listarMisSolicitudesRh } from "@/lib/hr-expediente-api";
import { formatApiError } from "@/lib/erp-api";
import s from "../approvals/BandejaUnica.module.css";

type Solicitud = { id: number; tipo: string; user?: { nombre?: string }; payload?: Record<string, unknown> };
const etiquetas: Record<string, string> = {
  CAMBIO_PUESTO: "Cambio de puesto", CAMBIO_JEFE: "Cambio de jefe", AJUSTE_SUELDO: "Ajuste de sueldo",
  VACACIONES: "Vacaciones", PERMISO: "Permiso",
};

export default function SolicitudesRhPendientes({ token }: { token: string }) {
  const [data, setData] = useState<Solicitud[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [rechazo, setRechazo] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const lock = useRef(false);
  const version = useRef(0);

  const cargar = useCallback(async () => {
    const actual = ++version.current;
    setData(null);
    setError(null);
    if (!token) return;
    try {
      const out = await listarMisSolicitudesRh(token);
      if (actual === version.current) setData(Array.isArray(out) ? out : []);
    } catch (e) {
      if (actual === version.current) setError(formatApiError(e, "No se pudieron cargar las solicitudes de personal."));
    }
  }, [token]);

  useEffect(() => {
    void cargar();
    return () => { version.current++; };
  }, [cargar, tick]);

  const decidir = async (id: number, aprobar: boolean) => {
    if (lock.current) return;
    if (!aprobar && motivo.trim().length < 3) {
      setError("Escribe un motivo de al menos 3 caracteres.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await decidirSolicitudRh(token, id, aprobar, aprobar ? undefined : motivo.trim());
      setRechazo(null);
      setMotivo("");
      await cargar();
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar la decisión."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  if (!token) return null;
  return <div id="personal">
    <Section title="Solicitudes de personal" actions={<Button variant="secondary" disabled={busy} onClick={() => setTick((n) => n + 1)}>Actualizar personal</Button>}>
      {error && <InlineAlert variant="danger" message={error} action={<Button variant="secondary" disabled={busy} onClick={() => setTick((n) => n + 1)}>Reintentar</Button>} />}
      {!data && !error ? <div role="status" aria-label="Cargando solicitudes de personal"><SkeletonList rows={2} /></div> : null}
      {data?.length === 0 ? <EmptyState title="Sin solicitudes de personal" description="No tienes cambios, vacaciones ni permisos pendientes de decisión." /> : null}
      <div className={s.rejilla}>
        {data?.map((solicitud) => <article key={solicitud.id} className={s.tarjeta}>
          <h3 className={s.titulo}>{etiquetas[solicitud.tipo] ?? "Solicitud de personal"} · {solicitud.user?.nombre ?? "Persona"}</h3>
          {solicitud.tipo === "CAMBIO_PUESTO" ? <p className={s.resumen}>Puesto propuesto: {String(solicitud.payload?.puestoNuevo ?? "Sin registrar")}</p> : null}
          {solicitud.tipo === "CAMBIO_JEFE" ? <p className={s.resumen}>Jefe propuesto: {String(solicitud.payload?.jefeNombre ?? "Sin registrar")}</p> : null}
          {solicitud.tipo === "AJUSTE_SUELDO" ? <p className={s.resumen}>Sueldo semanal propuesto: {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(solicitud.payload?.sueldoNuevo ?? 0))}</p> : null}
          {solicitud.tipo === "VACACIONES" || solicitud.tipo === "PERMISO" ? <p className={s.resumen}>Del {String(solicitud.payload?.startDate ?? "sin fecha")} al {String(solicitud.payload?.endDate ?? "sin fecha")}</p> : null}
          <Button variant="primary" disabled={busy} onClick={() => void decidir(solicitud.id, true)}>Aprobar</Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setRechazo(solicitud.id); setMotivo(""); }}>Rechazar</Button>
          {rechazo === solicitud.id ? <>
            <label>Motivo del rechazo<textarea aria-label="Motivo del rechazo" value={motivo} disabled={busy} onChange={(e) => setMotivo(e.target.value)} /></label>
            <Button variant="danger" disabled={busy || motivo.trim().length < 3} onClick={() => void decidir(solicitud.id, false)}>Confirmar rechazo</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setRechazo(null)}>Cancelar rechazo</Button>
          </> : null}
        </article>)}
      </div>
    </Section>
  </div>;
}
