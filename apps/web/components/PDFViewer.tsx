"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./PDFViewer.module.css";
import { triggerBlobDownload, triggerFileDownload } from "@/lib/file-download";
import { isCapacitorNative } from "@/lib/capacitor-env";
import { openExternalUrl } from "@/lib/open-external-url";

type PdfJs = typeof import("pdfjs-dist");

/** pdf.js se carga una vez en el navegador (worker en `public/`, v3.11.174). */
let pdfjsCargado: Promise<PdfJs> | null = null;
function cargarPdfJs(): Promise<PdfJs> {
  if (!pdfjsCargado) {
    pdfjsCargado = import("pdfjs-dist").then((m) => {
      const pdfjs = ((m as unknown as { default?: PdfJs }).default ?? m) as PdfJs;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
      return pdfjs;
    });
  }
  return pdfjsCargado;
}

const HEIGHT_PRESETS: Record<string, string> = {
  "400px": styles.viewerH400,
  "500px": styles.viewerH500,
  "600px": styles.viewerH600,
  "620px": styles.viewerH620,
  "700px": styles.viewerH700,
  "800px": styles.viewerH800,
};

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
const ZOOM_DEFAULT = 1;

/** Full devicePixelRatio for canvas backing store; cap 3 for memory. No 0.85 under-render. */
function pixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
}

interface PDFViewerProps {
  pdfUrl: string;
  pdfData?: Uint8Array | null;
  fileName?: string;
  height?: string;
  /** Ocupa el espacio vertical restante del modal (flex). */
  fillParent?: boolean;
}

export default function PDFViewer({
  pdfUrl,
  pdfData,
  fileName = "Documento.pdf",
  height = "600px",
  fillParent = false,
}: PDFViewerProps) {
  const presetClass = HEIGHT_PRESETS[height];
  const useDynamicHeight = !fillParent && !presetClass;
  const viewerHeightClass = fillParent
    ? `${styles.viewer} ${styles.viewerFill}`
    : `${styles.viewer} ${presetClass ?? styles.viewerDynamic}`;
  const viewerInlineStyle: React.CSSProperties | undefined =
    useDynamicHeight && height ? { height } : undefined;

  const pagesHostRef = useRef<HTMLDivElement>(null);
  const paintGen = useRef(0);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  const handleDownload = async () => {
    if (pdfData?.length) {
      const blob = new Blob([new Uint8Array(pdfData)], { type: "application/pdf" });
      await triggerBlobDownload(blob, fileName, { mimeType: "application/pdf" });
      return;
    }
    await triggerFileDownload(pdfUrl, fileName, {
      preferOpenOnMobile: true,
      mimeType: "application/pdf",
    });
  };

  const handleOpenExternal = async (e: React.MouseEvent) => {
    const http = /^https?:\/\//i.test(pdfUrl);
    if (!http) {
      e.preventDefault();
      await handleDownload();
      return;
    }
    if (isCapacitorNative()) {
      e.preventDefault();
      await openExternalUrl(pdfUrl);
    } else {
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleErrorOpenExternal = async () => {
    const http = /^https?:\/\//i.test(pdfUrl);
    if (http) {
      await openExternalUrl(pdfUrl);
      return;
    }
    await handleDownload();
  };

  const paint = useCallback(async () => {
    const host = pagesHostRef.current;
    if (!host || !pdfUrl) return;

    const gen = ++paintGen.current;
    setLoading(true);
    setError(null);

    let documento: Awaited<ReturnType<PdfJs["getDocument"]>["promise"]> | null = null;
    try {
      const pdfjs = await cargarPdfJs();
      if (gen !== paintGen.current) return;

      if (pdfData?.length) {
        documento = await pdfjs.getDocument({ data: pdfData.slice(), isEvalSupported: false }).promise;
      } else {
        documento = await pdfjs
          .getDocument({ url: pdfUrl, withCredentials: true, isEvalSupported: false })
          .promise;
      }
      if (gen !== paintGen.current) return;

      const dpr = pixelRatio();
      const hojas: HTMLElement[] = [];

      for (let n = 1; n <= documento.numPages; n += 1) {
        if (gen !== paintGen.current) return;
        const pagina = await documento.getPage(n);
        // Logical viewport at user zoom; backing store at zoom × dpr (standard HiDPI).
        const viewport = pagina.getViewport({ scale: zoom });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = styles.pageCanvas;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Página ${n} de ${documento.numPages}`);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          pagina.cleanup();
          continue;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await pagina.render({ canvasContext: ctx, viewport }).promise;
        pagina.cleanup();

        const wrap = document.createElement("div");
        wrap.className = styles.pageWrap;
        wrap.appendChild(canvas);
        hojas.push(wrap);
      }

      if (gen !== paintGen.current) return;
      host.replaceChildren(...hojas);
      setPageCount(documento.numPages);
      setLoading(false);
    } catch (e) {
      if (gen !== paintGen.current) return;
      const msg = e instanceof Error ? e.message : "error de visor";
      setError(msg);
      setLoading(false);
      host.replaceChildren();
    } finally {
      if (documento) void documento.destroy();
    }
  }, [pdfUrl, pdfData, zoom]);

  useEffect(() => {
    void paint();
    return () => {
      paintGen.current += 1;
    };
  }, [paint]);

  const bumpZoom = (delta: number) => {
    setZoom((z) => {
      const next = Math.round((z + delta) / ZOOM_STEP) * ZOOM_STEP;
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(next.toFixed(2))));
    });
  };

  if (!pdfUrl) {
    return (
      <div className={styles.pdfContainer}>
        <div className={styles.noData}>No hay PDF para mostrar</div>
      </div>
    );
  }

  const containerClass = `${styles.pdfContainer}${fillParent ? ` ${styles.pdfContainerFill}` : ""}`;
  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <div className={containerClass}>
      <div className={styles.header}>
        <div className={styles.info}>
          <h3 className={styles.fileName}>📄 {fileName}</h3>
          {pageCount > 0 ? (
            <p className={styles.meta}>
              {pageCount} {pageCount === 1 ? "página" : "páginas"} · {zoomLabel}
            </p>
          ) : null}
        </div>
        <div className={styles.actions}>
          <div className={styles.zoomGroup} role="group" aria-label="Zoom">
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => bumpZoom(-ZOOM_STEP)}
              disabled={zoom <= ZOOM_MIN || loading}
              title="Alejar"
              aria-label="Alejar"
            >
              −
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary} ${styles.zoomReset}`}
              onClick={() => setZoom(ZOOM_DEFAULT)}
              disabled={zoom === ZOOM_DEFAULT || loading}
              title="Restablecer zoom"
              aria-label="Restablecer zoom a 100%"
            >
              {zoomLabel}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => bumpZoom(ZOOM_STEP)}
              disabled={zoom >= ZOOM_MAX || loading}
              title="Acercar"
              aria-label="Acercar"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => void handleDownload()}
            title={isCapacitorNative() ? "Guardar o compartir PDF" : "Descargar PDF"}
          >
            {isCapacitorNative() ? "📤 Guardar / compartir" : "📥 Descargar"}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={(e) => void handleOpenExternal(e)}
          >
            🔗 Abrir fuera del visor
          </button>
        </div>
      </div>

      <div className={viewerHeightClass} style={viewerInlineStyle}>
        {error ? (
          <div className={styles.error}>
            No se pudo previsualizar el PDF: {error}
            <div>
              <button
                type="button"
                className={styles.errorOpenBtn}
                onClick={() => void handleErrorOpenExternal()}
              >
                Abrir PDF en nueva pestaña
              </button>
            </div>
          </div>
        ) : null}
        {loading && !error ? <div className={styles.noData}>Cargando documento…</div> : null}
        <div
          ref={pagesHostRef}
          className={styles.pagesHost}
          hidden={Boolean(error) || (loading && pageCount === 0)}
        />
      </div>
    </div>
  );
}
