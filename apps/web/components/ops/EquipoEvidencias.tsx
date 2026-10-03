"use client";

import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SvgIconComponent } from "@mui/icons-material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import EngineeringOutlinedIcon from "@mui/icons-material/EngineeringOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LinkIcon from "@mui/icons-material/Link";
import MoveToInboxOutlinedIcon from "@mui/icons-material/MoveToInboxOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import ReplayIcon from "@mui/icons-material/Replay";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import UndoIcon from "@mui/icons-material/Undo";
import WrongLocationOutlinedIcon from "@mui/icons-material/WrongLocationOutlined";
import { IconLabel } from "@/components/ui/IconBadge";
import { Alert, Badge, Button, ButtonLink, Checkbox, Progress, SkeletonRows, Textarea, type Tone } from "@/components/base";
import { useArchivoProtegido } from "@/components/ops/_piezas";
import s from "./EquipoEvidencias.module.css";
import { useUser } from "@/components/UserContext";
import { formatoDistancia, type GeocercaAlerta } from "@/lib/activity-geofence";
import { formatApiError } from "@/lib/erp-api";
import { flattenServiceSheetFields, mapsUrl, resolveAssetUrl } from "@/lib/evidence-display";
import { digitalFormLabels, evidenceStepsForKind, textosDeInicioYCierre } from "@/lib/evidence-flow-helpers";
import {
  fetchTeamEvidence,
  revisarEvidencia,
  type TeamEvidence,
  type TeamEvidenceMember,
  type TeamEvidenceResponse,
  type TeamEvidenceReview,
  type TeamEvidenceSnapshot,
} from "@/lib/my-activities-api";

export type Foto = { url: string; titulo: string; at?: string | null; lat?: number | null; lng?: number | null };
type AbrirVisor = (fotos: Foto[], index: number) => void;
type RevisionInicial = { decision: "aprobar" | "devolver"; pasos?: string[] };

const STEP_LABEL: Record<string, string> = {
  ENTRY_PHOTO: "Foto de entrada",
  EVIDENCE_PHOTOS: "Fotos en sitio",
  SERVICE_SHEET_PDF: "Hoja de servicio (PDF)",
  SERVICE_SHEET_DATA: "Formulario",
  EXIT_PHOTO: "Foto de salida",
};

/** En comercial el primer y el último paso son «Inicio de actividad» y «Conclusión de actividad». */
function etiquetaDePaso(step: string, coreKind: string | null): string {
  if (step === "ENTRY_PHOTO") return textosDeInicioYCierre(coreKind).inicio.nombre;
  if (step === "EXIT_PHOTO") return textosDeInicioYCierre(coreKind).cierre.nombre;
  return STEP_LABEL[step] ?? step;
}

const CALIF_LABEL = ["", "Deficiente", "Regular", "Buena", "Muy buena", "Excelente"];

/** Color de los iconos sueltos (en texto corrido), del mismo mapa de tonos que las insignias. */
const VERDE = "var(--ui-success)";
const NARANJA = "var(--ui-warning)";
const ROJO = "var(--ui-danger)";
const AZUL = "var(--ui-info)";

function pasosDe(coreKind: string | null): string[] {
  return (evidenceStepsForKind(coreKind) as string[]).filter((s) => s !== "COMPLETED");
}

function fmt(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function corto(nombre?: string | null): string {
  return (nombre || "").split(/\s+/).slice(0, 2).join(" ");
}

/** Hora en que se completó cada paso (null si falta). */
function horaPaso(ev: TeamEvidenceSnapshot, step: string): string | null {
  switch (step) {
    case "ENTRY_PHOTO":
      return ev.entryPhotoUrl ? ev.entryPhotoUploadedAt ?? "" : null;
    case "EVIDENCE_PHOTOS":
      return ev.evidencePhotos?.length ? ev.evidencePhotosUploadedAt ?? "" : null;
    case "SERVICE_SHEET_PDF":
      return ev.serviceSheetPdfUrl ? ev.serviceSheetUploadedAt ?? "" : null;
    case "SERVICE_SHEET_DATA":
      return ev.serviceSheetCompletedAt ?? null;
    case "EXIT_PHOTO":
      return ev.exitPhotoUrl ? ev.exitPhotoUploadedAt ?? "" : null;
    default:
      return null;
  }
}

type EstadoUi = { label: string; icon: SvgIconComponent; tone: Tone };

function estadoUi(ev: TeamEvidence | null): EstadoUi | null {
  if (!ev) return null;
  if (ev.reviewStatus === "APPROVED") return { label: "Aprobada", icon: TaskAltIcon, tone: "success" };
  if (ev.reviewStatus === "REJECTED") return { label: "Corrigiendo", icon: UndoIcon, tone: "warning" };
  if (ev.status === "COMPLETED") {
    return ev.correctionSubmittedAt
      ? { label: "Corrección por revisar", icon: ReplayIcon, tone: "violet" }
      : { label: "Por revisar", icon: RateReviewOutlinedIcon, tone: "violet" };
  }
  return { label: "En curso", icon: HourglassTopIcon, tone: "info" };
}

function fotosDe(ev: TeamEvidenceSnapshot, nombre: string, etiqueta = "") {
  const quien = `${corto(nombre)}${etiqueta}`;
  const fotos: Foto[] = [];
  let entrada: number | null = null;
  let salida: number | null = null;
  const sitio: number[] = [];
  if (ev.entryPhotoUrl) {
    entrada = fotos.length;
    fotos.push({
      url: ev.entryPhotoUrl,
      titulo: `${quien} · Entrada`,
      at: ev.entryPhotoUploadedAt,
      lat: ev.entryLatitude,
      lng: ev.entryLongitude,
    });
  }
  (ev.evidencePhotos ?? []).forEach((url, i) => {
    const geo = ev.evidencePhotosGeo?.[i] ?? null;
    sitio.push(fotos.length);
    fotos.push({
      url,
      titulo: `${quien} · Foto en sitio ${i + 1}`,
      at: geo?.capturedAt ?? ev.evidencePhotosUploadedAt,
      lat: geo?.latitude ?? null,
      lng: geo?.longitude ?? null,
    });
  });
  if (ev.exitPhotoUrl) {
    salida = fotos.length;
    fotos.push({
      url: ev.exitPhotoUrl,
      titulo: `${quien} · Salida`,
      at: ev.exitPhotoUploadedAt,
      lat: ev.exitLatitude,
      lng: ev.exitLongitude,
    });
  }
  return { fotos, entrada, sitio, salida };
}

function Chip({ children, tone = "neutral", icon: Icon }: { children: ReactNode; tone?: Tone; icon?: SvgIconComponent }) {
  return (
    <Badge tone={tone} icon={Icon ? <Icon fontSize="inherit" /> : undefined}>
      {children}
    </Badge>
  );
}

/** Icono dentro de un párrafo que puede partirse en varias líneas. */
function IconoTexto({ icon: Icon, color, size = 16 }: { icon: SvgIconComponent; color?: string; size?: number }) {
  return (
    <Icon
      aria-hidden="true"
      sx={{ fontSize: size, verticalAlign: "text-bottom", mr: 0.75, ...(color ? { color } : {}) }}
    />
  );
}

function Estrellas({ valor, size = 14 }: { valor: number; size?: number }) {
  const v = Math.min(5, Math.max(0, Math.round(valor)));
  return (
    <span
      role="img"
      aria-label={`Eficiencia ${v} de 5: ${CALIF_LABEL[v] ?? ""}`}
      title={`Eficiencia ${v} de 5: ${CALIF_LABEL[v] ?? ""}`}
      className={s.estrellas}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        n <= v ? (
          <StarIcon key={n} aria-hidden="true" sx={{ fontSize: size }} />
        ) : (
          <StarBorderIcon key={n} aria-hidden="true" sx={{ fontSize: size }} className={s.estrellaVacia} />
        ),
      )}
    </span>
  );
}

/** Alturas fijas de miniaturas y huecos (clases, no estilos sueltos). */
const ALTO: Record<number, string> = {
  140: s.alto140,
  280: s.alto280,
  300: s.alto300,
  320: s.alto320,
  560: s.alto560,
};

function SinArchivo({
  alto,
  texto,
  icono: Icono = InboxOutlinedIcon,
}: {
  alto?: number;
  texto: string;
  icono?: SvgIconComponent;
}) {
  return (
    <div role="img" aria-label={texto} className={[s.sinArchivo, alto ? ALTO[alto] : ""].filter(Boolean).join(" ")}>
      <Icono aria-hidden="true" sx={{ fontSize: 22 }} />
      {texto}
    </div>
  );
}

export function FotoProtegida({
  url,
  alt,
  style,
  className,
  alto,
}: {
  url: string;
  alt: string;
  style?: CSSProperties;
  className?: string;
  alto?: number;
}) {
  const foto = useArchivoProtegido(url);
  const [rota, setRota] = useState(false);
  if (foto.estado === "cargando") return <SinArchivo alto={alto} icono={HourglassTopIcon} texto="Cargando foto…" />;
  if (foto.estado === "error" || rota) return <SinArchivo alto={alto} texto="Esta foto ya no está en el servidor" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={foto.url} alt={alt} style={style} className={className} onError={() => setRota(true)} />;
}

const PDFViewer = dynamic(() => import("@/components/PDFViewer"), {
  ssr: false,
  loading: () => <SinArchivo alto={140} icono={HourglassTopIcon} texto="Cargando visor…" />,
});

/**
 * El PDF se descarga con la sesión y se dibuja con pdf.js (visor de la web).
 * `<object>` y el visor de Chrome en iframe los bloquea la CSP (`object-src 'none'`).
 */
export function VisorPdf({
  url,
  alto = "700px",
}: {
  url: string;
  /** Alturas del visor; 700px default para preview de evidencia legible. */
  alto?: "400px" | "500px" | "620px" | "700px" | "800px";
}) {
  const ruta = resolveAssetUrl(url);
  const [pdf, setPdf] = useState<{ datos: Uint8Array | null; error: boolean }>({ datos: null, error: false });

  useEffect(() => {
    let cancelado = false;
    if (!ruta) {
      setPdf({ datos: null, error: true });
      return;
    }
    setPdf({ datos: null, error: false });
    void (async () => {
      try {
        const res = await fetch(ruta, { credentials: "include" });
        if (!res.ok) throw new Error(String(res.status));
        const datos = new Uint8Array(await res.arrayBuffer());
        if (!cancelado) setPdf({ datos, error: false });
      } catch {
        if (!cancelado) setPdf({ datos: null, error: true });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [ruta]);

  if (pdf.error) {
    return <SinArchivo alto={140} texto="El PDF ya no está en el servidor: hay que pedir que lo vuelva a subir." />;
  }
  if (!pdf.datos) return <SinArchivo alto={140} icono={HourglassTopIcon} texto="Cargando PDF…" />;
  return <PDFViewer pdfUrl={ruta} pdfData={pdf.datos} fileName="Hoja de servicio.pdf" height={alto} />;
}

const AVATAR: Record<number, string> = { 34: s.av34, 40: s.av40, 44: s.av44 };

/** Foto de la persona (protegida: se baja con la sesión) o sus iniciales. */
function Avatar({ nombre, url, size = 44 }: { nombre: string; url: string | null; size?: number }) {
  const foto = useArchivoProtegido(url);
  const tam = AVATAR[size] ?? s.av44;
  if (url && foto.estado === "listo") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={foto.url} alt="" width={size} height={size} className={`${s.avatar} ${tam}`} />;
  }
  return (
    <div aria-hidden className={`${s.avatar} ${s.avatarIni} ${tam}`}>
      {iniciales(nombre)}
    </div>
  );
}

function Barra({ pct }: { pct: number }) {
  const v = Math.min(100, Math.max(0, pct));
  return (
    <span className={s.barra}>
      <Progress value={v} max={100} tone={v >= 100 ? "success" : "brand"} ariaLabel="Avance de su evidencia" />
    </span>
  );
}

function Seccion({
  titulo,
  hora,
  accion,
  children,
}: {
  titulo: string;
  hora?: string | null;
  accion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={s.seccion}>
      <div className={s.seccionCabeza}>
        <div className={s.seccionT}>
          {titulo}
          {hora ? <span className={s.seccionHora}>{hora}</span> : null}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Miniatura({ foto, onOpen, alto = 300 }: { foto: Foto; onOpen: () => void; alto?: number }) {
  const mapa = foto.lat != null && foto.lng != null ? mapsUrl(foto.lat, foto.lng) : null;
  return (
    <div className={s.mini}>
      {/* La miniatura es el botón «ver en grande»: imagen a sangre, no cabe en Button. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver en grande: ${foto.titulo}`}
        className={[s.miniBtn, ALTO[alto] ?? s.alto300].join(" ")}
      >
        <FotoProtegida url={foto.url} alt={foto.titulo} alto={alto} className={[s.miniImg, ALTO[alto] ?? s.alto300].join(" ")} />
      </button>
      {mapa ? (
        <a href={mapa} target="_blank" rel="noreferrer" className={s.enlace}>
          <IconLabel icon={PlaceOutlinedIcon} size={14} gap={4}>
            Ver en mapa
          </IconLabel>
        </a>
      ) : null}
    </div>
  );
}

/** Visor grande de fotos: anterior/siguiente con flechas, Esc para cerrar. */
export function Visor({
  fotos,
  index,
  onClose,
  onIndex,
}: {
  fotos: Foto[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const foto = fotos[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < fotos.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, fotos.length, onClose, onIndex]);

  if (!foto || typeof document === "undefined") return null;
  const mapa = foto.lat != null && foto.lng != null ? mapsUrl(foto.lat, foto.lng) : null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={foto.titulo} onClick={onClose} className={s.visor}>
      <div onClick={(e) => e.stopPropagation()} className={s.visorCabeza}>
        <div className={s.visorTexto}>
          <div className={s.visorT}>{foto.titulo}</div>
          <div className={s.visorM}>{[fmt(foto.at), `${index + 1} de ${fotos.length}`].filter(Boolean).join(" · ")}</div>
        </div>
        <Button variant="secondary" size="lg" icon onClick={onClose} aria-label="Cerrar">
          <CloseIcon fontSize="inherit" />
        </Button>
      </div>
      <div onClick={(e) => e.stopPropagation()} className={s.visorCuerpo}>
        <FotoProtegida key={foto.url} url={foto.url} alt={foto.titulo} alto={560} className={s.visorImg} />
      </div>
      <div onClick={(e) => e.stopPropagation()} className={s.visorPie}>
        <Button variant="secondary" size="lg" disabled={index === 0} onClick={() => onIndex(index - 1)}>
          ← Anterior
        </Button>
        {mapa ? (
          <ButtonLink
            href={mapa}
            target="_blank"
            rel="noreferrer"
            variant="secondary"
            size="lg"
            iconStart={<PlaceOutlinedIcon fontSize="inherit" />}
          >
            Ver en mapa
          </ButtonLink>
        ) : (
          <span className={s.visorSinMapa}>Sin ubicación registrada</span>
        )}
        <Button variant="secondary" size="lg" disabled={index === fotos.length - 1} onClick={() => onIndex(index + 1)}>
          Siguiente →
        </Button>
      </div>
    </div>,
    document.body,
  );
}

function Formulario({ data, coreKind }: { data: unknown; coreKind: string | null }) {
  const obj = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (!obj) return null;
  const etiquetas = digitalFormLabels(coreKind);
  const conocidas = new Set(etiquetas.map((l) => l.key));
  const campos = etiquetas
    .map((l) => ({ label: l.label, value: String(obj[l.key] ?? "").trim(), imageUrl: undefined as string | undefined }))
    .filter((c) => c.value);
  // Formularios viejos (p. ej. firma del gerente como imagen) también se muestran.
  const extras = flattenServiceSheetFields(Object.fromEntries(Object.entries(obj).filter(([k]) => !conocidas.has(k))));
  const todos = [...campos, ...extras];
  if (!todos.length) return <p className={s.muted}>Sin datos capturados.</p>;
  return (
    <dl className={s.form}>
      {todos.map((c, i) => (
        <div key={`${c.label}-${i}`} className={s.formFila}>
          <dt>{c.label}</dt>
          <dd>
            {c.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.imageUrl} alt={c.label} className={s.formImg} />
            ) : (
              c.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Pasos, fotos, PDF y formulario de una evidencia (la actual o la copia de una devolución). */
function EvidenciaContenido({
  ev,
  coreKind,
  nombre,
  etiqueta,
  porCorregir = [],
  corregidos = [],
  abrirVisor,
  onDevolverPaso,
}: {
  ev: TeamEvidenceSnapshot;
  coreKind: string | null;
  nombre: string;
  etiqueta?: string;
  porCorregir?: string[];
  /** Pasos que ya rehizo tras la última devolución (se marcan para revisarlos primero). */
  corregidos?: string[];
  abrirVisor: AbrirVisor;
  onDevolverPaso?: (step: string) => void;
}) {
  const { fotos, entrada, sitio, salida } = useMemo(() => fotosDe(ev, nombre, etiqueta), [ev, nombre, etiqueta]);
  const pasos = pasosDe(coreKind);
  const devolver = (step: string) =>
    onDevolverPaso ? (
      <Button variant="link" size="sm" onClick={() => onDevolverPaso(step)} iconStart={<UndoIcon fontSize="inherit" />}>
        Devolver este paso
      </Button>
    ) : null;

  return (
    <>
      <ol className={s.pasos}>
        {pasos.map((step) => {
          const hora = horaPaso(ev, step);
          const hecho = hora != null;
          const corregir = porCorregir.includes(step);
          const corregido = !corregir && hecho && corregidos.includes(step);
          const color = corregir ? NARANJA : corregido ? AZUL : hecho ? VERDE : null;
          const marca = corregir ? UndoIcon : corregido ? ReplayIcon : hecho ? CheckIcon : RadioButtonUncheckedIcon;
          const estado = corregir ? "corregir" : corregido ? "corregido" : hecho ? "hecho" : "pendiente";
          return (
            <li key={step} className={s.paso} data-estado={estado}>
              <div className={s.pasoT}>
                <IconLabel icon={marca} size={16} gap={4} iconColor={color ?? "var(--ui-fg-3)"}>
                  {etiquetaDePaso(step, coreKind)}
                </IconLabel>
              </div>
              <div className={s.pasoM}>
                {corregir ? "Por corregir" : corregido ? `Corregido · ${fmt(hora) ?? ""}` : hecho ? fmt(hora) ?? "Hecho" : "Pendiente"}
              </div>
            </li>
          );
        })}
      </ol>

      {entrada != null || salida != null ? (
        <div className={s.rejilla}>
          {entrada != null ? (
            <Seccion titulo={textosDeInicioYCierre(coreKind).inicio.corto} hora={fmt(ev.entryPhotoUploadedAt)} accion={devolver("ENTRY_PHOTO")}>
              <Miniatura foto={fotos[entrada]} onOpen={() => abrirVisor(fotos, entrada)} alto={320} />
            </Seccion>
          ) : null}
          {salida != null ? (
            <Seccion titulo={textosDeInicioYCierre(coreKind).cierre.corto} hora={fmt(ev.exitPhotoUploadedAt)} accion={devolver("EXIT_PHOTO")}>
              <Miniatura foto={fotos[salida]} onOpen={() => abrirVisor(fotos, salida)} alto={320} />
            </Seccion>
          ) : null}
        </div>
      ) : null}

      {sitio.length ? (
        <Seccion
          titulo={`Fotos en sitio (${sitio.length})`}
          hora={fmt(ev.evidencePhotosUploadedAt)}
          accion={devolver("EVIDENCE_PHOTOS")}
        >
          <div className={s.rejillaFotos}>
            {sitio.map((idx) => (
              <Miniatura key={`${fotos[idx].url}-${idx}`} foto={fotos[idx]} onOpen={() => abrirVisor(fotos, idx)} alto={300} />
            ))}
          </div>
        </Seccion>
      ) : null}

      {ev.serviceSheetPdfUrl ? (
        <Seccion titulo="Hoja de servicio" hora={fmt(ev.serviceSheetUploadedAt)} accion={devolver("SERVICE_SHEET_PDF")}>
          <VisorPdf url={ev.serviceSheetPdfUrl} />
        </Seccion>
      ) : null}

      {ev.serviceSheetData ? (
        <Seccion titulo="Formulario" hora={fmt(ev.serviceSheetCompletedAt)} accion={devolver("SERVICE_SHEET_DATA")}>
          <Formulario data={ev.serviceSheetData} coreKind={coreKind} />
        </Seccion>
      ) : null}
    </>
  );
}

function Historial({
  revisiones,
  coreKind,
  nombre,
  abrirVisor,
}: {
  revisiones: TeamEvidenceReview[];
  coreKind: string | null;
  nombre: string;
  abrirVisor: AbrirVisor;
}) {
  const [abierta, setAbierta] = useState<number | null>(null);
  if (!revisiones.length) return null;
  return (
    <Seccion titulo={`Revisiones (${revisiones.length})`}>
      <ol className={s.registros}>
        {revisiones.map((r) => {
          const aprobada = r.decision === "APROBADA";
          const color = aprobada ? VERDE : r.decision === "DEVUELTA_TODO" ? ROJO : NARANJA;
          const tono = aprobada ? "success" : r.decision === "DEVUELTA_TODO" ? "danger" : "warning";
          return (
            <li key={r.id} className={s.registro} data-tono={tono}>
              <div className={s.registroCabeza}>
                <strong className={s.registroT}>
                  <IconLabel icon={aprobada ? TaskAltIcon : UndoIcon} size={16} iconColor={color}>
                    {aprobada ? "Aprobada" : r.decision === "DEVUELTA_TODO" ? "Devuelta completa" : "Devuelta para corregir"}
                  </IconLabel>
                </strong>
                <span className={s.registroM}>
                  {corto(r.revisor) || "—"} · {fmt(r.at)}
                </span>
              </div>
              {r.calificacion ? <Estrellas valor={r.calificacion} /> : null}
              {r.decision === "DEVUELTA_PASOS" && r.pasos.length ? (
                <div className={s.registroSub}>Corregir: {r.pasos.map((p) => etiquetaDePaso(p, coreKind)).join(", ")}</div>
              ) : null}
              <p className={s.texto}>{r.observaciones}</p>
              {r.snapshot ? (
                <Button
                  variant="link"
                  size="sm"
                  className={s.inicio}
                  aria-expanded={abierta === r.id}
                  onClick={() => setAbierta((v) => (v === r.id ? null : r.id))}
                >
                  {abierta === r.id ? "Ocultar lo que se devolvió" : "Ver lo que se devolvió"}
                </Button>
              ) : null}
              {abierta === r.id && r.snapshot ? (
                <div className={s.devuelto}>
                  <EvidenciaContenido ev={r.snapshot} coreKind={coreKind} nombre={nombre} etiqueta=" (devuelta)" abrirVisor={abrirVisor} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Seccion>
  );
}

/** Resumen en una etiqueta: sigue fuera, salidas sin justificar o solo cuántas hubo. */
function ChipZona({ alertas }: { alertas: GeocercaAlerta[] }) {
  if (!alertas.length) return null;
  if (alertas.some((a) => a.abierta)) {
    return (
      <Chip tone="danger" icon={WrongLocationOutlinedIcon}>
        Fuera de zona
      </Chip>
    );
  }
  const sinJustificar = alertas.filter((a) => a.status !== "JUSTIFICADA").length;
  if (sinJustificar) {
    return (
      <Chip tone="warning" icon={WrongLocationOutlinedIcon}>
        {sinJustificar === 1 ? "Salida de zona sin justificar" : `${sinJustificar} salidas de zona sin justificar`}
      </Chip>
    );
  }
  return (
    <Chip icon={WrongLocationOutlinedIcon}>
      {alertas.length === 1 ? "1 salida de zona" : `${alertas.length} salidas de zona`}
    </Chip>
  );
}

/** Veces que salió de los 100 m alrededor de su punto de inicio, con su justificación y foto. */
function SalidasDeZona({
  alertas,
  nombre,
  abrirVisor,
}: {
  alertas: GeocercaAlerta[];
  nombre: string;
  abrirVisor: AbrirVisor;
}) {
  const { fotos, indice } = useMemo(() => {
    const lista: Foto[] = [];
    const porAlerta = new Map<number, number>();
    for (const a of alertas) {
      if (!a.fotoUrl) continue;
      porAlerta.set(a.id, lista.length);
      lista.push({
        url: a.fotoUrl,
        titulo: `${corto(nombre)} · Justificación de salida de zona`,
        at: a.justificadaAt ?? a.detectedAt,
      });
    }
    return { fotos: lista, indice: porAlerta };
  }, [alertas, nombre]);

  if (!alertas.length) return null;
  return (
    <Seccion titulo={`Salidas de zona (${alertas.length})`}>
      <ol className={s.registros}>
        {alertas.map((a) => {
          const justificada = a.status === "JUSTIFICADA";
          const color = justificada ? VERDE : a.abierta ? ROJO : NARANJA;
          const tono = justificada ? "success" : a.abierta ? "danger" : "warning";
          const mapa = mapsUrl(a.latitude, a.longitude);
          const idxFoto = indice.get(a.id);
          return (
            <li key={a.id} className={s.registro} data-tono={tono}>
              <div className={s.registroCabeza}>
                <strong className={s.registroT}>
                  <IconLabel icon={WrongLocationOutlinedIcon} size={16} iconColor={a.abierta ? ROJO : color}>
                    Salió {fmt(a.detectedAt) ?? ""}
                  </IconLabel>
                </strong>
                <Chip tone={justificada ? "success" : "warning"} icon={justificada ? TaskAltIcon : HourglassTopIcon}>
                  {justificada ? "Justificada" : "Abierta"}
                </Chip>
              </div>
              <div className={s.datos}>
                <span>
                  Hasta <strong>{formatoDistancia(a.maxDistanciaM)}</strong> del punto de inicio (máx. {a.radioM} m)
                </span>
                {a.abierta ? <strong className={s.peligro}>Sigue fuera</strong> : <span>Regresó {fmt(a.returnedAt) ?? ""}</span>}
                {mapa ? (
                  <a href={mapa} target="_blank" rel="noreferrer" className={s.enlace}>
                    <IconLabel icon={PlaceOutlinedIcon} size={14} gap={4}>
                      Dónde se detectó
                    </IconLabel>
                  </a>
                ) : null}
              </div>
              {a.justificacion ? (
                <div className={s.justificacion}>
                  <p className={s.texto}>«{a.justificacion}»</p>
                  {a.justificadaAt ? <span className={s.registroM}>Justificó {fmt(a.justificadaAt)}</span> : null}
                </div>
              ) : (
                <p className={s.muted}>Todavía no lo justifica.</p>
              )}
              {idxFoto != null && fotos[idxFoto] ? (
                <div className={s.fotoZona}>
                  <Miniatura foto={fotos[idxFoto]} onOpen={() => abrirVisor(fotos, idxFoto)} alto={280} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Seccion>
  );
}

function RevisionModal({
  activityId,
  m,
  coreKind,
  inicial,
  onClose,
  onDone,
}: {
  activityId: number;
  m: TeamEvidenceMember;
  coreKind: string | null;
  inicial: RevisionInicial;
  onClose: () => void;
  onDone: (data: TeamEvidenceResponse, aviso: string) => void;
}) {
  const { token } = useUser();
  const pasos = pasosDe(coreKind);
  const [decision, setDecision] = useState(inicial.decision);
  const [todo, setTodo] = useState(false);
  const [marcados, setMarcados] = useState<string[]>(inicial.pasos ?? []);
  const [calificacion, setCalificacion] = useState(0);
  const [hover, setHover] = useState(0);
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const nombre = corto(m.nombre);
  const faltan: string[] = [];
  if (decision === "devolver" && !todo && marcados.length === 0) faltan.push("marca qué pasos debe corregir");
  if (!calificacion) faltan.push("califica su eficiencia");
  if (observaciones.trim().length < 5) {
    faltan.push(decision === "aprobar" ? "escribe por qué la apruebas" : "escribe qué debe corregir");
  }

  const enviar = async () => {
    if (faltan.length) {
      setError(`Falta: ${faltan.join(", ")}.`);
      return;
    }
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const data = await revisarEvidencia(token, activityId, m.userId, {
        decision,
        pasos: decision === "devolver" && !todo ? marcados : undefined,
        todo: decision === "devolver" ? todo : undefined,
        observaciones: observaciones.trim(),
        calificacion,
      });
      onDone(
        data,
        decision === "aprobar"
          ? `Aprobaste la evidencia de ${nombre}.`
          : todo
            ? `Devolviste toda la evidencia a ${nombre}: la rehace desde cero.`
            : `Devolviste ${marcados.length} paso${marcados.length === 1 ? "" : "s"} a ${nombre}.`,
      );
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar la revisión"));
    } finally {
      setSaving(false);
    }
  };

  const valor = hover || calificacion;
  const confirmar =
    decision === "aprobar"
      ? "Aprobar"
      : todo
        ? "Devolver todo"
        : `Devolver${marcados.length ? ` ${marcados.length}` : ""} paso${marcados.length === 1 ? "" : "s"}`;
  const IconoConfirmar = decision === "aprobar" ? TaskAltIcon : UndoIcon;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="revision-titulo"
      onClick={() => !saving && onClose()}
      className={s.overlay}
    >
      <div onClick={(e) => e.stopPropagation()} className={s.dialogo}>
        <header className={s.dialogoCabeza}>
          <Avatar nombre={m.nombre} url={m.avatarUrl} size={40} />
          <div>
            <h3 id="revision-titulo" className={s.dialogoT}>
              Revisar a {nombre}
            </h3>
            <p className={s.dialogoD}>Tu decisión, la calificación y tus observaciones le llegan y quedan en el historial.</p>
          </div>
        </header>

        <div role="radiogroup" aria-label="Decisión" className={s.decisiones}>
          {(["aprobar", "devolver"] as const).map((d) => {
            const on = decision === d;
            return (
              <Button
                key={d}
                role="radio"
                aria-checked={on}
                size="lg"
                className={s.decision}
                data-tono={d === "aprobar" ? "success" : "warning"}
                onClick={() => setDecision(d)}
                iconStart={d === "aprobar" ? <TaskAltIcon fontSize="inherit" /> : <UndoIcon fontSize="inherit" />}
              >
                {d === "aprobar" ? "Aprobar" : "Devolver"}
              </Button>
            );
          })}
        </div>

        {decision === "devolver" ? (
          <fieldset className={s.alcance}>
            <legend className={s.etiqueta}>¿Qué debe rehacer?</legend>
            <label className={s.opcion} data-on={!todo ? "true" : undefined} data-tono="warning">
              <input type="radio" name="alcance" checked={!todo} onChange={() => setTodo(false)} className={s.radio} />
              <span>
                <strong>Solo algunos pasos</strong>
                <span className={s.opcionD}>Corrige únicamente lo que marques; lo demás se queda.</span>
              </span>
            </label>
            {!todo ? (
              <div className={s.pasosMarcar}>
                {pasos.map((step) => (
                  <Checkbox
                    key={step}
                    label={etiquetaDePaso(step, coreKind)}
                    checked={marcados.includes(step)}
                    onChange={(e) =>
                      setMarcados((prev) => (e.target.checked ? [...prev, step] : prev.filter((x) => x !== step)))
                    }
                  />
                ))}
              </div>
            ) : null}
            <label className={s.opcion} data-on={todo ? "true" : undefined} data-tono="danger">
              <input type="radio" name="alcance" checked={todo} onChange={() => setTodo(true)} className={s.radio} />
              <span>
                <strong>Toda la actividad</strong>
                <span className={s.opcionD}>
                  Sus evidencias se vacían y las vuelve a subir desde cero. Lo que había queda guardado en el historial.
                </span>
              </span>
            </label>
          </fieldset>
        ) : null}

        <div className={s.calif}>
          <span id="calif-label" className={s.etiqueta}>
            Eficiencia de {nombre}
          </span>
          <div role="radiogroup" aria-labelledby="calif-label" onMouseLeave={() => setHover(0)} className={s.estrellasElegir}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                variant="ghost"
                size="lg"
                icon
                role="radio"
                aria-checked={calificacion === n}
                aria-label={`${n} de 5: ${CALIF_LABEL[n]}`}
                onClick={() => setCalificacion(n)}
                onMouseEnter={() => setHover(n)}
                className={s.estrella}
                data-on={n <= valor ? "true" : undefined}
              >
                {n <= valor ? <StarIcon fontSize="inherit" /> : <StarBorderIcon fontSize="inherit" />}
              </Button>
            ))}
            <span className={s.califT} data-vacio={valor ? undefined : "true"}>
              {valor ? CALIF_LABEL[valor] : "Toca una estrella"}
            </span>
          </div>
        </div>

        <label className={s.campo}>
          <span className={s.etiqueta}>{decision === "aprobar" ? "¿Por qué la apruebas?" : "¿Qué debe corregir y por qué?"}</span>
          <Textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={
              decision === "aprobar"
                ? "Ej. Fotos claras, hoja firmada por el gerente y dejó el sitio limpio."
                : "Ej. La foto de salida no muestra el equipo instalado; tómala de frente."
            }
          />
        </label>

        {error ? (
          <p role="alert" className={s.error}>
            {error}
          </p>
        ) : null}

        <footer className={s.dialogoPie}>
          <Button variant="tertiary" size="lg" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant={decision === "aprobar" ? "primary" : "danger"}
            size="lg"
            onClick={() => void enviar()}
            loading={saving}
            iconStart={<IconoConfirmar fontSize="inherit" />}
          >
            {saving ? "Guardando…" : confirmar}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function TarjetaPersona({
  m,
  coreKind,
  abrirVisor,
  onRevisar,
}: {
  m: TeamEvidenceMember;
  coreKind: string | null;
  abrirVisor: AbrirVisor;
  onRevisar: (m: TeamEvidenceMember, inicial: RevisionInicial) => void;
}) {
  const ev = m.evidence;
  const estado = m.reparte ? null : estadoUi(ev);
  const porRevisar =
    m.puedoRevisar && ev?.status === "COMPLETED" && ev.reviewStatus !== "APPROVED" && ev.reviewStatus !== "REJECTED";
  const [abierta, setAbierta] = useState(!m.reparte);
  const corrigiendo = ev?.reviewStatus === "REJECTED" ? m.rejectedSteps : [];
  // Tras corregir, la última devolución dice qué rehizo: se resalta para revisar eso primero.
  const ultimaDevolucion = m.revisiones.find((r) => r.decision !== "APROBADA") ?? null;
  const esCorreccion = Boolean(
    ev?.correctionSubmittedAt && ev.status === "COMPLETED" && ev.reviewStatus !== "APPROVED" && ultimaDevolucion,
  );
  const corregidos = esCorreccion && ultimaDevolucion ? ultimaDevolucion.pasos : [];
  const devolverPaso = m.puedoRevisar ? (step: string) => onRevisar(m, { decision: "devolver", pasos: [step] }) : undefined;
  const alertasZona = m.alertasZona ?? [];

  return (
    <article
      className={s.tarjeta}
      data-revisar={porRevisar ? "true" : undefined}
      data-retirado={m.retiradoAt ? "true" : undefined}
    >
      <header className={s.tarjetaCabeza}>
        <Avatar nombre={m.nombre} url={m.avatarUrl} />
        <div className={s.tarjetaQuien}>
          {m.avanceAnterior ? <div className={s.anterior}>{m.avanceAnterior} · solo lectura</div> : null}
          <div className={s.nombre}>{m.nombre}</div>
          <div className={s.chips}>
            <Chip
              tone={m.reparte ? "violet" : "info"}
              icon={m.reparte ? SendOutlinedIcon : m.rol === "APOYO" ? HandshakeOutlinedIcon : EngineeringOutlinedIcon}
            >
              {m.reparte ? "La reparte" : m.rol === "APOYO" ? "Apoyo" : "La ejecuta"}
            </Chip>
            {estado ? (
              <Chip tone={estado.tone} icon={estado.icon}>
                {estado.label}
              </Chip>
            ) : null}
            <ChipZona alertas={alertasZona} />
            {m.eficienciaScore ? <Estrellas valor={m.eficienciaScore} /> : null}
            {m.pasadaA ? (
              <Chip icon={SendOutlinedIcon}>La continúa {corto(m.pasadaA.nombre)}</Chip>
            ) : m.retiradoAt ? (
              <Chip>Salió del equipo</Chip>
            ) : null}
          </div>
        </div>
        {!m.reparte ? <Barra pct={m.progressPct} /> : null}
        <Button size="sm" variant="tertiary" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
          {abierta ? "Ocultar" : "Ver detalle"}
        </Button>
      </header>

      <div className={s.datos}>
        <IconLabel icon={MoveToInboxOutlinedIcon} size={16} gap={4}>
          Recibió {fmt(m.asignadoAt) ?? ""}
          {m.asignadoPor && m.asignadoPor !== m.nombre ? ` de ${corto(m.asignadoPor)}` : ""}
        </IconLabel>
        {m.pasadaA ? (
          <IconLabel icon={SendOutlinedIcon} size={16} gap={4}>
            {m.pasadaA.por ? `${corto(m.pasadaA.por)} la pasó` : "Se la pasaron"} a {corto(m.pasadaA.nombre)} · {fmt(m.pasadaA.at)}
            {m.pasadaA.motivo ? ` · Motivo: ${m.pasadaA.motivo}` : ""}
          </IconLabel>
        ) : null}
        {m.pasoA.map((p) => (
          <IconLabel key={`${p.nombre}-${p.at}`} icon={SendOutlinedIcon} size={16} gap={4}>
            La pasó a {corto(p.nombre)} · {fmt(p.at)}
          </IconLabel>
        ))}
        {ev?.completedAt && ev.status === "COMPLETED" ? (
          <IconLabel icon={Inventory2OutlinedIcon} size={16} gap={4}>
            Envió {fmt(ev.completedAt)}
          </IconLabel>
        ) : null}
      </div>

      {porRevisar ? (
        <Alert
          tone="warning"
          icon={<RateReviewOutlinedIcon fontSize="inherit" />}
          action={
            <span className={s.revisarAcciones}>
              <Button variant="primary" onClick={() => onRevisar(m, { decision: "aprobar" })} iconStart={<TaskAltIcon fontSize="inherit" />}>
                Aprobar
              </Button>
              <Button variant="secondary" onClick={() => onRevisar(m, { decision: "devolver" })} iconStart={<UndoIcon fontSize="inherit" />}>
                Devolver
              </Button>
            </span>
          }
        >
          {esCorreccion ? (
            <>
              Corrigió lo que se le devolvió
              {corregidos.length && ultimaDevolucion?.decision !== "DEVUELTA_TODO"
                ? ` (${corregidos.map((x) => etiquetaDePaso(x, coreKind)).join(", ")})`
                : " (rehízo toda la actividad)"}
              {ev?.correctionSubmittedAt ? ` · ${fmt(ev.correctionSubmittedAt)}` : ""}. Revisa la corrección y apruébala o
              devuélvela de nuevo.
            </>
          ) : (
            <>Ya envió su evidencia. Revísala, califícala y apruébala o devuélvela.</>
          )}
        </Alert>
      ) : null}

      {m.puedoRevisar && ev?.reviewStatus === "APPROVED" ? (
        <div className={s.aprobada}>
          <span className={s.aprobadaT}>
            <IconoTexto icon={TaskAltIcon} color={VERDE} />
            Aprobada{ev.reviewedBy ? ` por ${corto(ev.reviewedBy)}` : ""}
            {ev.reviewedAt ? ` · ${fmt(ev.reviewedAt)}` : ""}. ¿Encontraste algo mal?
          </span>
          <Button size="sm" variant="secondary" onClick={() => onRevisar(m, { decision: "devolver" })} iconStart={<UndoIcon fontSize="inherit" />}>
            Devolver
          </Button>
        </div>
      ) : null}

      {corrigiendo.length ? (
        <p className={s.corrigiendo}>
          <IconoTexto icon={UndoIcon} color={NARANJA} />
          Está corrigiendo: <strong>{corrigiendo.map((x) => etiquetaDePaso(x, coreKind)).join(", ")}</strong>
          {ev?.reviewNotes ? ` · «${ev.reviewNotes}»` : ""}
          {m.puedoRevisar || m.revisiones.length ? ". Cuando envíe la corrección podrás aprobarla o devolverla otra vez." : ""}
        </p>
      ) : null}

      {abierta ? (
        <>
          {m.indicaciones ? (
            <p className={s.indicaciones}>
              <IconoTexto icon={ChatBubbleOutlineIcon} />
              {m.indicaciones}
            </p>
          ) : null}

          {m.reparte ? (
            <p className={s.muted}>
              Su parte fue repartirla{m.pasoA.length ? "" : " (todavía no la pasa a nadie)"}; no sube evidencias.
            </p>
          ) : !ev ? (
            <p className={s.muted}>Aún no empieza a subir evidencias.</p>
          ) : (
            <EvidenciaContenido
              ev={ev}
              coreKind={coreKind}
              nombre={m.nombre}
              porCorregir={corrigiendo}
              corregidos={corregidos}
              abrirVisor={abrirVisor}
              onDevolverPaso={ev.status === "COMPLETED" ? devolverPaso : undefined}
            />
          )}

          <SalidasDeZona alertas={alertasZona} nombre={m.nombre} abrirVisor={abrirVisor} />

          <Historial revisiones={m.revisiones} coreKind={coreKind} nombre={m.nombre} abrirVisor={abrirVisor} />
        </>
      ) : null}
    </article>
  );
}

type Props = {
  activityId: number;
  /** Resumen por persona (pestaña Detalle) con enlace a la vista completa. */
  compact?: boolean;
  verMasHref?: string;
};

/**
 * Evidencias del equipo por persona y en orden de la cadena (Christian → Luis → Antonio → ingeniero).
 * La API decide qué ve cada quien y a quién puede aprobar o devolver.
 */
export default function EquipoEvidencias({ activityId, compact = false, verMasHref }: Props) {
  const { token } = useUser();
  const [data, setData] = useState<TeamEvidenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visor, setVisor] = useState<{ fotos: Foto[]; index: number } | null>(null);
  const [revisando, setRevisando] = useState<{ m: TeamEvidenceMember; inicial: RevisionInicial } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !activityId) return;
    setLoading(true);
    try {
      setData(await fetchTeamEvidence(token, activityId));
      setError(null);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar las evidencias del equipo"));
    } finally {
      setLoading(false);
    }
  }, [token, activityId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 6000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const abrirVisor = useCallback<AbrirVisor>((fotos, index) => {
    if (index >= 0 && fotos[index]) setVisor({ fotos, index });
  }, []);
  const cerrarVisor = useCallback(() => setVisor(null), []);
  const cerrarRevision = useCallback(() => setRevisando(null), []);

  if (loading && !data) {
    return <SkeletonRows rows={3} label="Cargando evidencias del equipo…" />;
  }
  if (error && !data) {
    return (
      <Alert
        tone="danger"
        role="alert"
        action={
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Reintentar
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }
  if (!data) return null;

  const { members, activity, alcance, resumen } = data;
  const cadena = [members[0]?.asignadoPor, ...members.map((m) => m.nombre)]
    .filter((n, i, arr): n is string => Boolean(n) && arr.indexOf(n) === i)
    .map(corto);
  const finalizada = resumen.ejecutores > 0 && resumen.aprobadas >= resumen.ejecutores;
  const estadoActividad: EstadoUi = finalizada
    ? { label: "Finalizada: todo aprobado", icon: TaskAltIcon, tone: "success" }
    : resumen.ejecutores > 0 && resumen.terminaron >= resumen.ejecutores
      ? { label: "Por validar", icon: RateReviewOutlinedIcon, tone: "violet" }
      : { label: "En curso", icon: HourglassTopIcon, tone: "info" };

  if (compact) {
    return (
      <div className={s.compacto}>
        <div className={s.chips}>
          <Chip tone={estadoActividad.tone} icon={estadoActividad.icon}>
            {estadoActividad.label}
          </Chip>
          {resumen.ejecutores ? (
            <Chip>
              Aprobadas {resumen.aprobadas} de {resumen.ejecutores}
            </Chip>
          ) : null}
          {resumen.porRevisarMias ? (
            <Chip tone="violet" icon={RateReviewOutlinedIcon}>
              {resumen.porRevisarMias} por revisar
            </Chip>
          ) : null}
          {cadena.length > 1 ? (
            <span className={s.cadena}>
              <IconLabel icon={LinkIcon} size={16} gap={4}>
                {cadena.join(" → ")}
              </IconLabel>
            </span>
          ) : null}
        </div>
        {members.length === 0 ? (
          <p className={s.muted}>Nadie en el equipo todavía.</p>
        ) : (
          <ul className={s.filas}>
            {members.map((m) => {
              const ev = m.evidence;
              const fotos = ev ? (ev.entryPhotoUrl ? 1 : 0) + ev.evidencePhotos.length + (ev.exitPhotoUrl ? 1 : 0) : 0;
              const estado = m.reparte ? null : estadoUi(ev);
              const partes: { key: string; icon?: SvgIconComponent; texto: string }[] = [
                fotos
                  ? { key: "fotos", icon: PhotoCameraOutlinedIcon, texto: `${fotos} foto${fotos === 1 ? "" : "s"}` }
                  : { key: "fotos", texto: "Sin fotos aún" },
                ...(ev?.serviceSheetPdfUrl ? [{ key: "pdf", icon: DescriptionOutlinedIcon, texto: "PDF" }] : []),
                ...(ev?.serviceSheetCompletedAt ? [{ key: "form", icon: FactCheckOutlinedIcon, texto: "Formulario" }] : []),
              ];
              return (
                <li key={m.userId} className={s.fila}>
                  <Avatar nombre={m.nombre} url={m.avatarUrl} size={34} />
                  <div className={s.filaQuien}>
                    <div className={s.filaNombre}>
                      {corto(m.nombre)}
                      {m.eficienciaScore ? <Estrellas valor={m.eficienciaScore} size={12} /> : null}
                    </div>
                    <div className={s.filaM}>
                      {m.reparte ? (
                        <IconLabel icon={SendOutlinedIcon} size={14} gap={4}>
                          {m.pasoA.length ? `La pasó a ${m.pasoA.map((p) => corto(p.nombre)).join(", ")}` : "La reparte"}
                        </IconLabel>
                      ) : (
                        partes.map((p, i) => (
                          <Fragment key={p.key}>
                            {i ? " · " : null}
                            {p.icon ? (
                              <IconLabel icon={p.icon} size={14} gap={4}>
                                {p.texto}
                              </IconLabel>
                            ) : (
                              p.texto
                            )}
                          </Fragment>
                        ))
                      )}
                    </div>
                  </div>
                  <ChipZona alertas={m.alertasZona ?? []} />
                  {estado ? (
                    <Chip tone={estado.tone} icon={estado.icon}>
                      {estado.label}
                    </Chip>
                  ) : null}
                  {!m.reparte ? <Barra pct={m.progressPct} /> : null}
                </li>
              );
            })}
          </ul>
        )}
        {verMasHref ? (
          <ButtonLink href={verMasHref} size="sm" variant={resumen.porRevisarMias ? "tonal" : "tertiary"} className={s.inicio}>
            {resumen.porRevisarMias ? "Revisar evidencias →" : "Ver fotos, PDF y formularios →"}
          </ButtonLink>
        ) : null}
      </div>
    );
  }

  const alcanceTexto =
    alcance === "todo"
      ? "Ves a toda la cadena."
      : alcance === "equipo"
        ? "Ves lo que hizo tu equipo a partir de ti."
        : "Estas son tus evidencias.";

  return (
    <section className={s.completo} aria-labelledby="equipo-evidencias-titulo">
      <div className={s.completoCabeza}>
        <div className={s.completoTexto}>
          <h2 id="equipo-evidencias-titulo" className={s.completoT}>
            Evidencias del equipo
          </h2>
          <p className={s.completoD}>
            {cadena.length > 1 ? (
              <>
                <IconoTexto icon={LinkIcon} />
                {`${cadena.join(" → ")} · `}
              </>
            ) : null}
            {alcanceTexto}
            {data.soloLectura && alcance !== "propio" ? " Solo lectura: puedes ver todo, no revisar." : ""}
          </p>
          <div className={s.chips}>
            <Chip tone={estadoActividad.tone} icon={estadoActividad.icon}>
              {estadoActividad.label}
            </Chip>
            {resumen.ejecutores ? (
              <>
                <Chip>
                  Enviaron {resumen.terminaron} de {resumen.ejecutores}
                </Chip>
                <Chip>
                  Aprobadas {resumen.aprobadas} de {resumen.ejecutores}
                </Chip>
              </>
            ) : null}
            {activity.fechaFinalizacion && finalizada ? <Chip>Cerrada {fmt(activity.fechaFinalizacion)}</Chip> : null}
          </div>
        </div>
        <Button size="sm" variant="tertiary" onClick={() => void load()} loading={loading} iconStart={<RefreshIcon fontSize="inherit" />}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </div>

      {resumen.porRevisarMias ? (
        <Alert tone="warning" icon={<RateReviewOutlinedIcon fontSize="inherit" />}>
          Tienes {resumen.porRevisarMias} evidencia{resumen.porRevisarMias === 1 ? "" : "s"} por revisar. La actividad queda
          finalizada cuando se aprueba la de todos.
        </Alert>
      ) : null}

      {aviso ? (
        <Alert tone="success" role="status">
          {aviso}
        </Alert>
      ) : null}

      {error ? (
        <p role="alert" className={s.error}>
          {error}
        </p>
      ) : null}

      {members.length === 0 ? (
        <p className={s.muted}>Nadie en el equipo todavía.</p>
      ) : (
        members.map((m) => (
          <TarjetaPersona
            key={m.userId}
            m={m}
            coreKind={activity.coreKind}
            abrirVisor={abrirVisor}
            onRevisar={(mm, inicial) => setRevisando({ m: mm, inicial })}
          />
        ))
      )}

      {visor ? (
        <Visor
          fotos={visor.fotos}
          index={visor.index}
          onClose={cerrarVisor}
          onIndex={(i) => setVisor((v) => (v ? { ...v, index: i } : v))}
        />
      ) : null}

      {revisando ? (
        <RevisionModal
          activityId={activityId}
          m={revisando.m}
          coreKind={activity.coreKind}
          inicial={revisando.inicial}
          onClose={cerrarRevision}
          onDone={(nuevo, texto) => {
            setData(nuevo);
            setRevisando(null);
            setAviso(texto);
          }}
        />
      ) : null}
    </section>
  );
}
