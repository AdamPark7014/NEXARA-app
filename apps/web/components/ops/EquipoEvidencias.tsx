"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
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
import { useUser } from "@/components/UserContext";
import { formatoDistancia, type GeocercaAlerta } from "@/lib/activity-geofence";
import { formatApiError } from "@/lib/erp-api";
import { flattenServiceSheetFields, mapsUrl, resolveAssetUrl } from "@/lib/evidence-display";
import { digitalFormLabels, evidenceStepsForKind } from "@/lib/evidence-flow-helpers";
import {
  fetchTeamEvidence,
  revisarEvidencia,
  type TeamEvidence,
  type TeamEvidenceMember,
  type TeamEvidenceResponse,
  type TeamEvidenceReview,
  type TeamEvidenceSnapshot,
} from "@/lib/my-activities-api";

type Foto = { url: string; titulo: string; at?: string | null; lat?: number | null; lng?: number | null };
type AbrirVisor = (fotos: Foto[], index: number) => void;
type RevisionInicial = { decision: "aprobar" | "devolver"; pasos?: string[] };

const STEP_LABEL: Record<string, string> = {
  ENTRY_PHOTO: "Foto de entrada",
  EVIDENCE_PHOTOS: "Fotos en sitio",
  SERVICE_SHEET_PDF: "Hoja de servicio (PDF)",
  SERVICE_SHEET_DATA: "Formulario",
  EXIT_PHOTO: "Foto de salida",
};

const CALIF_LABEL = ["", "Deficiente", "Regular", "Buena", "Muy buena", "Excelente"];

const VERDE = "#16a34a";
const NARANJA = "#d97706";
const ROJO = "#dc2626";
const AZUL = "#2563eb";

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

type EstadoUi = { label: string; icon: SvgIconComponent; color: string };

function estadoUi(ev: TeamEvidence | null): EstadoUi | null {
  if (!ev) return null;
  if (ev.reviewStatus === "APPROVED") return { label: "Aprobada", icon: TaskAltIcon, color: VERDE };
  if (ev.reviewStatus === "REJECTED") return { label: "Corrigiendo", icon: UndoIcon, color: NARANJA };
  if (ev.status === "COMPLETED") {
    return ev.correctionSubmittedAt
      ? { label: "Corrección por revisar", icon: ReplayIcon, color: NARANJA }
      : { label: "Por revisar", icon: RateReviewOutlinedIcon, color: NARANJA };
  }
  return { label: "En curso", icon: HourglassTopIcon, color: AZUL };
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

const card: CSSProperties = {
  borderRadius: 18,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  padding: 16,
  display: "grid",
  gap: 14,
};

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
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const btnLleno = (color: string): CSSProperties => ({
  ...btn,
  border: 0,
  color: "#fff",
  background: color,
});

const linkBtn: CSSProperties = {
  border: 0,
  background: "transparent",
  padding: "4px 0",
  color: "var(--primary)",
  fontWeight: 650,
  fontSize: 12.5,
  cursor: "pointer",
  fontFamily: "inherit",
};

const campoLabel: CSSProperties = { fontSize: 13, fontWeight: 750 };

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
      style={{ display: "inline-flex", alignItems: "center", gap: 1, whiteSpace: "nowrap", color: "#f59e0b" }}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        n <= v ? (
          <StarIcon key={n} aria-hidden="true" sx={{ fontSize: size }} />
        ) : (
          <StarBorderIcon
            key={n}
            aria-hidden="true"
            sx={{ fontSize: size, color: "color-mix(in srgb, var(--text-tertiary) 55%, transparent)" }}
          />
        ),
      )}
    </span>
  );
}

type Archivo = { url: string; estado: "cargando" | "listo" | "error" };

/** Descarga con la sesión los archivos protegidos de /uploads y avisa si ya no existen en el servidor. */
function useArchivoProtegido(src: string | null | undefined, tipo?: string): Archivo {
  const url = resolveAssetUrl(src);
  const protegido = url.startsWith("/uploads/");
  const [archivo, setArchivo] = useState<Archivo>(() =>
    protegido ? { url: "", estado: "cargando" } : { url, estado: url ? "listo" : "error" },
  );

  useEffect(() => {
    if (!url) {
      setArchivo({ url: "", estado: "error" });
      return;
    }
    if (!protegido) {
      setArchivo({ url, estado: "listo" });
      return;
    }
    let cancelado = false;
    let blobUrl: string | null = null;
    setArchivo({ url: "", estado: "cargando" });
    void (async () => {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelado) return;
        // El PDF se embebe como blob con su tipo: así el visor del navegador lo muestra en vez de descargarlo.
        blobUrl = URL.createObjectURL(tipo ? new Blob([blob], { type: tipo }) : blob);
        setArchivo({ url: blobUrl, estado: "listo" });
      } catch {
        if (!cancelado) setArchivo({ url: "", estado: "error" });
      }
    })();
    return () => {
      cancelado = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url, protegido, tipo]);

  return archivo;
}

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
    <div
      role="img"
      aria-label={texto}
      style={{
        height: alto,
        minHeight: 90,
        display: "grid",
        placeContent: "center",
        justifyItems: "center",
        gap: 4,
        padding: 12,
        textAlign: "center",
        borderRadius: 12,
        border: "1px dashed var(--border)",
        background: "color-mix(in srgb, var(--text-secondary) 6%, var(--surface))",
        color: "var(--text-secondary)",
        fontSize: 12.5,
        lineHeight: 1.35,
      }}
    >
      <Icono aria-hidden="true" sx={{ fontSize: 22 }} />
      {texto}
    </div>
  );
}

export function FotoProtegida({ url, alt, style, alto }: { url: string; alt: string; style: CSSProperties; alto?: number }) {
  const foto = useArchivoProtegido(url);
  const [rota, setRota] = useState(false);
  if (foto.estado === "cargando") return <SinArchivo alto={alto} icono={HourglassTopIcon} texto="Cargando foto…" />;
  if (foto.estado === "error" || rota) return <SinArchivo alto={alto} texto="Esta foto ya no está en el servidor" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={foto.url} alt={alt} style={style} onError={() => setRota(true)} />;
}

const PDFViewer = dynamic(() => import("@/components/PDFViewer"), {
  ssr: false,
  loading: () => <SinArchivo alto={140} icono={HourglassTopIcon} texto="Cargando visor…" />,
});

/**
 * El PDF se descarga con la sesión y se dibuja con pdf.js (visor de la web).
 * `<object>` y el visor de Chrome en iframe los bloquea la CSP (`object-src 'none'`).
 */
export function VisorPdf({ url, alto = "620px" }: { url: string; alto?: "400px" | "500px" | "620px" }) {
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

function Avatar({ nombre, url, size = 44 }: { nombre: string; url: string | null; size?: number }) {
  const foto = useArchivoProtegido(url);
  if (url && foto.estado === "listo") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={foto.url}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
        fontWeight: 800,
        fontSize: size * 0.34,
        color: "var(--primary)",
        background: "color-mix(in srgb, var(--primary) 14%, var(--surface))",
      }}
    >
      {iniciales(nombre)}
    </div>
  );
}

function Barra({ pct }: { pct: number }) {
  const v = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
      <div
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          flex: 1,
          height: 8,
          borderRadius: 999,
          background: "color-mix(in srgb, var(--border) 80%, transparent)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${v}%`, height: "100%", borderRadius: 999, background: v >= 100 ? VERDE : "var(--primary)" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 750, minWidth: 34, textAlign: "right" }}>{v}%</span>
    </div>
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
    <section style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>
          {titulo}
          {hora ? <span style={{ fontWeight: 500, color: "var(--text-tertiary)", marginLeft: 8, fontSize: 12 }}>{hora}</span> : null}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Miniatura({ foto, onOpen, alto = 132 }: { foto: Foto; onOpen: () => void; alto?: number }) {
  const mapa = foto.lat != null && foto.lng != null ? mapsUrl(foto.lat, foto.lng) : null;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver en grande: ${foto.titulo}`}
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
          url={foto.url}
          alt={foto.titulo}
          alto={alto}
          style={{ width: "100%", height: alto, objectFit: "cover", display: "block" }}
        />
      </button>
      {mapa ? (
        <a href={mapa} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "var(--primary)", fontWeight: 650 }}>
          <IconLabel icon={PlaceOutlinedIcon} size={14} gap={4}>
            Ver en mapa
          </IconLabel>
        </a>
      ) : null}
    </div>
  );
}

/** Visor grande de fotos: anterior/siguiente con flechas, Esc para cerrar. */
function Visor({
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
  const nav: CSSProperties = {
    ...btn,
    background: "rgba(255,255,255,0.12)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.25)",
    minWidth: 44,
    justifyContent: "center",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={foto.titulo}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(2, 6, 23, 0.92)",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        padding: 16,
        gap: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, color: "#fff" }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{foto.titulo}</div>
          <div style={{ fontSize: 12.5, opacity: 0.8 }}>
            {[fmt(foto.at), `${index + 1} de ${fotos.length}`].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button type="button" onClick={onClose} style={nav} aria-label="Cerrar">
          <CloseIcon aria-hidden="true" sx={{ fontSize: 20 }} />
        </button>
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ display: "grid", placeItems: "center", minHeight: 0, overflow: "hidden" }}>
        <FotoProtegida
          key={foto.url}
          url={foto.url}
          alt={foto.titulo}
          alto={240}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 12 }}
        />
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}
      >
        <button type="button" style={nav} disabled={index === 0} onClick={() => onIndex(index - 1)}>
          ← Anterior
        </button>
        {mapa ? (
          <a href={mapa} target="_blank" rel="noreferrer" style={{ ...nav, textDecoration: "none" }}>
            <PlaceOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            Ver en mapa
          </a>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12.5 }}>Sin ubicación registrada</span>
        )}
        <button type="button" style={nav} disabled={index === fotos.length - 1} onClick={() => onIndex(index + 1)}>
          Siguiente →
        </button>
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
  if (!todos.length) return <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Sin datos capturados.</p>;
  return (
    <dl style={{ margin: 0, display: "grid", gap: 8 }}>
      {todos.map((c, i) => (
        <div
          key={`${c.label}-${i}`}
          style={{
            display: "grid",
            gap: 3,
            padding: "10px 12px",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--text-secondary) 6%, var(--surface))",
          }}
        >
          <dt style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{c.label}</dt>
          <dd style={{ margin: 0, fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
            {c.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.imageUrl}
                alt={c.label}
                style={{ maxWidth: 260, maxHeight: 120, background: "#fff", borderRadius: 8, border: "1px solid var(--border)" }}
              />
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
      <button type="button" style={linkBtn} onClick={() => onDevolverPaso(step)}>
        <IconLabel icon={UndoIcon} size={16} gap={4}>
          Devolver este paso
        </IconLabel>
      </button>
    ) : null;

  return (
    <>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 8,
        }}
      >
        {pasos.map((step) => {
          const hora = horaPaso(ev, step);
          const hecho = hora != null;
          const corregir = porCorregir.includes(step);
          const corregido = !corregir && hecho && corregidos.includes(step);
          const color = corregir ? NARANJA : corregido ? AZUL : hecho ? VERDE : null;
          const marca = corregir ? UndoIcon : corregido ? ReplayIcon : hecho ? CheckIcon : RadioButtonUncheckedIcon;
          return (
            <li
              key={step}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: `1px solid ${color ? `color-mix(in srgb, ${color} 35%, var(--border))` : "var(--border)"}`,
                background: color ? `color-mix(in srgb, ${color} 8%, var(--surface))` : "var(--surface)",
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 750 }}>
                <IconLabel icon={marca} size={16} gap={4} iconColor={color ?? "var(--text-tertiary)"}>
                  {STEP_LABEL[step] ?? step}
                </IconLabel>
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: corregir ? NARANJA : corregido ? AZUL : "var(--text-tertiary)",
                  marginTop: 2,
                  fontWeight: corregido ? 650 : undefined,
                }}
              >
                {corregir ? "Por corregir" : corregido ? `Corregido · ${fmt(hora) ?? ""}` : hecho ? fmt(hora) ?? "Hecho" : "Pendiente"}
              </div>
            </li>
          );
        })}
      </ol>

      {entrada != null || salida != null ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {entrada != null ? (
            <Seccion titulo="Entrada" hora={fmt(ev.entryPhotoUploadedAt)} accion={devolver("ENTRY_PHOTO")}>
              <Miniatura foto={fotos[entrada]} onOpen={() => abrirVisor(fotos, entrada)} alto={180} />
            </Seccion>
          ) : null}
          {salida != null ? (
            <Seccion titulo="Salida" hora={fmt(ev.exitPhotoUploadedAt)} accion={devolver("EXIT_PHOTO")}>
              <Miniatura foto={fotos[salida]} onOpen={() => abrirVisor(fotos, salida)} alto={180} />
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {sitio.map((idx) => (
              <Miniatura key={`${fotos[idx].url}-${idx}`} foto={fotos[idx]} onOpen={() => abrirVisor(fotos, idx)} />
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
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {revisiones.map((r) => {
          const aprobada = r.decision === "APROBADA";
          const color = aprobada ? VERDE : r.decision === "DEVUELTA_TODO" ? ROJO : NARANJA;
          return (
            <li
              key={r.id}
              style={{
                borderLeft: `3px solid ${color}`,
                padding: "10px 12px",
                borderRadius: 10,
                background: `color-mix(in srgb, ${color} 6%, var(--surface))`,
                display: "grid",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                <strong style={{ fontSize: 13.5 }}>
                  <IconLabel icon={aprobada ? TaskAltIcon : UndoIcon} size={16} iconColor={color}>
                    {aprobada ? "Aprobada" : r.decision === "DEVUELTA_TODO" ? "Devuelta completa" : "Devuelta para corregir"}
                  </IconLabel>
                </strong>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {corto(r.revisor) || "—"} · {fmt(r.at)}
                </span>
              </div>
              {r.calificacion ? <Estrellas valor={r.calificacion} /> : null}
              {r.decision === "DEVUELTA_PASOS" && r.pasos.length ? (
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                  Corregir: {r.pasos.map((p) => STEP_LABEL[p] ?? p).join(", ")}
                </div>
              ) : null}
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{r.observaciones}</p>
              {r.snapshot ? (
                <button
                  type="button"
                  style={{ ...linkBtn, justifySelf: "start" }}
                  aria-expanded={abierta === r.id}
                  onClick={() => setAbierta((v) => (v === r.id ? null : r.id))}
                >
                  {abierta === r.id ? "Ocultar lo que se devolvió" : "Ver lo que se devolvió"}
                </button>
              ) : null}
              {abierta === r.id && r.snapshot ? (
                <div style={{ display: "grid", gap: 12, marginTop: 6 }}>
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
      <Chip color={ROJO} icon={WrongLocationOutlinedIcon}>
        Fuera de zona
      </Chip>
    );
  }
  const sinJustificar = alertas.filter((a) => a.status !== "JUSTIFICADA").length;
  if (sinJustificar) {
    return (
      <Chip color={NARANJA} icon={WrongLocationOutlinedIcon}>
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
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {alertas.map((a) => {
          const justificada = a.status === "JUSTIFICADA";
          const color = justificada ? VERDE : a.abierta ? ROJO : NARANJA;
          const mapa = mapsUrl(a.latitude, a.longitude);
          const idxFoto = indice.get(a.id);
          return (
            <li
              key={a.id}
              style={{
                borderLeft: `3px solid ${color}`,
                padding: "10px 12px",
                borderRadius: 10,
                background: `color-mix(in srgb, ${color} 6%, var(--surface))`,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <strong style={{ fontSize: 13.5 }}>
                  <IconLabel icon={WrongLocationOutlinedIcon} size={16} iconColor={a.abierta ? ROJO : color}>
                    Salió {fmt(a.detectedAt) ?? ""}
                  </IconLabel>
                </strong>
                <Chip color={justificada ? VERDE : NARANJA} icon={justificada ? TaskAltIcon : HourglassTopIcon}>
                  {justificada ? "Justificada" : "Abierta"}
                </Chip>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12.5, color: "var(--text-secondary)" }}>
                <span>
                  Hasta <strong>{formatoDistancia(a.maxDistanciaM)}</strong> del punto de inicio (máx. {a.radioM} m)
                </span>
                {a.abierta ? (
                  <strong style={{ color: ROJO }}>Sigue fuera</strong>
                ) : (
                  <span>Regresó {fmt(a.returnedAt) ?? ""}</span>
                )}
                {mapa ? (
                  <a href={mapa} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", fontWeight: 650 }}>
                    <IconLabel icon={PlaceOutlinedIcon} size={14} gap={4}>
                      Dónde se detectó
                    </IconLabel>
                  </a>
                ) : null}
              </div>
              {a.justificacion ? (
                <div style={{ display: "grid", gap: 2 }}>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>«{a.justificacion}»</p>
                  {a.justificadaAt ? (
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Justificó {fmt(a.justificadaAt)}</span>
                  ) : null}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Todavía no lo justifica.</p>
              )}
              {idxFoto != null && fotos[idxFoto] ? (
                <div style={{ maxWidth: 180 }}>
                  <Miniatura foto={fotos[idxFoto]} onOpen={() => abrirVisor(fotos, idxFoto)} alto={120} />
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
  const colorConfirmar = decision === "aprobar" ? VERDE : todo ? ROJO : NARANJA;

  const opcion = (on: boolean, color: string): CSSProperties => ({
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    border: `1.5px solid ${on ? color : "var(--border)"}`,
    background: on ? `color-mix(in srgb, ${color} 8%, var(--surface))` : "var(--surface)",
    fontSize: 14,
    lineHeight: 1.35,
  });

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="revision-titulo"
      onClick={() => !saving && onClose()}
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
          maxWidth: 540,
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          background: "var(--surface)",
          borderRadius: 20,
          border: "1px solid var(--border)",
          boxShadow: "0 24px 60px rgba(2, 6, 23, 0.35)",
          padding: 20,
          display: "grid",
          gap: 16,
        }}
      >
        <header style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Avatar nombre={m.nombre} url={m.avatarUrl} size={40} />
          <div>
            <h3 id="revision-titulo" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              Revisar a {nombre}
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-secondary)" }}>
              Tu decisión, la calificación y tus observaciones le llegan y quedan en el historial.
            </p>
          </div>
        </header>

        <div role="radiogroup" aria-label="Decisión" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {(["aprobar", "devolver"] as const).map((d) => {
            const on = decision === d;
            const color = d === "aprobar" ? VERDE : NARANJA;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setDecision(d)}
                style={{
                  ...btn,
                  justifyContent: "center",
                  minHeight: 50,
                  fontSize: 15,
                  border: `2px solid ${on ? color : "var(--border)"}`,
                  background: on ? `color-mix(in srgb, ${color} 12%, var(--surface))` : "var(--surface)",
                  color: on ? color : "inherit",
                }}
              >
                {d === "aprobar" ? (
                  <TaskAltIcon aria-hidden="true" sx={{ fontSize: 20 }} />
                ) : (
                  <UndoIcon aria-hidden="true" sx={{ fontSize: 20 }} />
                )}
                {d === "aprobar" ? "Aprobar" : "Devolver"}
              </button>
            );
          })}
        </div>

        {decision === "devolver" ? (
          <fieldset style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: 8 }}>
            <legend style={{ ...campoLabel, marginBottom: 8 }}>¿Qué debe rehacer?</legend>
            <label style={opcion(!todo, NARANJA)}>
              <input type="radio" name="alcance" checked={!todo} onChange={() => setTodo(false)} style={{ marginTop: 3 }} />
              <span>
                <strong>Solo algunos pasos</strong>
                <br />
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>Corrige únicamente lo que marques; lo demás se queda.</span>
              </span>
            </label>
            {!todo ? (
              <div style={{ display: "grid", gap: 2, paddingLeft: 30 }}>
                {pasos.map((step) => (
                  <label key={step} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, minHeight: 38, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={marcados.includes(step)}
                      onChange={(e) =>
                        setMarcados((prev) => (e.target.checked ? [...prev, step] : prev.filter((s) => s !== step)))
                      }
                      style={{ width: 18, height: 18 }}
                    />
                    {STEP_LABEL[step] ?? step}
                  </label>
                ))}
              </div>
            ) : null}
            <label style={opcion(todo, ROJO)}>
              <input type="radio" name="alcance" checked={todo} onChange={() => setTodo(true)} style={{ marginTop: 3 }} />
              <span>
                <strong>Toda la actividad</strong>
                <br />
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                  Sus evidencias se vacían y las vuelve a subir desde cero. Lo que había queda guardado en el historial.
                </span>
              </span>
            </label>
          </fieldset>
        ) : null}

        <div style={{ display: "grid", gap: 4 }}>
          <span id="calif-label" style={campoLabel}>
            Eficiencia de {nombre}
          </span>
          <div
            role="radiogroup"
            aria-labelledby="calif-label"
            onMouseLeave={() => setHover(0)}
            style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={calificacion === n}
                aria-label={`${n} de 5: ${CALIF_LABEL[n]}`}
                onClick={() => setCalificacion(n)}
                onMouseEnter={() => setHover(n)}
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 32,
                  lineHeight: 1,
                  padding: 4,
                  minWidth: 44,
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: n <= valor ? "#f59e0b" : "color-mix(in srgb, var(--text-tertiary) 45%, transparent)",
                }}
              >
                {n <= valor ? (
                  <StarIcon fontSize="inherit" aria-hidden="true" />
                ) : (
                  <StarBorderIcon fontSize="inherit" aria-hidden="true" />
                )}
              </button>
            ))}
            <span style={{ fontSize: 13.5, fontWeight: 700, marginLeft: 6, color: valor ? "inherit" : "var(--text-tertiary)" }}>
              {valor ? CALIF_LABEL[valor] : "Toca una estrella"}
            </span>
          </div>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={campoLabel}>{decision === "aprobar" ? "¿Por qué la apruebas?" : "¿Qué debe corregir y por qué?"}</span>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={
              decision === "aprobar"
                ? "Ej. Fotos claras, hoja firmada por el gerente y dejó el sitio limpio."
                : "Ej. La foto de salida no muestra el equipo instalado; tómala de frente."
            }
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

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "#b91c1c" }}>
            {error}
          </p>
        ) : null}

        <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" style={btn} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={saving}
            style={{ ...btnLleno(colorConfirmar), opacity: saving ? 0.7 : 1 }}
          >
            {saving ? (
              "Guardando…"
            ) : (
              <>
                <IconoConfirmar aria-hidden="true" sx={{ fontSize: 18 }} />
                {confirmar}
              </>
            )}
          </button>
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
      style={{
        ...card,
        opacity: m.retiradoAt ? 0.75 : 1,
        borderColor: porRevisar ? `color-mix(in srgb, ${NARANJA} 45%, var(--border))` : undefined,
      }}
    >
      <header style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Avatar nombre={m.nombre} url={m.avatarUrl} />
        <div style={{ minWidth: 0, flex: "1 1 200px" }}>
          {m.avanceAnterior ? (
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {m.avanceAnterior} · solo lectura
            </div>
          ) : null}
          <div style={{ fontWeight: 800, fontSize: 15 }}>{m.nombre}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
            <Chip
              color={m.reparte ? "#7c3aed" : AZUL}
              icon={m.reparte ? SendOutlinedIcon : m.rol === "APOYO" ? HandshakeOutlinedIcon : EngineeringOutlinedIcon}
            >
              {m.reparte ? "La reparte" : m.rol === "APOYO" ? "Apoyo" : "La ejecuta"}
            </Chip>
            {estado ? (
              <Chip color={estado.color} icon={estado.icon}>
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
        {!m.reparte ? (
          <div style={{ flex: "0 1 180px" }}>
            <Barra pct={m.progressPct} />
          </div>
        ) : null}
        <button type="button" style={btn} onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
          {abierta ? "Ocultar" : "Ver detalle"}
        </button>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12.5, color: "var(--text-secondary)" }}>
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
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            padding: "10px 12px",
            borderRadius: 14,
            border: `1px solid color-mix(in srgb, ${NARANJA} 35%, var(--border))`,
            background: `color-mix(in srgb, ${NARANJA} 8%, var(--surface))`,
          }}
        >
          <span style={{ flex: "1 1 220px", fontSize: 13.5, fontWeight: 650, lineHeight: 1.45 }}>
            {esCorreccion ? (
              <>
                <IconoTexto icon={ReplayIcon} color={NARANJA} />
                Corrigió lo que se le devolvió
                {corregidos.length && ultimaDevolucion?.decision !== "DEVUELTA_TODO"
                  ? ` (${corregidos.map((s) => STEP_LABEL[s] ?? s).join(", ")})`
                  : " (rehízo toda la actividad)"}
                {ev?.correctionSubmittedAt ? ` · ${fmt(ev.correctionSubmittedAt)}` : ""}. Revisa la corrección y apruébala o
                devuélvela de nuevo.
              </>
            ) : (
              <>
                <IconoTexto icon={RateReviewOutlinedIcon} color={NARANJA} />
                Ya envió su evidencia. Revísala, califícala y apruébala o devuélvela.
              </>
            )}
          </span>
          <button type="button" style={btnLleno(VERDE)} onClick={() => onRevisar(m, { decision: "aprobar" })}>
            <TaskAltIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            Aprobar
          </button>
          <button type="button" style={btnLleno(NARANJA)} onClick={() => onRevisar(m, { decision: "devolver" })}>
            <UndoIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            Devolver
          </button>
        </div>
      ) : null}

      {m.puedoRevisar && ev?.reviewStatus === "APPROVED" ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13, color: "var(--text-secondary)" }}>
          <span style={{ flex: "1 1 220px" }}>
            <IconoTexto icon={TaskAltIcon} color={VERDE} />
            Aprobada{ev.reviewedBy ? ` por ${corto(ev.reviewedBy)}` : ""}
            {ev.reviewedAt ? ` · ${fmt(ev.reviewedAt)}` : ""}. ¿Encontraste algo mal?
          </span>
          <button type="button" style={btn} onClick={() => onRevisar(m, { decision: "devolver" })}>
            <UndoIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            Devolver
          </button>
        </div>
      ) : null}

      {corrigiendo.length ? (
        <p
          style={{
            margin: 0,
            padding: "8px 12px",
            borderRadius: 10,
            fontSize: 13,
            lineHeight: 1.45,
            background: `color-mix(in srgb, ${NARANJA} 8%, var(--surface))`,
          }}
        >
          <IconoTexto icon={UndoIcon} color={NARANJA} />
          Está corrigiendo: <strong>{corrigiendo.map((s) => STEP_LABEL[s] ?? s).join(", ")}</strong>
          {ev?.reviewNotes ? ` · «${ev.reviewNotes}»` : ""}
          {m.puedoRevisar || m.revisiones.length ? ". Cuando envíe la corrección podrás aprobarla o devolverla otra vez." : ""}
        </p>
      ) : null}

      {abierta ? (
        <>
          {m.indicaciones ? (
            <p
              style={{
                margin: 0,
                padding: "8px 12px",
                borderRadius: 10,
                fontSize: 13,
                background: "color-mix(in srgb, var(--text-secondary) 6%, var(--surface))",
              }}
            >
              <IconoTexto icon={ChatBubbleOutlineIcon} />
              {m.indicaciones}
            </p>
          ) : null}

          {m.reparte ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
              Su parte fue repartirla{m.pasoA.length ? "" : " (todavía no la pasa a nadie)"}; no sube evidencias.
            </p>
          ) : !ev ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Aún no empieza a subir evidencias.</p>
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
    return <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Cargando evidencias del equipo…</p>;
  }
  if (error && !data) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#b91c1c" }}>{error}</span>
        <button type="button" style={btn} onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!data) return null;

  const { members, activity, alcance, resumen } = data;
  const cadena = [members[0]?.asignadoPor, ...members.map((m) => m.nombre)]
    .filter((n, i, arr): n is string => Boolean(n) && arr.indexOf(n) === i)
    .map(corto);
  const finalizada = resumen.ejecutores > 0 && resumen.aprobadas >= resumen.ejecutores;
  const estadoActividad: EstadoUi = finalizada
    ? { label: "Finalizada: todo aprobado", icon: TaskAltIcon, color: VERDE }
    : resumen.ejecutores > 0 && resumen.terminaron >= resumen.ejecutores
      ? { label: "Por validar", icon: RateReviewOutlinedIcon, color: NARANJA }
      : { label: "En curso", icon: HourglassTopIcon, color: AZUL };

  if (compact) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Chip color={estadoActividad.color} icon={estadoActividad.icon}>
            {estadoActividad.label}
          </Chip>
          {resumen.ejecutores ? (
            <Chip>
              Aprobadas {resumen.aprobadas} de {resumen.ejecutores}
            </Chip>
          ) : null}
          {resumen.porRevisarMias ? (
            <Chip color={NARANJA} icon={RateReviewOutlinedIcon}>
              {resumen.porRevisarMias} por revisar
            </Chip>
          ) : null}
          {cadena.length > 1 ? (
            <IconLabel icon={LinkIcon} size={16} gap={4} style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              {cadena.join(" → ")}
            </IconLabel>
          ) : null}
        </div>
        {members.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Nadie en el equipo todavía.</p>
        ) : (
          members.map((m) => {
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
              <div
                key={m.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                <Avatar nombre={m.nombre} url={m.avatarUrl} size={34} />
                <div style={{ minWidth: 0, flex: "1 1 160px" }}>
                  <div style={{ fontWeight: 750, fontSize: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {corto(m.nombre)}
                    {m.eficienciaScore ? <Estrellas valor={m.eficienciaScore} size={12} /> : null}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
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
                  <Chip color={estado.color} icon={estado.icon}>
                    {estado.label}
                  </Chip>
                ) : null}
                {!m.reparte ? (
                  <div style={{ flex: "0 1 160px" }}>
                    <Barra pct={m.progressPct} />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
        {verMasHref ? (
          <Link href={verMasHref} style={{ ...btn, justifySelf: "start", color: "var(--primary)" }}>
            {resumen.porRevisarMias ? "Revisar evidencias →" : "Ver fotos, PDF y formularios →"}
          </Link>
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
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Evidencias del equipo</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
            {cadena.length > 1 ? (
              <>
                <IconoTexto icon={LinkIcon} />
                {`${cadena.join(" → ")} · `}
              </>
            ) : null}
            {alcanceTexto}
            {data.soloLectura && alcance !== "propio" ? " Solo lectura: puedes ver todo, no revisar." : ""}
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip color={estadoActividad.color} icon={estadoActividad.icon}>
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
        <button type="button" style={btn} onClick={() => void load()} disabled={loading}>
          {loading ? (
            "Actualizando…"
          ) : (
            <>
              <RefreshIcon aria-hidden="true" sx={{ fontSize: 18 }} />
              Actualizar
            </>
          )}
        </button>
      </div>

      {resumen.porRevisarMias ? (
        <p
          style={{
            margin: 0,
            padding: "10px 12px",
            borderRadius: 12,
            fontSize: 13.5,
            fontWeight: 650,
            background: `color-mix(in srgb, ${NARANJA} 10%, var(--surface))`,
            border: `1px solid color-mix(in srgb, ${NARANJA} 35%, var(--border))`,
          }}
        >
          <IconoTexto icon={RateReviewOutlinedIcon} color={NARANJA} />
          Tienes {resumen.porRevisarMias} evidencia{resumen.porRevisarMias === 1 ? "" : "s"} por revisar. La actividad queda
          finalizada cuando se aprueba la de todos.
        </p>
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

      {error ? <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{error}</p> : null}

      {members.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Nadie en el equipo todavía.</p>
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
