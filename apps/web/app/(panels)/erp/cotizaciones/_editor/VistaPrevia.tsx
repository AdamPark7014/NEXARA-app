"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { vistaPreviaEnVivo, type GuardarCotizacion } from "@/lib/cotizaciones-api";
import {
  crearProgramador,
  leerSecciones,
  paginaDeSeccion,
  seMovioSeccion,
  type PaginasDeSecciones,
  type Programador,
  type SeccionPropuesta,
} from "@/lib/vista-previa-vivo";
import styles from "./editor.module.css";

type PdfJs = typeof import("pdfjs-dist");

/** pdf.js se carga una vez y solo en el navegador (el worker es el de `public/`, versión 3.11.174). */
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

const MARGEN = 16;
const suave = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

/**
 * El PDF real, el mismo que recibe el cliente, al lado del editor y **mientras se escribe**.
 *
 * - Pide `POST /cotizaciones/:id/pdf/vista-previa` con el borrador en pantalla ~600 ms después de
 *   la última tecla (independiente del autoguardado); una petición nueva cancela la anterior y una
 *   respuesta vieja nunca pisa a la nueva (`crearProgramador`).
 * - Dibuja cada hoja con pdf.js en un `<canvas>` fuera de la pantalla y cambia todas de golpe: no
 *   parpadea en blanco y la posición de lectura se queda donde estaba.
 * - Sigue al cursor: al escribir en 01–04 lleva la vista a la hoja donde empieza esa sección (la API
 *   lo dice en `X-Propuesta-Secciones`).
 *
 * Nada de `<iframe>`: la CSP de la web (`default-src 'self'`, sin `frame-src`) no deja enmarcar un
 * `blob:`. Y nada del visor de @react-pdf-viewer: rehacía el documento completo en cada cambio.
 */
export default function VistaPrevia({
  cotizacionId,
  token,
  borrador,
  visible,
  seccion,
  recarga,
}: {
  cotizacionId: number | null;
  token: string | null;
  /** Lo que está en pantalla, con la forma del autoguardado. */
  borrador: GuardarCotizacion;
  visible: boolean;
  /** Sección donde está el cursor (la vista previa va a su hoja). */
  seccion: SeccionPropuesta | null;
  /** Sube cuando cambió algo que no viaja en el borrador (planos subidos, paquete, envío). */
  recarga: number;
}) {
  const [paginas, setPaginas] = useState(0);
  const [actualizando, setActualizando] = useState(false);
  /** Las hojas nuevas se están dibujando (la respuesta ya llegó, falta cambiarlas). */
  const [pintando, setPintando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlAbrir, setUrlAbrir] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const hojas = useRef<HTMLDivElement>(null);
  const programador = useRef<Programador<GuardarCotizacion> | null>(null);
  const borradorRef = useRef(borrador);
  borradorRef.current = borrador;
  const seccionRef = useRef(seccion);
  seccionRef.current = seccion;
  const secciones = useRef<PaginasDeSecciones>({});
  const ultimoPdf = useRef<Uint8Array | null>(null);
  const pintura = useRef(0);
  const anchoPintado = useRef(0);
  const pendienteDeVer = useRef(false);

  const irAPagina = useCallback((pagina: number, comportamiento: ScrollBehavior = suave()) => {
    const caja = scroller.current;
    const hoja = hojas.current?.children[pagina - 1] as HTMLElement | undefined;
    if (!caja || !hoja) return;
    caja.scrollTo({ top: Math.max(0, hoja.offsetTop - MARGEN), behavior: comportamiento });
  }, []);

  /** Dibuja todas las hojas fuera de la pantalla y las cambia de golpe. */
  const pintar = useCallback(
    async (bytes: Uint8Array, nuevas: PaginasDeSecciones | null) => {
      const caja = scroller.current;
      const destino = hojas.current;
      if (!caja || !destino) return;
      const ancho = caja.clientWidth - MARGEN * 2;
      if (ancho < 80) {
        // Oculta (pestaña «Documento» en pantalla angosta): se dibuja al mostrarse.
        pendienteDeVer.current = true;
        return;
      }
      const turno = ++pintura.current;
      setPintando(true);
      let documento: Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
      try {
        const pdfjs = await cargarPdfJs();
        // pdf.js se queda con el búfer que recibe: se le da una copia y se conserva el original
        // para volver a dibujar al cambiar de ancho.
        documento = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      } catch (e) {
        if (turno === pintura.current) setPintando(false);
        throw e;
      }
      try {
        const escalaPantalla = Math.min(window.devicePixelRatio || 1, 2);
        const nuevasHojas: HTMLElement[] = [];
        for (let n = 1; n <= documento.numPages; n += 1) {
          if (turno !== pintura.current) return;
          const pagina = await documento.getPage(n);
          const base = pagina.getViewport({ scale: 1 });
          const escala = ancho / base.width;
          const vista = pagina.getViewport({ scale: escala * escalaPantalla });
          const lienzo = document.createElement("canvas");
          lienzo.width = Math.floor(vista.width);
          lienzo.height = Math.floor(vista.height);
          lienzo.style.width = `${Math.floor(base.width * escala)}px`;
          lienzo.style.height = `${Math.floor(base.height * escala)}px`;
          const contexto = lienzo.getContext("2d");
          if (!contexto) continue;
          await pagina.render({ canvasContext: contexto, viewport: vista }).promise;
          pagina.cleanup();
          const hoja = document.createElement("div");
          hoja.className = styles.vistaHoja ?? "";
          hoja.dataset["pagina"] = String(n);
          hoja.setAttribute("role", "img");
          hoja.setAttribute("aria-label", `Página ${n} de ${documento.numPages}`);
          hoja.appendChild(lienzo);
          nuevasHojas.push(hoja);
        }
        if (turno !== pintura.current) return;

        const arriba = caja.scrollTop;
        destino.replaceChildren(...nuevasHojas);
        caja.scrollTop = arriba;
        anchoPintado.current = ancho;
        pendienteDeVer.current = false;
        setPaginas(documento.numPages);

        if (nuevas) {
          const antes = secciones.current;
          secciones.current = nuevas;
          const actual = seccionRef.current;
          // Primera vez, o la sección en la que se escribe cambió de hoja: se vuelve a llevar ahí.
          if (actual && (!Object.keys(antes).length || seMovioSeccion(antes, nuevas, actual))) {
            irAPagina(paginaDeSeccion(nuevas, actual, documento.numPages), "auto");
          }
        }
      } finally {
        if (turno === pintura.current) setPintando(false);
        void documento.destroy();
      }
    },
    [irAPagina],
  );

  // ─── Peticiones ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cotizacionId || !token) return;
    const p = crearProgramador<GuardarCotizacion, { bytes: Uint8Array; secciones: string | null }>({
      pedir: (b, signal) => vistaPreviaEnVivo(token, cotizacionId, b, signal),
      alResultado: (r) => {
        setError(null);
        ultimoPdf.current = r.bytes;
        setUrlAbrir((previa) => {
          if (previa) URL.revokeObjectURL(previa);
          return URL.createObjectURL(new Blob([r.bytes.slice()], { type: "application/pdf" }));
        });
        void pintar(r.bytes, leerSecciones(r.secciones)).catch((e) =>
          setError(e instanceof Error ? `No se pudo dibujar el PDF: ${e.message}` : "No se pudo dibujar el PDF"),
        );
      },
      alError: (e) => setError(e instanceof Error ? e.message : "No se pudo armar la vista previa"),
      alCambiarEstado: setActualizando,
    });
    programador.current = p;
    return () => {
      p.cancelar();
      programador.current = null;
    };
  }, [cotizacionId, token, pintar]);

  // Cada cambio del borrador → una vista previa 600 ms después de la última tecla.
  const clave = JSON.stringify(borrador);
  const huboPrimera = useRef(false);
  useEffect(() => {
    const p = programador.current;
    if (!p || !visible) return;
    if (!huboPrimera.current) {
      huboPrimera.current = true;
      p.ahora(borradorRef.current);
    } else {
      p.programar(borradorRef.current);
    }
  }, [clave, visible, cotizacionId, token]);

  // Algo cambió del lado del servidor (planos, paquete, envío): ya.
  useEffect(() => {
    if (recarga > 0 && visible) programador.current?.ahora(borradorRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarga]);

  // ─── Seguir al cursor ───────────────────────────────────────────────────
  useEffect(() => {
    if (!seccion || !paginas) return;
    irAPagina(paginaDeSeccion(secciones.current, seccion, paginas));
  }, [seccion, paginas, irAPagina]);

  // Cambio de ancho (o se mostró la pestaña): se vuelve a dibujar con lo último que llegó.
  useEffect(() => {
    const caja = scroller.current;
    if (!caja || typeof ResizeObserver === "undefined") return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const obs = new ResizeObserver(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const ancho = caja.clientWidth - MARGEN * 2;
        const bytes = ultimoPdf.current;
        if (!bytes || ancho < 80) return;
        if (pendienteDeVer.current || Math.abs(ancho - anchoPintado.current) > 24) void pintar(bytes, null);
      }, 180);
    });
    obs.observe(caja);
    return () => {
      if (t) clearTimeout(t);
      obs.disconnect();
    };
  }, [pintar]);

  useEffect(
    () => () => {
      setUrlAbrir((previa) => {
        if (previa) URL.revokeObjectURL(previa);
        return null;
      });
    },
    [],
  );

  const estado = !cotizacionId ? null : error ? "error" : actualizando || pintando ? "actualizando" : paginas ? "listo" : "cargando";

  return (
    <aside className={styles.vista} aria-label="Vista previa del PDF">
      <div className={styles.vistaCabeza}>
        <div className={styles.vistaTitulo}>
          <strong>Vista previa</strong>
          {estado === "actualizando" || estado === "cargando" ? (
            <span className={`${styles.vistaEstado} ${styles.vistaEstadoVivo}`} role="status" aria-live="polite">
              Actualizando…
            </span>
          ) : estado === "listo" ? (
            <span className={styles.vistaEstado} role="status" aria-live="polite">
              {paginas} {paginas === 1 ? "página" : "páginas"} · al día
            </span>
          ) : null}
        </div>
        <span className={styles.hojaAcciones}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => programador.current?.ahora(borradorRef.current)}
            disabled={!cotizacionId || !token}
            title="Volver a armar el PDF ahora"
          >
            Actualizar
          </button>
          {urlAbrir ? (
            <a className={styles.ghostBtn} href={urlAbrir} target="_blank" rel="noreferrer" title="Abrir en otra pestaña">
              Abrir
            </a>
          ) : null}
        </span>
      </div>
      {error && paginas ? (
        <div className={styles.vistaAviso} role="alert">
          <span>{error}</span>
          <button type="button" className={styles.linkBtn} onClick={() => programador.current?.ahora(borradorRef.current)}>
            Reintentar
          </button>
        </div>
      ) : null}
      <div className={styles.vistaMarco} data-testid="vista-previa-pdf" data-estado={estado ?? "sin-cotizacion"}>
        <div ref={scroller} className={styles.vistaScroll}>
          <div ref={hojas} className={styles.vistaHojas} />
        </div>
        {!cotizacionId ? (
          <div className={styles.vistaCapa}>
            <p>
              La vista previa aparece en cuanto el borrador se guarda: escribe para quién es la cotización.
            </p>
          </div>
        ) : error && !paginas ? (
          <div className={styles.vistaCapa} role="alert">
            <p>{error}</p>
            <button type="button" className={styles.secondaryBtn} onClick={() => programador.current?.ahora(borradorRef.current)}>
              Reintentar
            </button>
          </div>
        ) : !paginas ? (
          <div className={styles.vistaCapa}>
            <p>Armando el PDF…</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
