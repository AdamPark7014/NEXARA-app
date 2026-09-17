"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
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

const VERDE = "var(--success, #16a34a)";
const ROJO = "var(--danger, #dc2626)";

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

const btn: CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  fontWeight: 650,
  fontSize: 13.5,
  padding: "8px 14px",
  minHeight: 42,
  borderRadius: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};

const btnPrimario: CSSProperties = { ...btn, border: 0, background: "var(--primary)", color: "#fff" };

const inputOculto: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  opacity: 0,
  overflow: "hidden",
  pointerEvents: "none",
};

const linkBtn: CSSProperties = {
  border: 0,
  background: "transparent",
  padding: "4px 0",
  color: "var(--primary)",
  fontWeight: 650,
  fontSize: 12.5,
  cursor: "pointer",
  fontFamily: "inherit",
  justifySelf: "start",
};

function Chip({ children, color, icon: Icon }: { children: ReactNode; color?: string; icon?: SvgIconComponent }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 650,
        border: `1px solid ${color ? `color-mix(in srgb, ${color} 35%, var(--border))` : "var(--border)"}`,
        background: color ? `color-mix(in srgb, ${color} 10%, var(--surface))` : "var(--surface)",
        color: color ?? "var(--text-secondary)",
        whiteSpace: "nowrap",
      }}
    >
      {Icon ? <Icon aria-hidden="true" sx={{ fontSize: 16, flex: "0 0 auto" }} /> : null}
      {children}
    </span>
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
    <div
      role="alert"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid color-mix(in srgb, ${ROJO} 45%, var(--border))`,
        background: `color-mix(in srgb, ${ROJO} 9%, var(--surface))`,
        color: "inherit",
        textAlign: "left",
      }}
    >
      <WrongLocationOutlinedIcon aria-hidden="true" sx={{ fontSize: 24, color: ROJO, flex: "0 0 auto", mt: "1px" }} />
      <div style={{ display: "grid", gap: 2 }}>
        <strong style={{ fontSize: 14, color: ROJO }}>Estás fuera de la zona de la actividad</strong>
        <span style={{ fontSize: 13.5, lineHeight: 1.45 }}>{mensaje}</span>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, detalle, color }: { etiqueta: string; valor: string; detalle?: ReactNode; color?: string }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 2,
        padding: "10px 12px",
        borderRadius: 12,
        background: "color-mix(in srgb, var(--text-secondary) 6%, var(--surface))",
      }}
    >
      <dt style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{etiqueta}</dt>
      <dd style={{ margin: 0, fontSize: 15, fontWeight: 800, color }}>{valor}</dd>
      {detalle ? <dd style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>{detalle}</dd> : null}
    </div>
  );
}

/**
 * «Ubicación de la actividad»: punto de inicio, radio de 100 m, última distancia, recorrido
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
      <Chip color={VERDE} icon={CheckCircleOutlineIcon}>
        Dentro de la zona
      </Chip>
    ) : estado?.dentro === false ? (
      <Chip color={ROJO} icon={WrongLocationOutlinedIcon}>
        Fuera de la zona
      </Chip>
    ) : estado ? (
      <Chip icon={PlaceOutlinedIcon}>Sin lecturas aún</Chip>
    ) : null;

  return (
    <section
      aria-labelledby={`geocerca-titulo-${activityId}`}
      style={{
        border: `1px solid ${
          pendientes.length || estado?.dentro === false ? `color-mix(in srgb, ${ROJO} 40%, var(--border))` : "var(--border)"
        }`,
        borderRadius: 16,
        background: "var(--surface)",
        padding: 14,
        display: "grid",
        gap: 12,
        marginBottom: 12,
        textAlign: "left",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <IconBadge icon={MyLocationOutlinedIcon} size={36} />
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <h3 id={`geocerca-titulo-${activityId}`} style={{ margin: 0, fontSize: 15.5, fontWeight: 800 }}>
            Ubicación de la actividad
          </h3>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, lineHeight: 1.4, color: "var(--text-secondary)" }}>
            Mantente a no más de {radio} m del punto donde iniciaste: la foto de salida solo se acepta dentro de ese radio.
          </p>
        </div>
        {chipEstado}
        <button
          type="button"
          style={{ ...btn, opacity: cargando ? 0.7 : 1 }}
          onClick={() => void recargar()}
          disabled={cargando}
          aria-label="Actualizar ubicación de la actividad"
        >
          <RefreshIcon aria-hidden="true" sx={{ fontSize: 18 }} />
          {cargando ? "Actualizando…" : "Actualizar"}
        </button>
      </header>

      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: ROJO }}>
          {error}
        </p>
      ) : null}

      {!estado && !error ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Cargando ubicación de la actividad…</p>
      ) : null}

      {estado && !origen ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
          Tu foto de entrada no tiene ubicación registrada, así que no hay punto de inicio contra el cual medir.
        </p>
      ) : null}

      {estado && origen ? (
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          <Dato
            etiqueta="Inicio"
            valor={hora(origen.at)}
            detalle={
              <>
                {fechaHora(origen.at)}
                {mapaOrigen ? (
                  <>
                    {" · "}
                    <a href={mapaOrigen} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", fontWeight: 650 }}>
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
            color={estado.dentro === false ? ROJO : estado.dentro === true ? VERDE : undefined}
            detalle={ultimo ? `Lectura de las ${hora(ultimo.at)}` : "Sin lecturas de GPS todavía"}
          />
        </dl>
      ) : null}

      {aviso ? (
        <p
          role="status"
          style={{
            margin: 0,
            padding: "8px 12px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 650,
            background: `color-mix(in srgb, ${VERDE} 10%, var(--surface))`,
          }}
        >
          {aviso}
        </p>
      ) : null}

      {pendientes.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>
            {pendientes.length === 1 ? "Salida de zona por justificar" : `Salidas de zona por justificar (${pendientes.length})`}
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {pendientes.map((a) => (
              <li
                key={a.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid color-mix(in srgb, ${ROJO} 35%, var(--border))`,
                  background: `color-mix(in srgb, ${ROJO} 6%, var(--surface))`,
                }}
              >
                <WrongLocationOutlinedIcon aria-hidden="true" sx={{ fontSize: 22, color: ROJO, flex: "0 0 auto" }} />
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 750 }}>Saliste de la zona a las {hora(a.detectedAt)}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    Hasta {formatoDistancia(a.maxDistanciaM)} del punto de inicio ·{" "}
                    {a.abierta ? (
                      <strong style={{ color: ROJO }}>Sigues fuera</strong>
                    ) : (
                      `Regresaste a las ${hora(a.returnedAt)}`
                    )}
                  </div>
                </div>
                <button type="button" style={btnPrimario} onClick={() => setJustificando(a)}>
                  <EditNoteOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                  Justificar
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {justificadas.length ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {justificadas.map((a) => (
            <li
              key={a.id}
              style={{
                fontSize: 12.5,
                lineHeight: 1.45,
                padding: "8px 12px",
                borderRadius: 10,
                background: "color-mix(in srgb, var(--text-secondary) 6%, var(--surface))",
              }}
            >
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
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>
              <IconLabel icon={TimelineOutlinedIcon} size={18} gap={6}>
                Seguimiento paulatino
              </IconLabel>
            </span>
            <Chip color={estado.seguimientoActivo ? "var(--primary)" : undefined}>
              {estado.seguimientoActivo ? "En curso" : "Terminado"}
            </Chip>
          </div>
          {puntos.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>
              Aquí aparecen las lecturas de GPS registradas desde que iniciaste la actividad.
            </p>
          ) : (
            <>
              <ol
                aria-label="Lecturas recientes de ubicación"
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: 6,
                }}
              >
                {visibles.map((p, i) => {
                  const fuera = p.distanciaM != null && p.distanciaM > radio;
                  return (
                    <li
                      key={`${p.at}-${i}`}
                      title={fechaHora(p.at)}
                      style={{
                        fontSize: 12.5,
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: `1px solid ${fuera ? `color-mix(in srgb, ${ROJO} 35%, var(--border))` : "var(--border)"}`,
                        background: fuera ? `color-mix(in srgb, ${ROJO} 6%, var(--surface))` : "var(--surface)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {hora(p.at)} ·{" "}
                      <strong style={{ color: fuera ? ROJO : undefined }}>{formatoDistancia(p.distanciaM)}</strong>
                    </li>
                  );
                })}
              </ol>
              {puntos.length > PUNTOS_VISIBLES ? (
                <button type="button" style={linkBtn} onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos}>
                  {verTodos ? "Ver menos" : `Ver las ${puntos.length} lecturas`}
                </button>
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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(2, 6, 23, 0.55)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          background: "var(--surface)",
          color: "inherit",
          borderRadius: 20,
          border: "1px solid var(--border)",
          boxShadow: "0 24px 60px rgba(2, 6, 23, 0.35)",
          padding: 20,
          display: "grid",
          gap: 14,
          textAlign: "left",
        }}
      >
        <header style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <IconBadge icon={WrongLocationOutlinedIcon} color={ROJO} size={40} />
          <div>
            <h3 id={tituloId} style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              Justificar salida de zona
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-secondary)" }}>
              Saliste a las {hora(alerta.detectedAt)} y llegaste a {formatoDistancia(alerta.maxDistanciaM)} del punto de inicio
              {alerta.abierta ? "; sigues fuera." : `; regresaste a las ${hora(alerta.returnedAt)}.`}
            </p>
          </div>
        </header>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 750 }}>¿Por qué saliste de la zona?</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Ej. Fui a la ferretería de enfrente por un conector que faltaba para terminar la instalación."
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 12,
              border: "1px solid var(--border)",
              padding: "10px 12px",
              font: "inherit",
              fontSize: 14.5,
              background: "var(--surface)",
              color: "inherit",
              resize: "vertical",
            }}
          />
        </label>

        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 750 }}>Foto (recomendada)</span>
          {/* Ocultos sin display:none: algunos Safari de iPhone no abren el selector de un input oculto así. */}
          <input
            ref={camaraRef}
            type="file"
            accept="image/*"
            capture="environment"
            tabIndex={-1}
            aria-hidden="true"
            style={inputOculto}
            onChange={(e) => void elegirFoto(e)}
          />
          <input
            ref={galeriaRef}
            type="file"
            accept="image/*"
            tabIndex={-1}
            aria-hidden="true"
            style={inputOculto}
            onChange={(e) => void elegirFoto(e)}
          />
          {foto ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto}
                alt="Foto de la justificación"
                style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }}
              />
              <button type="button" style={btn} onClick={() => setFoto(null)} disabled={enviando}>
                Quitar foto
              </button>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={{ ...btn, flex: "1 1 150px" }}
              onClick={() => camaraRef.current?.click()}
              disabled={enviando || procesandoFoto}
            >
              <AddAPhotoOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
              {foto ? "Tomar otra" : "Tomar foto"}
            </button>
            <button
              type="button"
              style={{ ...btn, flex: "1 1 150px" }}
              onClick={() => galeriaRef.current?.click()}
              disabled={enviando || procesandoFoto}
            >
              <PhotoLibraryOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
              Elegir de la galería
            </button>
          </div>
          {procesandoFoto ? <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>Preparando foto…</span> : null}
        </div>

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 13.5, color: ROJO }}>
            {error}
          </p>
        ) : null}

        <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" style={btn} onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...btnPrimario, opacity: enviando || procesandoFoto ? 0.7 : 1 }}
            onClick={() => void enviar()}
            disabled={enviando || procesandoFoto}
          >
            <EditNoteOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            {enviando ? "Enviando…" : "Enviar justificación"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
