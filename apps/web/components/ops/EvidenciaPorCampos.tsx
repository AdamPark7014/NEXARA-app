"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from "react";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { Alert, Badge, Button, Progress } from "@/components/base";
import s from "./EvidenciaPorCampos.module.css";
import { useUser } from "@/components/UserContext";
import DescargarEvidenciaZip from "@/components/ops/DescargarEvidenciaZip";
import EvidenciaCamposEditor from "@/components/ops/EvidenciaCamposEditor";
import { FotoProtegida, Visor, type Foto } from "@/components/ops/EquipoEvidencias";
import { formatApiError } from "@/lib/erp-api";
import {
  dataUrlDeImagen,
  mensajeAdjuntoInvalido,
  primerArchivo,
  puntoDeFoto,
} from "@/lib/evidencia-adjunto";
import {
  MOMENTOS,
  MOMENTO_LABEL,
  borradoresDesdeCampos,
  camposQueSeBorran,
  definirCamposEvidencia,
  esErrorDePermiso,
  fotosDeCampo,
  guardarFotoDeCampo,
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
  /**
   * El responsable y los asignados. Quien solo mira el detalle no ve Tomar foto ni Adjuntar.
   */
  puedeSubir?: boolean;
  style?: CSSProperties;
};

type DestinoFoto = { fieldId: number; momento: Momento };

function destinoDeElemento(el: Element | null): DestinoFoto | null {
  if (!el) return null;
  const fieldId = Number(el.getAttribute("data-field-id"));
  const momento = el.getAttribute("data-momento");
  if (!fieldId || (momento !== "ANTES" && momento !== "EN_PROGRESO" && momento !== "DESPUES")) return null;
  return { fieldId, momento };
}

function unicoHuecoPendiente(campos: readonly CampoEvidencia[]): DestinoFoto | null {
  const pendientes: DestinoFoto[] = [];
  for (const campo of campos) {
    for (const momento of campo.momentos) {
      if (!campo.fotos?.[momento]) pendientes.push({ fieldId: campo.id, momento });
    }
  }
  return pendientes.length === 1 ? pendientes[0] : null;
}

/** GPS si el navegador lo da pronto. Si no, la foto del punto se guarda igual. */
function leerUbicacionOpcional(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (punto: { latitude: number; longitude: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(puntoDeFoto(punto?.latitude, punto?.longitude));
    };
    const timer = window.setTimeout(() => finish(null), 2500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        finish({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: false, timeout: 2000, maximumAge: 60_000 },
    );
  });
}


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

function Progreso({ cumplidas, requeridas }: { cumplidas: number; requeridas: number }) {
  const texto = `${cumplidas} de ${requeridas} foto${requeridas === 1 ? "" : "s"}`;
  return (
    <div className={s.progreso}>
      <span className={s.progresoBarra}>
        <Progress
          value={cumplidas}
          max={requeridas || 1}
          tone={cumplidas >= requeridas ? "success" : "brand"}
          ariaLabel="Fotos por campo documentadas"
          label=""
        />
      </span>
      <strong className={s.progresoN}>{texto}</strong>
    </div>
  );
}

function Hueco({
  campo,
  momento,
  foto,
  pedido,
  puedeSubir,
  ocupado,
  onAbrir,
  onTomar,
  onAdjuntar,
  onSoltar,
  onEntrar,
}: {
  campo: CampoEvidencia;
  momento: Momento;
  foto: FotoDeCampo | null;
  pedido: boolean;
  puedeSubir: boolean;
  ocupado: boolean;
  onAbrir: () => void;
  onTomar: () => void;
  onAdjuntar: () => void;
  onSoltar: (file: File) => void;
  onEntrar: () => void;
}) {
  const etiqueta = `${MOMENTO_LABEL[momento]}${pedido ? "" : " (ya no se pide)"}`;
  /** Hero por momento: alto suficiente para revisión en escritorio y móvil. */
  const alto = 320;
  const ofrecer = puedeSubir && pedido;
  const soltar = (event: DragEvent<HTMLElement>) => {
    if (!ofrecer) return;
    event.preventDefault();
    event.stopPropagation();
    const file = primerArchivo(event.dataTransfer.files);
    if (file) onSoltar(file);
  };
  return (
    <figure
      data-campo-slot=""
      data-field-id={campo.id}
      data-momento={momento}
      onMouseEnter={ofrecer ? onEntrar : undefined}
      onFocus={ofrecer ? onEntrar : undefined}
      onDragOver={ofrecer ? (event) => event.preventDefault() : undefined}
      onDrop={soltar}
      className={s.hueco}
    >
      <figcaption className={s.huecoT} data-pedido={pedido ? undefined : "false"}>
        {etiqueta}
      </figcaption>
      {foto ? (
        <button
          type="button"
          onClick={onAbrir}
          aria-label={`Ver en grande: ${campo.nombre}, ${MOMENTO_LABEL[momento].toLowerCase()}`}
          className={s.huecoFoto}
        >
          <FotoProtegida
            url={foto.photoUrl}
            alt={`${campo.nombre} · ${MOMENTO_LABEL[momento]}`}
            alto={alto}
            className={s.huecoImg}
          />
        </button>
      ) : (
        <div className={s.huecoVacio}>
          <HourglassEmptyIcon aria-hidden="true" fontSize="inherit" className={s.huecoVacioIco} />
          Pendiente
        </div>
      )}
      <span className={s.huecoM}>
        {foto ? [corto(foto.por?.nombre), fmt(foto.capturedAt)].filter(Boolean).join(" · ") || "Tomada" : "Sin foto aún"}
      </span>
      {ofrecer ? (
        <div className={s.huecoAcciones}>
          <Button size="sm" variant="tonal" onClick={onTomar} disabled={ocupado} iconStart={<PhotoCameraOutlinedIcon fontSize="inherit" />}>
            Tomar foto
          </Button>
          <Button size="sm" variant="secondary" onClick={onAdjuntar} disabled={ocupado}>
            Adjuntar
          </Button>
        </div>
      ) : null}
    </figure>
  );
}

/**
 * «Evidencia por campos» en el detalle de la actividad: qué se pidió fotografiar, la foto
 * (o «Pendiente») de cada campo en cada momento, el avance, editar la lista y bajar el ZIP.
 */
export default function EvidenciaPorCampos({
  activityId,
  anNumber,
  titulo,
  canManage,
  canDownload,
  puedeSubir = false,
  style,
}: Props) {
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
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [visor, setVisor] = useState<{ fotos: Foto[]; index: number } | null>(null);
  const tomarRef = useRef<HTMLInputElement>(null);
  const adjuntarRef = useRef<HTMLInputElement>(null);
  const destinoRef = useRef<DestinoFoto | null>(null);
  const hoverRef = useRef<DestinoFoto | null>(null);
  const listaRef = useRef<CampoEvidencia[]>([]);

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
  listaRef.current = lista;
  const { requeridas, cumplidas } = useMemo(() => progresoDeCampos(lista), [lista]);

  const subirFoto = useCallback(
    async (file: File, destino: DestinoFoto) => {
      if (!token || !puedeSubir) return;
      const avisoArchivo = mensajeAdjuntoInvalido(file);
      if (avisoArchivo) {
        setErrorFoto(avisoArchivo);
        return;
      }
      const clave = `${destino.fieldId}:${destino.momento}`;
      setSubiendo(clave);
      setErrorFoto(null);
      try {
        const dataUrl = await dataUrlDeImagen(file);
        const geo = await leerUbicacionOpcional();
        const punto = puntoDeFoto(geo?.latitude, geo?.longitude);
        const nuevos = await guardarFotoDeCampo(token, activityId, destino.fieldId, {
          momento: destino.momento,
          photoUrl: dataUrl,
          latitude: punto?.latitude,
          longitude: punto?.longitude,
          capturedAt: new Date().toISOString(),
        });
        setCampos(nuevos);
        setAviso(`${MOMENTO_LABEL[destino.momento]} guardada.`);
      } catch (e) {
        setErrorFoto(formatApiError(e, "No se pudo guardar la foto"));
      } finally {
        setSubiendo(null);
      }
    },
    [token, puedeSubir, activityId],
  );

  const elegirDestino = useCallback((desde: Element | null): DestinoFoto | null => {
    return destinoDeElemento(desde) ?? hoverRef.current ?? unicoHuecoPendiente(listaRef.current);
  }, []);

  useEffect(() => {
    if (!puedeSubir) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      const file = primerArchivo(event.clipboardData?.files ?? null);
      if (!file) return;
      const destino = elegirDestino(target?.closest?.("[data-campo-slot]") ?? null);
      if (!destino) {
        setErrorFoto("Elige el punto (Antes, En progreso o Después) y pega de nuevo, o suelta la imagen sobre ese hueco.");
        return;
      }
      event.preventDefault();
      void subirFoto(file, destino);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [puedeSubir, elegirDestino, subirFoto]);

  const abrirArchivo = (destino: DestinoFoto, tomar: boolean) => {
    destinoRef.current = destino;
    setErrorFoto(null);
    const input = tomar ? tomarRef.current : adjuntarRef.current;
    if (input) input.value = "";
    input?.click();
  };

  const alElegirArchivo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const destino = destinoRef.current;
    if (!file || !destino) return;
    void subirFoto(file, destino);
  };

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
    <section aria-labelledby={tituloId} className={s.caja} style={style}>
      <div className={s.cabeza}>
        <div className={s.cabezaTexto}>
          <h2 id={tituloId} className={s.titulo}>
            <span className={s.ico} aria-hidden="true">
              <PhotoCameraOutlinedIcon fontSize="inherit" />
            </span>
            Evidencia por campos
          </h2>
          <p className={s.sub}>
            {cargando && !campos
              ? "Cargando…"
              : lista.length === 0
                ? "Esta actividad no pide fotos por punto: el equipo sube fotos libres."
                : "Qué hay que fotografiar y en qué momento. El responsable y los asignados toman la foto aquí o adjuntan un archivo, una captura, con Ctrl+V o arrastrándola."}
          </p>
        </div>
        <div className={s.cabezaAcciones}>
          {puedeEditar && !editando && campos ? (
            <Button
              size="sm"
              variant={lista.length ? "secondary" : "tonal"}
              onClick={abrirEditor}
              iconStart={
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
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button size="sm" variant="secondary" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      {errorFoto ? (
        <p role="alert" className={s.error}>
          {errorFoto}
        </p>
      ) : null}

      {puedeSubir ? (
        <>
          <input
            ref={tomarRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-hidden="true"
            tabIndex={-1}
            onChange={alElegirArchivo}
            className={s.archivoOculto}
          />
          <input
            ref={adjuntarRef}
            type="file"
            accept="image/*"
            aria-hidden="true"
            tabIndex={-1}
            onChange={alElegirArchivo}
            className={s.archivoOculto}
          />
        </>
      ) : null}

      {aviso ? (
        <p role="status" className={s.aviso}>
          {aviso}
        </p>
      ) : null}

      {editando ? (
        <div className={s.editor}>
          <p className={s.sub}>
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
            <p className={s.nota}>Sin puntos, la actividad vuelve a pedir fotos libres.</p>
          ) : null}

          {porBorrar && porBorrar.length > 0 ? (
            <Alert
              tone="danger"
              role="alert"
              icon={<WarningAmberOutlinedIcon fontSize="inherit" />}
              action={
                <span className={s.alertaAcciones}>
                  <Button size="sm" variant="secondary" onClick={() => setPorBorrar(null)} disabled={guardando}>
                    Volver
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void guardar(true)} loading={guardando}>
                    Quitar y guardar
                  </Button>
                </span>
              }
            >
              Vas a quitar {listaNombres(porBorrar.map((c) => c.nombre))}. Se borran{" "}
              <strong>
                {fotosPorBorrar} foto{fotosPorBorrar === 1 ? "" : "s"}
              </strong>{" "}
              que ya se tomaron y no se pueden recuperar.
            </Alert>
          ) : null}

          {errorGuardar ? (
            <p role="alert" className={s.error}>
              {errorGuardar}
            </p>
          ) : null}

          {!porBorrar ? (
            <div className={s.editorPie}>
              <Button variant="tertiary" onClick={cerrarEditor} disabled={guardando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void guardar()} loading={guardando}>
                {guardando ? "Guardando…" : "Guardar puntos"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!editando && lista.length > 0 ? (
        <div
          className={s.cuerpo}
          onDragOver={puedeSubir ? (event) => event.preventDefault() : undefined}
          onDrop={
            puedeSubir
              ? (event) => {
                  event.preventDefault();
                  const file = primerArchivo(event.dataTransfer.files);
                  if (!file) return;
                  const destino = elegirDestino((event.target as HTMLElement).closest?.("[data-campo-slot]") ?? null);
                  if (!destino) {
                    setErrorFoto("Suelta la imagen sobre el punto, o usa Adjuntar en ese hueco.");
                    return;
                  }
                  void subirFoto(file, destino);
                }
              : undefined
          }
        >
          <Progreso cumplidas={cumplidas} requeridas={requeridas} />
          <ul className={s.lista}>
            {lista.map((campo) => {
              const faltan = campo.momentos.filter((m) => !campo.fotos?.[m]).length;
              const momentosVisibles = MOMENTOS.filter((m) => campo.momentos.includes(m) || campo.fotos?.[m]);
              return (
                <li key={campo.id} className={s.tarjeta}>
                  <div className={s.tarjetaCabeza}>
                    <h3 className={s.tarjetaT}>{campo.nombre}</h3>
                    <Badge
                      tone={faltan ? "warning" : "success"}
                      size="sm"
                      icon={faltan ? <HourglassEmptyIcon fontSize="inherit" /> : <CheckCircleOutlineIcon fontSize="inherit" />}
                    >
                      {faltan ? `Falta${faltan === 1 ? "" : "n"} ${faltan}` : "Completo"}
                    </Badge>
                  </div>
                  {campo.notas ? <p className={s.nota}>{campo.notas}</p> : null}
                  <div className={s.momentos}>
                    {momentosVisibles.map((m) => {
                      const foto = campo.fotos?.[m] ?? null;
                      return (
                        <Hueco
                          key={m}
                          campo={campo}
                          momento={m}
                          foto={foto}
                          pedido={campo.momentos.includes(m)}
                          puedeSubir={puedeSubir}
                          ocupado={subiendo != null}
                          onAbrir={() => {
                            const i = galeria.indice.get(`${campo.id}:${m}`);
                            if (i != null) setVisor({ fotos: galeria.fotos, index: i });
                          }}
                          onTomar={() => abrirArchivo({ fieldId: campo.id, momento: m }, true)}
                          onAdjuntar={() => abrirArchivo({ fieldId: campo.id, momento: m }, false)}
                          onSoltar={(file) => void subirFoto(file, { fieldId: campo.id, momento: m })}
                          onEntrar={() => {
                            hoverRef.current = { fieldId: campo.id, momento: m };
                          }}
                        />
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {visor ? (
        <Visor fotos={visor.fotos} index={visor.index} onClose={cerrarVisor} onIndex={moverVisor} />
      ) : null}
    </section>
  );
}
