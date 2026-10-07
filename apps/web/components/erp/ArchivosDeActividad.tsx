"use client";

/**
 * «Archivos de evidencia» de una actividad comercial: Excel, Word, PDF o imágenes de la propuesta,
 * minutas y lo que mande el cliente.
 *
 * Se suben con el botón o arrastrando (varios a la vez; lo que pase de 25 MB o no sea de un tipo
 * aceptado se avisa antes de mandarlo). Tocar uno lo abre aquí mismo: el PDF con el visor pdf.js de
 * la web, la imagen desde un blob y Excel/CSV/Word con la vista previa HTML de la API dentro de un
 * `<iframe sandbox="">` (sin scripts). Todo se baja con la sesión; nada de `/uploads` directo.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useUser } from "@/components/UserContext";
import { Alert, Button, RecordSection, SkeletonRows } from "@/components/base";
import Modal from "@/components/ui/Modal";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { triggerBlobDownload } from "@/lib/file-download";
import {
  ACEPTA_ADJUNTOS,
  bajarArchivo,
  iconoYColor,
  listarAdjuntos,
  metaDeAdjunto,
  quitarAdjunto,
  revisarAntesDeSubir,
  subirAdjuntos,
  urlArchivoAdjunto,
  vistaPrevia,
  type AdjuntoActividad,
  type IconoAdjunto,
} from "@/lib/actividad-adjuntos-api";
import s from "./ArchivosDeActividad.module.css";

const PDFViewer = dynamic(() => import("@/components/PDFViewer"), {
  ssr: false,
  loading: () => <p className={s.estado}>Cargando visor…</p>,
});

const ICONOS: Record<IconoAdjunto, typeof PictureAsPdfOutlinedIcon> = {
  pdf: PictureAsPdfOutlinedIcon,
  hoja: TableChartOutlinedIcon,
  documento: DescriptionOutlinedIcon,
  imagen: ImageOutlinedIcon,
  archivo: InsertDriveFileOutlinedIcon,
};

const mensaje = (e: unknown, porOmision: string) => (e instanceof Error && e.message.trim() ? e.message : porOmision);

function IconoTipo({ tipo, grande = false }: { tipo: AdjuntoActividad["tipo"]; grande?: boolean }) {
  const { icono, color, etiqueta } = iconoYColor(tipo);
  const Icono = ICONOS[icono];
  return (
    <span
      className={`${s.icono} ${grande ? s.iconoGrande : ""}`}
      style={{ "--adj-color": color } as CSSProperties}
      title={etiqueta}
      aria-hidden="true"
    >
      <Icono fontSize="inherit" />
    </span>
  );
}

/** Descarga con el nombre original (en teléfono, la hoja de compartir del sistema). */
async function descargar(blob: Blob, a: AdjuntoActividad) {
  await triggerBlobDownload(blob, a.nombre, { mimeType: a.mimeType ?? undefined });
}

export default function ArchivosDeActividad({ activityId }: { activityId: number }) {
  const { token } = useUser();
  const [lista, setLista] = useState<AdjuntoActividad[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [encima, setEncima] = useState(false);
  const [abierto, setAbierto] = useState<AdjuntoActividad | null>(null);
  const [errorVisor, setErrorVisor] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<ConfirmState | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  /** dragenter/dragleave se disparan también al pasar por los hijos: se cuentan. */
  const profundidad = useRef(0);

  useEffect(() => {
    if (!token) return;
    const control = new AbortController();
    setErrorCarga(null);
    listarAdjuntos(token, activityId, control.signal)
      .then((rows) => setLista(rows))
      .catch((e) => {
        if (control.signal.aborted) return;
        setErrorCarga(mensaje(e, "No se pudieron cargar los archivos"));
      });
    return () => control.abort();
  }, [token, activityId, recarga]);

  const subir = useCallback(
    async (archivos: File[]) => {
      if (!token || subiendo) return;
      setError(null);
      const { listos, avisos: nuevos } = revisarAntesDeSubir(archivos);
      setAvisos(nuevos);
      if (!listos.length) return;
      setSubiendo(listos.length === 1 ? `Subiendo «${listos[0].name}»…` : `Subiendo ${listos.length} archivos…`);
      try {
        const creados = await subirAdjuntos(token, activityId, listos);
        const ids = new Set(creados.map((c) => c.id));
        setLista((prev) => [...creados, ...(prev ?? []).filter((p) => !ids.has(p.id))]);
      } catch (e) {
        setError(mensaje(e, "No se pudo subir el archivo"));
        // Si eran varias tandas, alguna pudo entrar: la lista se vuelve a pedir.
        setRecarga((n) => n + 1);
      } finally {
        setSubiendo(null);
      }
    },
    [token, activityId, subiendo],
  );

  const pedirQuitar = useCallback(
    (a: AdjuntoActividad, desdeVisor: boolean) => {
      if (!token || !a.puedeQuitar) return;
      setConfirmar({
        title: "Quitar archivo",
        message: `¿Quitar «${a.nombre}» de la actividad? Deja de verse aquí y en las apps.`,
        confirmLabel: "Quitar",
        danger: true,
        fn: async () => {
          try {
            await quitarAdjunto(token, activityId, a.id);
            setLista((prev) => (prev ?? []).filter((p) => p.id !== a.id));
            setAbierto((actual) => (actual?.id === a.id ? null : actual));
          } catch (e) {
            const texto = mensaje(e, "No se pudo quitar el archivo");
            if (desdeVisor) setErrorVisor(texto);
            else setError(texto);
          }
        },
      });
    },
    [token, activityId],
  );

  const hayArchivos = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const zonaEventos = {
    onDragEnter: (e: DragEvent<HTMLDivElement>) => {
      if (!hayArchivos(e)) return;
      e.preventDefault();
      profundidad.current += 1;
      setEncima(true);
    },
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (!hayArchivos(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = subiendo ? "none" : "copy";
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      if (!hayArchivos(e)) return;
      profundidad.current = Math.max(0, profundidad.current - 1);
      if (profundidad.current === 0) setEncima(false);
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      if (!hayArchivos(e)) return;
      e.preventDefault();
      profundidad.current = 0;
      setEncima(false);
      const archivos = Array.from(e.dataTransfer.files ?? []);
      if (archivos.length) void subir(archivos);
    },
  };

  const cerrarVisor = useCallback(() => {
    setAbierto(null);
    setErrorVisor(null);
  }, []);

  return (
    <RecordSection
      title="Archivos de evidencia"
      subtitle="Excel, Word, PDF o imágenes de la propuesta, minutas y lo que mande el cliente"
      end={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => entrada.current?.click()}
          disabled={!token || Boolean(subiendo)}
          loading={Boolean(subiendo)}
          iconStart={<AttachFileOutlinedIcon fontSize="inherit" />}
        >
          {subiendo ? "Subiendo…" : "Adjuntar archivo"}
        </Button>
      }
    >
      <input
        ref={entrada}
        type="file"
        multiple
        accept={ACEPTA_ADJUNTOS}
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const archivos = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          if (archivos.length) void subir(archivos);
        }}
      />

      <div className={`${s.zona} ${encima ? s.zonaActiva : ""}`} {...zonaEventos}>
        {subiendo ? (
          <div className={s.subiendo} role="status">
            <span>{subiendo}</span>
            <span className={s.barra} aria-hidden="true" />
          </div>
        ) : null}
        {avisos.length ? (
          <Alert tone="warning" title="No se subieron" onDismiss={() => setAvisos([])} dense>
            <ul className={s.avisos}>
              {avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {error ? (
          <Alert tone="danger" role="alert" onDismiss={() => setError(null)} dense>
            {error}
          </Alert>
        ) : null}

        {errorCarga ? (
          <Alert
            tone="danger"
            role="alert"
            dense
            action={
              <Button size="sm" variant="tertiary" onClick={() => setRecarga((n) => n + 1)}>
                Reintentar
              </Button>
            }
          >
            {errorCarga}
          </Alert>
        ) : lista == null ? (
          <SkeletonRows rows={2} label="Cargando archivos" />
        ) : lista.length === 0 ? (
          <div className={s.vacio}>
            <strong>Aún no hay archivos</strong>
            <span>Arrastra aquí Excel, Word, PDF o imágenes, o usa «Adjuntar archivo». Hasta 25 MB cada uno.</span>
          </div>
        ) : (
          <>
            <ul className={s.lista}>
              {lista.map((a) => (
                <li key={a.id} className={s.fila}>
                  <button
                    type="button"
                    className={s.abrir}
                    onClick={() => {
                      setErrorVisor(null);
                      setAbierto(a);
                    }}
                    aria-label={`Abrir ${a.nombre}`}
                  >
                    <IconoTipo tipo={a.tipo} />
                    <span className={s.textos}>
                      <span className={s.nombre}>{a.nombre}</span>
                      <span className={s.meta}>{metaDeAdjunto(a)}</span>
                    </span>
                  </button>
                  {a.puedeQuitar ? (
                    <Button
                      variant="danger-ghost"
                      size="sm"
                      icon
                      aria-label={`Quitar ${a.nombre}`}
                      title="Quitar"
                      onClick={() => pedirQuitar(a, false)}
                    >
                      <DeleteOutlineIcon fontSize="inherit" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className={s.pista}>Arrastra archivos aquí para adjuntarlos · hasta 25 MB cada uno</p>
          </>
        )}

        {encima ? (
          <div className={s.soltar} aria-hidden="true">
            <AttachFileOutlinedIcon fontSize="inherit" />
            Suelta para adjuntar
          </div>
        ) : null}
      </div>

      {abierto ? (
        <VisorAdjunto
          key={abierto.id}
          adjunto={abierto}
          token={token}
          error={errorVisor}
          onError={setErrorVisor}
          bloqueado={Boolean(confirmar)}
          onClose={cerrarVisor}
          onQuitar={() => pedirQuitar(abierto, true)}
        />
      ) : null}
      <ConfirmDialog state={confirmar} onClose={() => setConfirmar(null)} />
    </RecordSection>
  );
}

type Contenido =
  | { estado: "cargando" }
  | { estado: "error"; mensaje: string }
  | { estado: "pdf"; bytes: Uint8Array; blob: Blob }
  | { estado: "imagen"; url: string; blob: Blob }
  | { estado: "html"; html: string }
  | { estado: "sinVista"; blob?: Blob };

/** El archivo abierto en grande, con Descargar y (si se puede) Quitar. */
function VisorAdjunto({
  adjunto,
  token,
  error,
  onError,
  bloqueado,
  onClose,
  onQuitar,
}: {
  adjunto: AdjuntoActividad;
  token: string | null;
  error: string | null;
  onError: (mensaje: string | null) => void;
  /** Mientras la confirmación de «Quitar» está encima, Esc no cierra el visor. */
  bloqueado: boolean;
  onClose: () => void;
  onQuitar: () => void;
}) {
  const [contenido, setContenido] = useState<Contenido>({ estado: "cargando" });
  const [intento, setIntento] = useState(0);
  const [descargando, setDescargando] = useState(false);
  const { etiqueta } = iconoYColor(adjunto.tipo);

  useEffect(() => {
    const control = new AbortController();
    let urlObjeto: string | null = null;
    const { id, activityId, tipo } = adjunto;

    if (tipo !== "pdf" && tipo !== "imagen" && !adjunto.vistaPrevia) {
      setContenido({ estado: "sinVista" });
      return;
    }
    setContenido({ estado: "cargando" });
    void (async () => {
      try {
        if (tipo === "pdf" || tipo === "imagen") {
          const blob = await bajarArchivo(token, activityId, id, control.signal);
          if (control.signal.aborted) return;
          if (tipo === "pdf") {
            setContenido({ estado: "pdf", bytes: new Uint8Array(await blob.arrayBuffer()), blob });
          } else {
            urlObjeto = URL.createObjectURL(blob);
            setContenido({ estado: "imagen", url: urlObjeto, blob });
          }
        } else {
          const html = await vistaPrevia(token, activityId, id, control.signal);
          if (!control.signal.aborted) setContenido({ estado: "html", html });
        }
      } catch (e) {
        if (control.signal.aborted) return;
        setContenido({ estado: "error", mensaje: mensaje(e, "No se pudo abrir el archivo") });
      }
    })();

    return () => {
      control.abort();
      if (urlObjeto) URL.revokeObjectURL(urlObjeto);
    };
  }, [adjunto, token, intento]);

  async function alDescargar() {
    if (descargando) return;
    onError(null);
    const ya = "blob" in contenido ? contenido.blob : undefined;
    if (ya) {
      await descargar(ya, adjunto);
      return;
    }
    setDescargando(true);
    try {
      await descargar(await bajarArchivo(token, adjunto.activityId, adjunto.id), adjunto);
    } catch (e) {
      onError(mensaje(e, "No se pudo bajar el archivo"));
    } finally {
      setDescargando(false);
    }
  }

  const botonDescargar = (variant: "primary" | "secondary") => (
    <Button
      variant={variant}
      onClick={() => void alDescargar()}
      loading={descargando}
      iconStart={<DownloadOutlinedIcon fontSize="inherit" />}
    >
      Descargar
    </Button>
  );

  let cuerpo: ReactNode;
  switch (contenido.estado) {
    case "cargando":
      cuerpo = <p className={s.estado}>Abriendo «{adjunto.nombre}»…</p>;
      break;
    case "pdf":
      cuerpo = (
        <PDFViewer
          pdfUrl={urlArchivoAdjunto(adjunto.activityId, adjunto.id)}
          pdfData={contenido.bytes}
          fileName={adjunto.nombre}
          fillParent
        />
      );
      break;
    case "imagen":
      cuerpo = (
        <div className={s.lienzo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={contenido.url}
            alt={adjunto.nombre}
            className={s.imagen}
            // HEIC y otros que el navegador no pinta: se ofrece descargar.
            onError={() => setContenido({ estado: "sinVista", blob: contenido.blob })}
          />
        </div>
      );
      break;
    case "html":
      cuerpo = (
        <iframe
          className={s.marco}
          sandbox=""
          srcDoc={contenido.html}
          title={`Vista previa de ${adjunto.nombre}`}
          referrerPolicy="no-referrer"
        />
      );
      break;
    case "error":
      cuerpo = (
        <div className={s.tarjeta}>
          <IconoTipo tipo={adjunto.tipo} grande />
          <strong>No se pudo abrir aquí</strong>
          <span>{contenido.mensaje}</span>
          <div className={s.tarjetaAcciones}>
            <Button variant="secondary" onClick={() => setIntento((n) => n + 1)}>
              Reintentar
            </Button>
            {botonDescargar("primary")}
          </div>
        </div>
      );
      break;
    default:
      cuerpo = (
        <div className={s.tarjeta}>
          <IconoTipo tipo={adjunto.tipo} grande />
          <strong>Este tipo de archivo no se puede ver aquí</strong>
          <span>Descárgalo para abrirlo con su programa.</span>
          <div className={s.tarjetaAcciones}>{botonDescargar("primary")}</div>
        </div>
      );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={adjunto.nombre}
      description={[etiqueta, metaDeAdjunto(adjunto)].filter(Boolean).join(" · ")}
      maxWidth={1180}
      className={s.visor}
      dirty={bloqueado}
      onDirtyClose={() => false}
      footer={
        <>
          {adjunto.puedeQuitar ? (
            <Button
              variant="danger-ghost"
              className={s.quitar}
              onClick={onQuitar}
              iconStart={<DeleteOutlineIcon fontSize="inherit" />}
            >
              Quitar
            </Button>
          ) : null}
          {botonDescargar("secondary")}
        </>
      }
    >
      <div className={s.contenido}>
        {error ? (
          <Alert tone="danger" role="alert" onDismiss={() => onError(null)} dense>
            {error}
          </Alert>
        ) : null}
        {cuerpo}
      </div>
    </Modal>
  );
}
