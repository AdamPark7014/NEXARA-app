"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import ContextRail from "@/components/ui/ContextRail";
import { Tag } from "@/components/ui/DataTable";
import { SkeletonRows } from "@/components/base";
import { toast } from "@/components/Toast";
import VehicleCheckoutForm, { type ChecklistFormPayload } from "@/components/VehicleCheckoutForm";
import { useUser } from "@/components/UserContext";
import { asList, erpFetch, formatApiError } from "@/lib/erp-api";
import {
  MIS_VEHICULOS_PATH,
  VEHICULOS_GPS_PATH,
  VEHICULOS_PATH,
  puedeVerGpsDireccion,
} from "@/lib/recursos-core";
import {
  enviarChecklist,
  etiquetaEstatus,
  formatoFecha,
  formatoKm,
  misVehiculos,
  nivelDeCombustible,
  solicitarVehiculo,
  type AsignacionActiva,
  type MisVehiculos,
  type VehiculoFlota,
} from "@/lib/vehiculos-api";
import styles from "../vehiculos-core.module.css";

type Actividad = { id: number; anNumber?: string | null; titulo?: string | null };

type Captura = {
  modo: "salida" | "devolucion";
  path: string;
  titulo: string;
  odometroInicio: number | null;
};

const ENTREGA_LEGIBLE: Record<string, string> = {
  "En revision": "En revisión",
};

/** Mis vehículos: pedir uno, registrar la salida y registrar el regreso. */
export default function MisVehiculosPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const verGps = puedeVerGpsDireccion(user);

  const [datos, setDatos] = useState<MisVehiculos>({ activa: null, solicitudes: [], disponibles: [] });
  const [cargando, setCargando] = useState(true);
  const [cargadoUnaVez, setCargadoUnaVez] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captura, setCaptura] = useState<Captura | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setDatos(await misVehiculos(token));
      setCargadoUnaVez(true);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar tus vehículos"));
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Una solicitud aprobada se registra contra la solicitud (`vehicles/:id/...`);
   * una toma directa del inventario, contra el vehículo
   * (`vehicles/inventory/:id/...`).
   */
  const rutaChecklist = (activa: AsignacionActiva, modo: "salida" | "devolucion") => {
    if (activa.origen === "solicitud") {
      return `vehicles/${activa.id}/${modo === "salida" ? "start-use" : "end-use"}`;
    }
    return `vehicles/inventory/${activa.vehiculo.id}/${modo === "salida" ? "checkout" : "return"}`;
  };

  const enviarCaptura = async (payload: ChecklistFormPayload) => {
    if (!captura || !token) return;
    setEnviando(true);
    try {
      await enviarChecklist(token, captura.path, payload);
      toast.success(captura.modo === "salida" ? "Salida registrada" : "Devolución registrada");
      setCaptura(null);
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo enviar el checklist"));
    } finally {
      setEnviando(false);
    }
  };

  const activa = datos.activa;
  const primeraCarga = cargando && !cargadoUnaVez;

  return (
    <div className={styles.wrap}>
      <PageHeader
        eyebrow="Core · Vehículos"
        title="Mis vehículos"
        density="ops"
        actions={
          <>
            <Button variant="ghost" onClick={() => void cargar()} disabled={cargando}>
              {cargando && cargadoUnaVez ? "Actualizando…" : "Actualizar"}
            </Button>
            <Button variant={activa ? "secondary" : "primary"} onClick={() => setPidiendo(true)}>
              Solicitar
            </Button>
          </>
        }
      />

      <ContextRail
        ariaLabel="Vehículos"
        items={[
          { id: "flotilla", label: "Flotilla", href: VEHICULOS_PATH },
          { id: "mios", label: "Mis vehículos", href: MIS_VEHICULOS_PATH, active: true },
          ...(verGps ? [{ id: "gps", label: "GPS", href: VEHICULOS_GPS_PATH }] : []),
        ]}
      />

      {error && (
        <InlineAlert
          message={error}
          variant={cargadoUnaVez ? "warning" : "danger"}
          action={
            <Button size="sm" variant="ghost" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        />
      )}

      <Section title="En uso" dense>
        {primeraCarga && <SkeletonRows rows={2} label="Cargando tu vehículo" />}
        {!primeraCarga && !activa && (
          <EmptyState
            title="Sin vehículo asignado"
            description={
              datos.disponibles.length > 0
                ? "Toma uno de los disponibles de abajo o solicita uno para una actividad."
                : "Solicita uno para tu próxima actividad."
            }
            variant="compact"
            action={
              <Button size="sm" variant="secondary" onClick={() => setPidiendo(true)}>
                Solicitar vehículo
              </Button>
            }
          />
        )}
        {!primeraCarga && activa && (
          <div style={{ display: "grid", gap: 12 }}>
            <div className={styles.viajeTop}>
              <div className={styles.filaVehiculo}>
                <span className={styles.nombre}>{activa.vehiculo.nombre}</span>
                <span className={styles.placas}>{activa.vehiculo.placas || "sin placas"}</span>
              </div>
              <Tag variant={activa.requiereSalida ? "warning" : "accent"} dot>
                {activa.requiereSalida ? "Falta salida" : "En uso"}
              </Tag>
            </div>
            {activa.requiereSalida && (
              <p className={styles.mini} style={{ margin: 0 }}>
                Antes de manejarlo, registra la salida con las fotos del vehículo y del tablero.
              </p>
            )}
            <div className={styles.datos}>
              <Dato label="Desde" valor={formatoFecha(activa.inicio)} />
              <Dato label="Hasta" valor={formatoFecha(activa.fin)} />
              <Dato label="Km salida" valor={formatoKm(activa.odometroInicio)} />
              <Dato label="Combustible" valor={nivelDeCombustible(activa.combustibleInicioPct)} />
            </div>
            <div className={styles.acciones} style={{ justifyContent: "flex-start" }}>
              {activa.requiereSalida && (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() =>
                    setCaptura({
                      modo: "salida",
                      path: rutaChecklist(activa, "salida"),
                      titulo: `Salida · ${activa.vehiculo.nombre}`,
                      odometroInicio: null,
                    })
                  }
                >
                  Registrar salida
                </Button>
              )}
              {activa.requiereDevolucion && !activa.requiereSalida && (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() =>
                    setCaptura({
                      modo: "devolucion",
                      path: rutaChecklist(activa, "devolucion"),
                      titulo: `Devolución · ${activa.vehiculo.nombre}`,
                      odometroInicio: activa.odometroInicio,
                    })
                  }
                >
                  Registrar regreso
                </Button>
              )}
            </div>
          </div>
        )}
      </Section>

      {!activa && !primeraCarga && datos.disponibles.length > 0 && (
        <Section title={`Disponibles · ${datos.disponibles.length}`} dense>
          <ul className={styles.tarjetas} aria-label="Vehículos disponibles">
            {datos.disponibles.map((v) => (
              <li key={v.id}>
                <Disponible
                  vehiculo={v}
                  onTomar={() =>
                    setCaptura({
                      modo: "salida",
                      path: `vehicles/inventory/${v.id}/checkout`,
                      titulo: `Salida · ${v.nombre}`,
                      odometroInicio: null,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Solicitudes" dense>
        {primeraCarga && <SkeletonRows rows={2} label="Cargando solicitudes" />}
        {!primeraCarga && datos.solicitudes.length === 0 && (
          <EmptyState
            title="Sin solicitudes"
            description="Cuando pidas un vehículo verás aquí si ya lo aprobaron."
            variant="compact"
          />
        )}
        {!primeraCarga && datos.solicitudes.length > 0 && (
          <ul className={styles.tarjetas} aria-label="Mis solicitudes">
            {datos.solicitudes.map((s) => {
              const est = etiquetaEstatus(s.estatusAprobacion);
              return (
                <li key={s.id} className={styles.viajeTop}>
                  <div className={styles.filaVehiculo}>
                    <span className={styles.nombre}>{s.nombreVehiculo || "Vehículo"}</span>
                    <span className={`${styles.mini} ${styles.num}`}>
                      {formatoFecha(s.fechaInicioSolicitada)} → {formatoFecha(s.fechaFinSolicitada)}
                    </span>
                  </div>
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {s.entregaEstatus && (
                      <Tag variant="neutral">{ENTREGA_LEGIBLE[s.entregaEstatus] ?? s.entregaEstatus}</Tag>
                    )}
                    <Tag variant={est.variante}>{est.texto}</Tag>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Modal
        open={Boolean(captura)}
        onClose={() => setCaptura(null)}
        title={captura?.titulo}
        maxWidth={620}
        dirty={enviando}
      >
        {captura && (
          <VehicleCheckoutForm
            mode={captura.modo}
            odometroInicio={captura.odometroInicio}
            loading={enviando}
            onSubmit={enviarCaptura}
          />
        )}
      </Modal>

      <Modal open={pidiendo} onClose={() => setPidiendo(false)} title="Solicitar vehículo" maxWidth={520}>
        <FormularioSolicitud
          token={token}
          disponibles={datos.disponibles}
          onListo={() => {
            setPidiendo(false);
            void cargar();
          }}
        />
      </Modal>
    </div>
  );
}

function Disponible({ vehiculo, onTomar }: { vehiculo: VehiculoFlota; onTomar: () => void }) {
  return (
    <div className={styles.viajeTop} style={{ alignItems: "center" }}>
      <div className={styles.filaVehiculo}>
        <span className={styles.nombre}>{vehiculo.nombre}</span>
        <span className={styles.placas}>{vehiculo.placas || "sin placas"}</span>
      </div>
      <Button variant="secondary" onClick={onTomar} aria-label={`Tomar ${vehiculo.nombre}`}>
        Tomar
      </Button>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className={styles.dato}>
      <span className={styles.datoLabel}>{label}</span>
      <span className={`${styles.datoValor} ${styles.num}`}>{valor}</span>
    </div>
  );
}

function FormularioSolicitud({
  token,
  disponibles,
  onListo,
}: {
  token: string;
  disponibles: VehiculoFlota[];
  onListo: () => void;
}) {
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [cargandoActividades, setCargandoActividades] = useState(true);
  const [actividadId, setActividadId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    void (async () => {
      try {
        const data = await erpFetch<unknown>("activities", token);
        if (vivo) setActividades(asList<Actividad>(data));
      } catch {
        if (vivo) setActividades([]);
      } finally {
        if (vivo) setCargandoActividades(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token]);

  const enviar = async () => {
    const faltan = [
      !actividadId && "actividad",
      !vehicleId && "vehículo",
      motivo.trim().length < 3 && "motivo",
      (!inicio || !fin) && "fechas",
    ].filter(Boolean);
    if (faltan.length) {
      setError(`Falta: ${faltan.join(", ")}.`);
      return;
    }
    if (new Date(fin) < new Date(inicio)) {
      setError("La fecha de regreso no puede ser antes de la salida.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await solicitarVehiculo(token, {
        actividadId: Number(actividadId),
        vehicleId: Number(vehicleId),
        motivoUso: motivo.trim(),
        fechaInicioSolicitada: new Date(inicio).toISOString(),
        fechaFinSolicitada: new Date(fin).toISOString(),
      });
      toast.success("Solicitud enviada");
      onListo();
    } catch (e) {
      setError(formatApiError(e, "No se pudo enviar la solicitud"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      {error && <InlineAlert message={error} variant="danger" onDismiss={() => setError(null)} />}
      <label className={styles.campo}>
        <span className={styles.campoLabel}>Actividad</span>
        <select
          className={styles.input}
          value={actividadId}
          onChange={(e) => setActividadId(e.target.value)}
          disabled={cargandoActividades}
        >
          <option value="">{cargandoActividades ? "Cargando actividades…" : "Elige la actividad"}</option>
          {actividades.map((a) => (
            <option key={a.id} value={a.id}>
              {[a.anNumber, a.titulo].filter(Boolean).join(" · ") || `Actividad ${a.id}`}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.campo}>
        <span className={styles.campoLabel}>Vehículo</span>
        <select className={styles.input} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">{disponibles.length ? "Elige el vehículo" : "No hay vehículos libres ahora"}</option>
          {disponibles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nombre}
              {v.placas ? ` · ${v.placas}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.campo}>
        <span className={styles.campoLabel}>Para qué lo necesitas</span>
        <input
          className={styles.input}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Visita a obra, entrega de material…"
        />
      </label>
      <div className={styles.resumen} style={{ marginBottom: 0 }}>
        <label className={styles.campo}>
          <span className={styles.campoLabel}>Sale</span>
          <input
            className={styles.input}
            type="datetime-local"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </label>
        <label className={styles.campo}>
          <span className={styles.campoLabel}>Regresa</span>
          <input
            className={styles.input}
            type="datetime-local"
            value={fin}
            min={inicio || undefined}
            onChange={(e) => setFin(e.target.value)}
          />
        </label>
      </div>
      <div className={`${styles.acciones} ${styles.accionesFijas}`}>
        <Button type="submit" variant="primary" size="lg" loading={guardando}>
          Enviar solicitud
        </Button>
      </div>
    </form>
  );
}
