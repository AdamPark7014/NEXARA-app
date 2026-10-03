"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SvgIconComponent } from "@mui/icons-material";
import AddAPhotoOutlinedIcon from "@mui/icons-material/AddAPhotoOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import MyLocationOutlinedIcon from "@mui/icons-material/MyLocationOutlined";
import PhotoLibraryOutlinedIcon from "@mui/icons-material/PhotoLibraryOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import WrongLocationOutlinedIcon from "@mui/icons-material/WrongLocationOutlined";
import { IconBadge, IconLabel } from "@/components/ui/IconBadge";
import {
  RADIO_ACTIVIDAD_M,
  fetchGeocerca,
  formatoDistancia,
  imagenADataUrl,
  justificarSalidaDeZona,
  type GeocercaAlerta,
  type GeocercaEstado,
} from "@/lib/activity-geofence";
import { formatApiError } from "@/lib/erp-api";
import { mapsUrl } from "@/lib/evidence-display";
import { Alert, Badge, Button, Textarea, type Tone } from "@/components/base";
import s from "./UbicacionActividad.module.css";

const VERDE = "var(--ui-success)";
const ROJO = "var(--ui-danger)";

/** Cada cuánto se vuelve a pedir el recorrido mientras la actividad sigue en curso. */
const REFRESCO_MS = 60_000;
/** Lecturas visibles antes de «Ver todas». */
const PUNTOS_VISIBLES = 8;

function hora(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
}

function fechaHora(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function Chip({ children, tone = "neutral", icon: Icon }: { children: ReactNode; tone?: Tone; icon?: SvgIconComponent }) {
  return (
    <Badge tone={tone} icon={Icon ? <Icon fontSize="inherit" /> : undefined}>
      {children}
    </Badge>
  );
}

/** Estado de la geocerca de quien ejecuta la actividad, con recarga periódica mientras sigue en curso. */
export function useGeocerca(token: string | null | undefined, activityId: number | null, activo: boolean) {
  const [estado, setEstado] = useState<GeocercaEstado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const peticion = useRef(0);

  const recargar = useCallback(async (): Promise<GeocercaEstado | null> => {
    if (!token || !activityId || !activo) return null;
    const id = ++peticion.current;
    setCargando(true);
    try {
      const data = await fetchGeocerca(token, activityId);
      if (id === peticion.current) {
        setEstado(data);
        setError(null);
      }
      return data;
    } catch (e) {
      if (id === peticion.current) setError(formatApiError(e, "No se pudo cargar la ubicación de la actividad"));
      return null;
    } finally {
      if (id === peticion.current) setCargando(false);
    }
  }, [token, activityId, activo]);

  useEffect(() => {
    setEstado(null);
    setError(null);
  }, [activityId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const seguimientoActivo = estado?.seguimientoActivo ?? true;
  useEffect(() => {
    if (!activo || !seguimientoActivo) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void recargar();
    }, REFRESCO_MS);
    return () => window.clearInterval(t);
  }, [activo, seguimientoActivo, recargar]);

  const actualizarAlerta = useCallback((alerta: GeocercaAlerta) => {
    setEstado((prev) =>
      prev ? { ...prev, alertas: prev.alertas.map((a) => (a.id === alerta.id ? alerta : a)) } : prev,
    );
  }, []);

  return { estado, error, cargando, recargar, actualizarAlerta };
}

export type GeocercaHook = ReturnType<typeof useGeocerca>;

/** Aviso destacado cuando la foto de salida se bloquea por estar fuera del radio. */
export function AvisoFueraDeZona({ mensaje }: { mensaje: string }) {
  return (
    <Alert
      tone="danger"
      role="alert"
      icon={<WrongLocationOutlinedIcon fontSize="inherit" />}
      title="Estás fuera de la zona de la actividad"
    >
      {mensaje}
    </Alert>
  );
}

function Dato({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: string; detalle?: ReactNode; tono?: "ok" | "mal" }) {
  return (
    <div className={s.dato}>
      <dt className={s.datoE}>{etiqueta}</dt>
      <dd className={s.datoV} data-tono={tono}>
        {valor}
      </dd>
      {detalle ? <dd className={s.datoD}>{detalle}</dd> : null}
    </div>
  );
}

/**
 * «Ubicación de la actividad»: punto de inicio, radio (500 m), última distancia, recorrido
 * reciente y salidas de zona por justificar.
 */
export default function UbicacionActividadCard({
  activityId,
  token,
  geocerca,
}: {
  activityId: number;
  token: string;
  geocerca: GeocercaHook;
}) {
  const { estado, error, cargando, recargar, actualizarAlerta } = geocerca;
  const [justificando, setJustificando] = useState<GeocercaAlerta | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 6000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const radio = estado?.radioM ?? RADIO_ACTIVIDAD_M;
  const pendientes = (estado?.alertas ?? []).filter((a) => a.status !== "JUSTIFICADA");
  const justificadas = (estado?.alertas ?? []).filter((a) => a.status === "JUSTIFICADA");
  const puntos = estado?.puntos ?? [];
  const visibles = verTodos ? puntos : puntos.slice(0, PUNTOS_VISIBLES);
  const ultimo = estado?.ultimo ?? null;
  const origen = estado?.origen ?? null;
  const mapaOrigen = origen ? mapsUrl(origen.latitude, origen.longitude) : null;

  const chipEstado =
    estado?.dentro === true ? (
      <Chip tone="success" icon={CheckCircleOutlineIcon}>
        Dentro de la zona
      </Chip>
    ) : estado?.dentro === false ? (
      <Chip tone="danger" icon={WrongLocationOutlinedIcon}>
        Fuera de la zona
      </Chip>
    ) : estado ? (
      <Chip icon={PlaceOutlinedIcon}>Sin lecturas aún</Chip>
    ) : null;

  return (
    <section
      aria-labelledby={`geocerca-titulo-${activityId}`}
      className={s.caja}
      data-alerta={pendientes.length || estado?.dentro === false ? "true" : undefined}
    >
      <header className={s.cabeza}>
        <IconBadge icon={MyLocationOutlinedIcon} size={36} />
        <div className={s.cabezaTexto}>
          <h3 id={`geocerca-titulo-${activityId}`} className={s.titulo}>
            Ubicación de la actividad
          </h3>
          <p className={s.sub}>
            {estado?.exigeMismaUbicacion === true
              ? `Mantente a no más de ${radio} m del punto donde iniciaste: la foto de salida solo se acepta dentro de ese radio.`
              : "La foto de salida lleva tu ubicación. En este tipo de actividad no hace falta que coincida con el punto de inicio."}
          </p>
        </div>
        {chipEstado}
        <Button
          size="sm"
          variant="tertiary"
          onClick={() => void recargar()}
          loading={cargando}
          aria-label="Actualizar ubicación de la actividad"
          iconStart={<RefreshIcon fontSize="inherit" />}
        >
          {cargando ? "Actualizando…" : "Actualizar"}
        </Button>
      </header>

      {error ? (
        <p role="alert" className={s.error}>
          {error}
        </p>
      ) : null}

      {!estado && !error ? <p className={s.muted}>Cargando ubicación de la actividad…</p> : null}

      {estado && !origen ? (
        <p className={s.muted}>
          Tu foto de entrada no tiene ubicación registrada, así que no hay punto de inicio contra el cual medir.
        </p>
      ) : null}

      {estado && origen ? (
        <dl className={s.datos}>
          <Dato
            etiqueta="Inicio"
            valor={hora(origen.at)}
            detalle={
              <>
                {fechaHora(origen.at)}
                {mapaOrigen ? (
                  <>
                    {" · "}
                    <a href={mapaOrigen} target="_blank" rel="noreferrer" className={s.enlace}>
                      Ver en mapa
                    </a>
                  </>
                ) : null}
              </>
            }
          />
          <Dato etiqueta="Radio permitido" valor={`${radio} m`} detalle="Alrededor del punto de inicio" />
          <Dato
            etiqueta="Última distancia"
            valor={formatoDistancia(ultimo?.distanciaM)}
            tono={estado.dentro === false ? "mal" : estado.dentro === true ? "ok" : undefined}
            detalle={ultimo ? `Lectura de las ${hora(ultimo.at)}` : "Sin lecturas de GPS todavía"}
          />
        </dl>
      ) : null}

      {aviso ? (
        <Alert tone="success" role="status" dense>
          {aviso}
        </Alert>
      ) : null}

      {pendientes.length ? (
        <div className={s.grupo}>
          <div className={s.grupoT}>
            {pendientes.length === 1 ? "Salida de zona por justificar" : `Salidas de zona por justificar (${pendientes.length})`}
          </div>
          <ul className={s.lista}>
            {pendientes.map((a) => (
              <li key={a.id} className={s.pendiente}>
                <WrongLocationOutlinedIcon aria-hidden="true" sx={{ fontSize: 22, color: ROJO, flex: "0 0 auto" }} />
                <div className={s.pendienteTexto}>
                  <div className={s.pendienteT}>Saliste de la zona a las {hora(a.detectedAt)}</div>
                  <div className={s.pendienteM}>
                    Hasta {formatoDistancia(a.maxDistanciaM)} del punto de inicio ·{" "}
                    {a.abierta ? <strong className={s.peligro}>Sigues fuera</strong> : `Regresaste a las ${hora(a.returnedAt)}`}
                  </div>
                </div>
                <Button variant="primary" onClick={() => setJustificando(a)} iconStart={<EditNoteOutlinedIcon fontSize="inherit" />}>
                  Justificar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {justificadas.length ? (
        <ul className={s.lista}>
          {justificadas.map((a) => (
            <li key={a.id} className={s.justificada}>
              <IconLabel icon={TaskAltIcon} size={16} gap={4} iconColor={VERDE}>
                <strong>Justificada</strong>
              </IconLabel>{" "}
              · salida de las {hora(a.detectedAt)}, hasta {formatoDistancia(a.maxDistanciaM)}
              {a.justificacion ? ` · «${a.justificacion}»` : ""}
              {a.fotoUrl ? " · con foto" : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {estado && origen ? (
        <div className={s.grupo}>
          <div className={s.seguimiento}>
            <span className={s.grupoT}>
              <IconLabel icon={TimelineOutlinedIcon} size={18} gap={6}>
                Seguimiento paulatino
              </IconLabel>
            </span>
            <Chip tone={estado.seguimientoActivo ? "brand" : "neutral"}>
              {estado.seguimientoActivo ? "En curso" : "Terminado"}
            </Chip>
          </div>
          {puntos.length === 0 ? (
            <p className={s.muted}>Aquí aparecen las lecturas de GPS registradas desde que iniciaste la actividad.</p>
          ) : (
            <>
              <ol aria-label="Lecturas recientes de ubicación" className={s.lecturas}>
                {visibles.map((p, i) => {
                  const fuera = p.distanciaM != null && p.distanciaM > radio;
                  return (
                    <li key={`${p.at}-${i}`} title={fechaHora(p.at)} className={s.lectura} data-fuera={fuera ? "true" : undefined}>
                      {hora(p.at)} · <strong>{formatoDistancia(p.distanciaM)}</strong>
                    </li>
                  );
                })}
              </ol>
              {puntos.length > PUNTOS_VISIBLES ? (
                <Button variant="link" size="sm" className={s.inicio} onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos}>
                  {verTodos ? "Ver menos" : `Ver las ${puntos.length} lecturas`}
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {justificando ? (
        <JustificarSalidaDialog
          token={token}
          activityId={activityId}
          alerta={justificando}
          onClose={() => setJustificando(null)}
          onDone={(actualizada) => {
            actualizarAlerta(actualizada);
            setJustificando(null);
            setAviso("Justificación enviada. Tus jefes y los responsables de la actividad ya pueden verla.");
            void recargar();
          }}
        />
      ) : null}
    </section>
  );
}

/** Motivo (obligatorio) y foto (recomendada) de una salida de zona. */
export function JustificarSalidaDialog({
  token,
  activityId,
  alerta,
  onClose,
  onDone,
}: {
  token: string;
  activityId: number;
  alerta: GeocercaAlerta;
  onClose: () => void;
  onDone: (alerta: GeocercaAlerta) => void;
}) {
  const [motivo, setMotivo] = useState(alerta.justificacion ?? "");
  const [foto, setFoto] = useState<string | null>(null);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camaraRef = useRef<HTMLInputElement | null>(null);
  const galeriaRef = useRef<HTMLInputElement | null>(null);
  const tituloId = `justificar-salida-${alerta.id}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !enviando) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, enviando]);

  const elegirFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Elige una imagen (JPG o PNG).");
      return;
    }
    setProcesandoFoto(true);
    setError(null);
    try {
      setFoto(await imagenADataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la foto");
    } finally {
      setProcesandoFoto(false);
    }
  };

  const enviar = async () => {
    const texto = motivo.trim();
    if (texto.length < 5) {
      setError("Escribe el motivo (al menos 5 caracteres).");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const actualizada = await justificarSalidaDeZona(token, activityId, alerta.id, {
        motivo: texto,
        ...(foto ? { fotoBase64: foto } : {}),
      });
      onDone(actualizada);
    } catch (err) {
      setError(formatApiError(err, "No se pudo enviar la justificación"));
    } finally {
      setEnviando(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      onClick={() => !enviando && onClose()}
      className={s.overlay}
    >
      <div onClick={(e) => e.stopPropagation()} className={s.dialogo}>
        <header className={s.dialogoCabeza}>
          <IconBadge icon={WrongLocationOutlinedIcon} color={ROJO} size={40} />
          <div>
            <h3 id={tituloId} className={s.dialogoT}>
              Justificar salida de zona
            </h3>
            <p className={s.dialogoD}>
              Saliste a las {hora(alerta.detectedAt)} y llegaste a {formatoDistancia(alerta.maxDistanciaM)} del punto de inicio
              {alerta.abierta ? "; sigues fuera." : `; regresaste a las ${hora(alerta.returnedAt)}.`}
            </p>
          </div>
        </header>

        <label className={s.campo}>
          <span className={s.etiqueta}>
            ¿Por qué saliste de la zona? <b className={s.req}>*</b>
          </span>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Ej. Fui a la ferretería de enfrente por un conector que faltaba para terminar la instalación."
          />
        </label>

        <div className={s.campo}>
          <span className={s.etiqueta}>Foto (recomendada)</span>
          {/* Ocultos sin display:none: algunos Safari de iPhone no abren el selector de un input oculto así. */}
          <input
            ref={camaraRef}
            type="file"
            accept="image/*"
            capture="environment"
            tabIndex={-1}
            aria-hidden="true"
            className={s.inputOculto}
            onChange={(e) => void elegirFoto(e)}
          />
          <input
            ref={galeriaRef}
            type="file"
            accept="image/*"
            tabIndex={-1}
            aria-hidden="true"
            className={s.inputOculto}
            onChange={(e) => void elegirFoto(e)}
          />
          {foto ? (
            <div className={s.fotoFila}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto} alt="Foto de la justificación" className={s.foto} />
              <Button size="sm" variant="danger-ghost" onClick={() => setFoto(null)} disabled={enviando}>
                Quitar foto
              </Button>
            </div>
          ) : null}
          <div className={s.fotoAcciones}>
            <Button
              size="lg"
              className={s.crece}
              onClick={() => camaraRef.current?.click()}
              disabled={enviando || procesandoFoto}
              iconStart={<AddAPhotoOutlinedIcon fontSize="inherit" />}
            >
              {foto ? "Tomar otra" : "Tomar foto"}
            </Button>
            <Button
              size="lg"
              className={s.crece}
              onClick={() => galeriaRef.current?.click()}
              disabled={enviando || procesandoFoto}
              iconStart={<PhotoLibraryOutlinedIcon fontSize="inherit" />}
            >
              Elegir de la galería
            </Button>
          </div>
          {procesandoFoto ? <span className={s.muted}>Preparando foto…</span> : null}
        </div>

        {error ? (
          <p role="alert" className={s.error}>
            {error}
          </p>
        ) : null}

        <footer className={s.dialogoPie}>
          <Button variant="tertiary" size="lg" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => void enviar()}
            disabled={procesandoFoto}
            loading={enviando}
            iconStart={<EditNoteOutlinedIcon fontSize="inherit" />}
          >
            {enviando ? "Enviando…" : "Enviar justificación"}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
