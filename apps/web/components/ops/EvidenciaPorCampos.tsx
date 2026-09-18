"use client";

import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import DescargarEvidenciaZip from "@/components/ops/DescargarEvidenciaZip";
import EvidenciaCamposEditor from "@/components/ops/EvidenciaCamposEditor";
import { FotoProtegida, Visor, type Foto } from "@/components/ops/EquipoEvidencias";
import { formatApiError } from "@/lib/erp-api";
import {
  MOMENTOS,
  MOMENTO_LABEL,
  borradoresDesdeCampos,
  camposQueSeBorran,
  definirCamposEvidencia,
  esErrorDePermiso,
  fotosDeCampo,
  hayErrores,
  obtenerCamposEvidencia,
  progresoDeCampos,
  validarCampos,
  type CampoBorrador,
  type CampoEvidencia,
  type FotoDeCampo,
  type Momento,
} from "@/lib/evidencia-campos";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/lib/permissions";

type Props = {
  activityId: number;
  anNumber?: string | null;
  titulo?: string | null;
  /** Por omisión: permiso `activities.manage` (el mismo que pide la API para definirlos). */
  canManage?: boolean;
  /** Por omisión: ver o revisar evidencias, o gestionar actividades (lo que pide el ZIP). */
  canDownload?: boolean;
  style?: CSSProperties;
};

const VERDE = "#16a34a";
const NARANJA = "#d97706";

function fmt(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function corto(nombre?: string | null): string {
  return (nombre || "").split(/\s+/).slice(0, 2).join(" ");
}

function listaNombres(nombres: string[]): string {
  const q = nombres.map((n) => `«${n}»`);
  if (q.length <= 1) return q.join("");
  return `${q.slice(0, -1).join(", ")} y ${q[q.length - 1]}`;
}

const tarjeta: CSSProperties = {
  display: "grid",
  gap: 10,
  alignContent: "start",
  padding: 14,
  borderRadius: 16,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  minWidth: 0,
};

function Progreso({ cumplidas, requeridas }: { cumplidas: number; requeridas: number }) {
  const pct = requeridas ? Math.round((cumplidas / requeridas) * 100) : 100;
  const texto = `${cumplidas} de ${requeridas} foto${requeridas === 1 ? "" : "s"}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div
        role="progressbar"
        aria-label="Fotos por campo documentadas"
        aria-valuemin={0}
        aria-valuemax={requeridas}
        aria-valuenow={cumplidas}
        aria-valuetext={texto}
        style={{
          flex: "1 1 160px",
          maxWidth: 360,
          height: 8,
          borderRadius: 999,
          background: "color-mix(in srgb, var(--border) 80%, transparent)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 999,
            background: cumplidas >= requeridas ? VERDE : "var(--primary)",
          }}
        />
      </div>
      <strong style={{ fontSize: 13 }}>{texto}</strong>
    </div>
  );
}

function Hueco({
  campo,
  momento,
  foto,
  pedido,
  onAbrir,
}: {
  campo: CampoEvidencia;
  momento: Momento;
  foto: FotoDeCampo | null;
  pedido: boolean;
  onAbrir: () => void;
}) {
  const etiqueta = `${MOMENTO_LABEL[momento]}${pedido ? "" : " (ya no se pide)"}`;
  const alto = 112;
  return (
    <figure style={{ margin: 0, display: "grid", gap: 4, minWidth: 0 }}>
      <figcaption style={{ fontSize: 12, fontWeight: 750, color: pedido ? "inherit" : "var(--text-tertiary)" }}>
        {etiqueta}
      </figcaption>
      {foto ? (
        <button
          type="button"
          onClick={onAbrir}
          aria-label={`Ver en grande: ${campo.nombre}, ${MOMENTO_LABEL[momento].toLowerCase()}`}
          style={{
            padding: 0,
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            background: "color-mix(in srgb, var(--text-secondary) 8%, var(--surface))",
            cursor: "zoom-in",
            height: alto,
            display: "block",
            width: "100%",
          }}
        >
          <FotoProtegida
            url={foto.photoUrl}
            alt={`${campo.nombre} · ${MOMENTO_LABEL[momento]}`}
            alto={alto}
            style={{ width: "100%", height: alto, objectFit: "cover", display: "block" }}
          />
        </button>
      ) : (
        <div
          style={{
            height: alto,
            display: "grid",
            placeContent: "center",
            justifyItems: "center",
            gap: 4,
            borderRadius: 12,
            border: `1px dashed color-mix(in srgb, ${NARANJA} 45%, var(--border))`,
            background: `color-mix(in srgb, ${NARANJA} 6%, var(--surface))`,
            color: NARANJA,
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          <HourglassEmptyIcon aria-hidden="true" sx={{ fontSize: 20 }} />
          Pendiente
        </div>
      )}
      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.35, minHeight: 16 }}>
        {foto ? [corto(foto.por?.nombre), fmt(foto.capturedAt)].filter(Boolean).join(" · ") || "Tomada" : "Sin foto aún"}
      </span>
    </figure>
  );
}

/**
 * «Evidencia por campos» en el detalle de la actividad: qué se pidió fotografiar, la foto
 * (o «Pendiente») de cada campo en cada momento, el avance, editar la lista y bajar el ZIP.
 */
export default function EvidenciaPorCampos({ activityId, anNumber, titulo, canManage, canDownload, style }: Props) {
  const { user, token } = useUser();
  const tituloId = useId();
  const puedeEditar =
    canManage ?? hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE);
  const puedeDescargar =
    canDownload ??
    hasAnyPermission(user, [
      PERMISSIONS.EVIDENCES_VIEW,
      PERMISSIONS.EVIDENCES_REVIEW,
      PERMISSIONS.ACTIVITIES_MANAGE,
    ]);

  const [campos, setCampos] = useState<CampoEvidencia[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinPermiso, setSinPermiso] = useState(false);

  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<CampoBorrador[]>([]);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [porBorrar, setPorBorrar] = useState<CampoEvidencia[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [visor, setVisor] = useState<{ fotos: Foto[]; index: number } | null>(null);

  const cargar = useCallback(async () => {
    if (!token || !activityId) return;
    setCargando(true);
    try {
      setCampos(await obtenerCamposEvidencia(token, activityId));
      setError(null);
      setSinPermiso(false);
    } catch (e) {
      if (esErrorDePermiso(e)) setSinPermiso(true);
      else setError(formatApiError(e, "No se pudo cargar la evidencia por campos"));
    } finally {
      setCargando(false);
    }
  }, [token, activityId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 6000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const lista = useMemo(() => campos ?? [], [campos]);
  const { requeridas, cumplidas } = useMemo(() => progresoDeCampos(lista), [lista]);

  /** Todas las fotos en orden (campo → momento) para pasar de una a otra en el visor. */
  const galeria = useMemo(() => {
    const fotos: Foto[] = [];
    const indice = new Map<string, number>();
    for (const campo of lista) {
      for (const m of MOMENTOS) {
        const f = campo.fotos?.[m];
        if (!f) continue;
        indice.set(`${campo.id}:${m}`, fotos.length);
        fotos.push({
          url: f.photoUrl,
          titulo: `${campo.nombre} · ${MOMENTO_LABEL[m]}${f.por?.nombre ? ` · ${corto(f.por.nombre)}` : ""}`,
          at: f.capturedAt,
          lat: f.latitude,
          lng: f.longitude,
        });
      }
    }
    return { fotos, indice };
  }, [lista]);

  const errores = useMemo(() => validarCampos(borrador), [borrador]);
  const cerrarVisor = useCallback(() => setVisor(null), []);
  const moverVisor = useCallback((i: number) => setVisor((v) => (v ? { ...v, index: i } : v)), []);

  const abrirEditor = () => {
    setBorrador(borradoresDesdeCampos(lista));
    setIntentado(false);
    setErrorGuardar(null);
    setPorBorrar(null);
    setAviso(null);
    setEditando(true);
  };

  const cerrarEditor = () => {
    setEditando(false);
    setPorBorrar(null);
    setErrorGuardar(null);
  };

  const guardar = async (confirmado = false) => {
    if (!token || guardando) return;
    setIntentado(true);
    setErrorGuardar(null);
    if (hayErrores(errores)) return;

    const seBorran = camposQueSeBorran(lista, borrador);
    const conFotos = seBorran.filter((c) => fotosDeCampo(c).length > 0);
    if (conFotos.length > 0 && !confirmado) {
      setPorBorrar(conFotos);
      return;
    }

    setGuardando(true);
    try {
      const nuevos = await definirCamposEvidencia(token, activityId, borrador);
      setCampos(nuevos);
      setEditando(false);
      setPorBorrar(null);
      const p = progresoDeCampos(nuevos);
      setAviso(
        nuevos.length === 0
          ? "Se quitaron los puntos: el equipo vuelve a subir fotos libres."
          : `Guardado: ${nuevos.length} punto${nuevos.length === 1 ? "" : "s"}, ${p.requeridas} foto${
              p.requeridas === 1 ? "" : "s"
            } por documentar.`,
      );
    } catch (e) {
      setErrorGuardar(formatApiError(e, "No se pudieron guardar los puntos"));
    } finally {
      setGuardando(false);
    }
  };

  if (sinPermiso) return null;

  const fotosPorBorrar = (porBorrar ?? []).reduce((n, c) => n + fotosDeCampo(c).length, 0);

  return (
    <section aria-labelledby={tituloId} style={{ display: "grid", gap: 12, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4, minWidth: 0, flex: "1 1 240px" }}>
          <h2 id={tituloId} style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
            Evidencia por campos
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
            {cargando && !campos
              ? "Cargando…"
              : lista.length === 0
                ? "Esta actividad no pide fotos por punto: el equipo sube fotos libres."
                : "Qué hay que fotografiar y en qué momento. Las fotos se toman desde la app."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          {puedeEditar && !editando && campos ? (
            <Button
              size="sm"
              variant={lista.length ? "secondary" : "primary"}
              onClick={abrirEditor}
              iconLeft={
                lista.length ? (
                  <EditOutlinedIcon fontSize="inherit" />
                ) : (
                  <PhotoCameraOutlinedIcon fontSize="inherit" />
                )
              }
            >
              {lista.length ? "Editar puntos" : "Definir qué fotografiar"}
            </Button>
          ) : null}
          {puedeDescargar ? <DescargarEvidenciaZip activityId={activityId} anNumber={anNumber} titulo={titulo} /> : null}
        </div>
      </div>

      {error && !campos ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span role="alert" style={{ fontSize: 13, color: "var(--danger)" }}>
            {error}
          </span>
          <Button size="sm" variant="secondary" onClick={() => void cargar()}>
            Reintentar
          </Button>
        </div>
      ) : null}

      {aviso ? (
        <p
          role="status"
          style={{
            margin: 0,
            padding: "10px 12px",
            borderRadius: 12,
            fontSize: 13.5,
            fontWeight: 650,
            background: `color-mix(in srgb, ${VERDE} 10%, var(--surface))`,
            border: `1px solid color-mix(in srgb, ${VERDE} 35%, var(--border))`,
          }}
        >
          {aviso}
        </p>
      ) : null}

      {editando ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            padding: 14,
            borderRadius: 16,
            border: "1px solid color-mix(in srgb, var(--primary) 30%, var(--border))",
            background: "color-mix(in srgb, var(--primary) 4%, var(--surface))",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
            Una fila por cosa que hay que documentar y, en cada una, los momentos en que se pide foto. Renombrar un
            punto conserva sus fotos; <strong>quitarlo borra las fotos que ya tenga</strong>.
          </p>
          <EvidenciaCamposEditor
            value={borrador}
            onChange={(next) => {
              setBorrador(next);
              setPorBorrar(null);
            }}
            errores={intentado ? errores : null}
            disabled={guardando}
          />
          {borrador.length === 0 && lista.length > 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>
              Sin puntos, la actividad vuelve a pedir fotos libres.
            </p>
          ) : null}

          {porBorrar && porBorrar.length > 0 ? (
            <div
              role="alert"
              style={{
                display: "grid",
                gap: 10,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid color-mix(in srgb, var(--danger) 45%, var(--border))",
                background: "color-mix(in srgb, var(--danger) 7%, var(--surface))",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.45 }}>
                <WarningAmberOutlinedIcon aria-hidden="true" sx={{ fontSize: 20, color: "var(--danger)", flex: "0 0 auto" }} />
                <span>
                  Vas a quitar {listaNombres(porBorrar.map((c) => c.nombre))}. Se borran{" "}
                  <strong>
                    {fotosPorBorrar} foto{fotosPorBorrar === 1 ? "" : "s"}
                  </strong>{" "}
                  que ya se tomaron y no se pueden recuperar.
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Button size="sm" variant="secondary" onClick={() => setPorBorrar(null)} disabled={guardando}>
                  Volver
                </Button>
                <Button size="sm" variant="danger" onClick={() => void guardar(true)} loading={guardando}>
                  Quitar y guardar
                </Button>
              </div>
            </div>
          ) : null}

          {errorGuardar ? (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>
              {errorGuardar}
            </p>
          ) : null}

          {!porBorrar ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Button size="sm" variant="secondary" onClick={cerrarEditor} disabled={guardando}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" onClick={() => void guardar()} loading={guardando}>
                {guardando ? "Guardando…" : "Guardar puntos"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!editando && lista.length > 0 ? (
        <>
          <Progreso cumplidas={cumplidas} requeridas={requeridas} />
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
              gap: 12,
            }}
          >
            {lista.map((campo) => {
              const faltan = campo.momentos.filter((m) => !campo.fotos?.[m]).length;
              const momentosVisibles = MOMENTOS.filter((m) => campo.momentos.includes(m) || campo.fotos?.[m]);
              return (
                <li key={campo.id} style={tarjeta}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, minWidth: 0, overflowWrap: "anywhere" }}>
                      {campo.nombre}
                    </h3>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        flex: "0 0 auto",
                        padding: "2px 9px",
                        borderRadius: 999,
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: faltan ? NARANJA : VERDE,
                        border: `1px solid color-mix(in srgb, ${faltan ? NARANJA : VERDE} 35%, var(--border))`,
                        background: `color-mix(in srgb, ${faltan ? NARANJA : VERDE} 9%, var(--surface))`,
                      }}
                    >
                      {faltan ? (
                        <HourglassEmptyIcon aria-hidden="true" sx={{ fontSize: 14 }} />
                      ) : (
                        <CheckCircleOutlineIcon aria-hidden="true" sx={{ fontSize: 14 }} />
                      )}
                      {faltan ? `Falta${faltan === 1 ? "" : "n"} ${faltan}` : "Completo"}
                    </span>
                  </div>
                  {campo.notas ? (
                    <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>{campo.notas}</p>
                  ) : null}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${Math.max(1, momentosVisibles.length)}, minmax(0, 1fr))`,
                      gap: 8,
                    }}
                  >
                    {momentosVisibles.map((m) => {
                      const foto = campo.fotos?.[m] ?? null;
                      return (
                        <Hueco
                          key={m}
                          campo={campo}
                          momento={m}
                          foto={foto}
                          pedido={campo.momentos.includes(m)}
                          onAbrir={() => {
                            const i = galeria.indice.get(`${campo.id}:${m}`);
                            if (i != null) setVisor({ fotos: galeria.fotos, index: i });
                          }}
                        />
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {visor ? (
        <Visor fotos={visor.fotos} index={visor.index} onClose={cerrarVisor} onIndex={moverVisor} />
      ) : null}
    </section>
  );
}
