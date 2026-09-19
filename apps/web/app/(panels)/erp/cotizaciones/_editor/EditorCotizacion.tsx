"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
import { useUser } from "@/components/UserContext";
import { triggerFileDownload } from "@/lib/file-download";
import {
  ESTADO_TONO,
  SEGMENTO_LABEL,
  actualizarCotizacion,
  aplicarPaquete,
  crearCotizacion,
  enviarCotizacion,
  guardarComoPlantilla,
  obtenerPlantillaGuardada,
  formatoMoneda,
  listarPaquetes,
  listarPlantillas,
  obtenerCotizacion,
  urlPdfCotizacion,
  versionesDeCotizacion,
  type CotizacionDetalle,
  type EstadoCotizacion,
  type GuardarCotizacion,
  type PaqueteCotizacion,
  type PlantillasSegmento,
  type VersionCotizacion,
} from "@/lib/cotizaciones-api";
import {
  bloquesDesdeApi,
  documentoDesdeDetalle,
  documentoDesdePlantilla,
  documentoVacio,
  faltaParaEnviar,
  faltaParaGuardar,
  partidasDesdeApi,
  payloadDeDocumento,
  seccionesCompletas,
  totalesDePartidas,
  type DocumentoCotizacion,
} from "@/lib/cotizacion-documento";
import { folioAlEnviar } from "@/lib/cotizacion-folio";
import { esSeccionPropuesta, type SeccionPropuesta } from "@/lib/vista-previa-vivo";
import { conCondicionesSugeridas, type SeccionesOpcionales } from "@/lib/cotizacion-personalizacion";
import PanelPersonalizar from "./PanelPersonalizar";
import ElegirPlantilla from "./ElegirPlantilla";
import { useAutoguardado, type EstadoGuardado } from "./useAutoguardado";
import SeccionPortada from "./SeccionPortada";
import SeccionObjetivo from "./SeccionObjetivo";
import SeccionAlcance from "./SeccionAlcance";
import SeccionPlanos from "./SeccionPlanos";
import SeccionCotizacion from "./SeccionCotizacion";
import VistaPrevia from "./VistaPrevia";
import DialogoEnvio from "./DialogoEnvio";
import Seguimiento from "./Seguimiento";
import styles from "./editor.module.css";

const TONO: Record<string, string> = {
  info: styles.tonoInfo ?? "",
  ok: styles.tonoOk ?? "",
  alerta: styles.tonoAlerta ?? "",
  neutral: "",
};

function claseEstado(estado: EstadoCotizacion) {
  return `${styles.badge} ${TONO[ESTADO_TONO[estado]] ?? ""}`;
}

function textoGuardado(estado: EstadoGuardado, guardadoEn: Date | null, pausa: string | null, error: string | null) {
  if (estado === "guardando") return "Guardando…";
  if (estado === "error") return `No se guardó${error ? `: ${error}` : ""}`;
  if (estado === "pendiente") return pausa ?? "Cambios sin guardar…";
  if (estado === "guardado" && guardadoEn) {
    const hora = guardadoEn.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    return `Guardado · ${hora}`;
  }
  return pausa ?? "Todo guardado";
}

const SECCIONES = [
  { id: "portada", numero: "", titulo: "Portada" },
  { id: "personalizar", numero: "", titulo: "Personalizar" },
  { id: "objetivo", numero: "01", titulo: "Objetivo" },
  { id: "alcance", numero: "02", titulo: "Alcance" },
  { id: "planos", numero: "03", titulo: "Planos" },
  { id: "cotizacion", numero: "04", titulo: "Cotización" },
] as const;

/**
 * Alto de la barra fija del panel que tapa la parte de arriba (0 si no hay): el primer ancestro
 * `sticky`/`fixed` del elemento que está en la orilla superior, sobre la columna del editor.
 */
function altoCabeceraFija(editor: HTMLElement): number {
  if (typeof document.elementFromPoint !== "function") return 0;
  const caja = editor.getBoundingClientRect();
  let el = document.elementFromPoint(Math.max(1, caja.left + Math.min(40, caja.width / 2)), 1) as HTMLElement | null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (editor.contains(el)) return 0;
    const posicion = getComputedStyle(el).position;
    if (posicion === "sticky" || posicion === "fixed") {
      const r = el.getBoundingClientRect();
      return r.top <= 1 && r.bottom < window.innerHeight / 3 ? Math.round(r.bottom) : 0;
    }
    el = el.parentElement;
  }
  return 0;
}

function useEsAncho() {
  const [ancho, setAncho] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(min-width: 1280px)");
    const actualizar = () => setAncho(mq.matches);
    actualizar();
    mq.addEventListener?.("change", actualizar);
    return () => mq.removeEventListener?.("change", actualizar);
  }, []);
  return ancho;
}

/**
 * Editor de cotizaciones de Core: la propuesta técnica tal como la recibe el cliente (portada, 01
 * Objetivo, 02 Alcance, 03 Planos, 04 Cotización), editable en su lugar, con autoguardado y el PDF
 * real al lado.
 *
 * Una cotización nueva no existe en la API hasta que tiene cliente: en ese momento se crea (el
 * servidor emite el folio con la nomenclatura de quien cotiza) y la URL pasa a la de la cotización
 * sin recargar la página.
 */
export default function EditorCotizacion({
  inicial,
  activityId,
  plantillaId,
}: {
  inicial: CotizacionDetalle | null;
  activityId?: number | null;
  /** «Nueva desde plantilla» (`/erp/cotizaciones/nueva?plantilla=`). */
  plantillaId?: number | null;
}) {
  const { token, user } = useUser();
  const [arranque] = useState(() => {
    const doc = inicial ? documentoDesdeDetalle(inicial) : documentoVacio();
    return { doc, base: inicial ? payloadDeDocumento(doc) : null };
  });
  const [doc, setDoc] = useState<DocumentoCotizacion>(arranque.doc);
  const [detalle, setDetalle] = useState<CotizacionDetalle | null>(inicial);
  const [id, setId] = useState<number | null>(inicial?.id ?? null);
  const idRef = useRef<number | null>(inicial?.id ?? null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const [versiones, setVersiones] = useState<VersionCotizacion[]>([]);
  const [plantillas, setPlantillas] = useState<PlantillasSegmento[]>([]);
  const [paquetes, setPaquetes] = useState<PaqueteCotizacion[]>([]);
  /** Sube cuando cambió algo del lado del servidor que el borrador no trae (planos, paquete, envío). */
  const [recargaVista, setRecargaVista] = useState(0);
  /** Sección donde está el cursor: la vista previa va a su hoja. */
  const [seccionCursor, setSeccionCursor] = useState<SeccionPropuesta | null>(null);
  /** Sección que se está leyendo (se marca en la navegación). */
  const [seccionVista, setSeccionVista] = useState<string>("portada");
  const [pestana, setPestana] = useState<"documento" | "vista">("documento");
  const [desbloqueando, setDesbloqueando] = useState(false);
  const [envio, setEnvio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [plantillaElegida, setPlantillaElegida] = useState<number | null>(null);
  const ancho = useEsAncho();

  const aprobada = detalle?.estado === "APROBADA";
  const bloqueada = Boolean(detalle?.bloqueada);
  const editable = !aprobada && !bloqueada;
  const falta = id ? null : faltaParaGuardar(doc);

  const cambiar = useCallback((cambio: (d: DocumentoCotizacion) => DocumentoCotizacion) => setDoc(cambio), []);

  // ─── Datos del servidor que no son el documento ───────────────────────
  const recargar = useCallback(async () => {
    if (!token || !idRef.current) return;
    try {
      const d = await obtenerCotizacion(token, idRef.current);
      setDetalle(d);
      if (d.sentAt || d.revision > 1) {
        setVersiones(await versionesDeCotizacion(token, idRef.current).catch(() => []));
      }
    } catch {
      // El guardado ya pasó; si la recarga falla, la siguiente lo intenta otra vez.
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    listarPlantillas(token)
      .then((p) => vivo && setPlantillas(p))
      .catch(() => undefined);
    listarPaquetes(token)
      .then((p) => vivo && setPaquetes(p))
      .catch(() => undefined);
    if (idRef.current) {
      versionesDeCotizacion(token, idRef.current)
        .then((v) => vivo && setVersiones(v))
        .catch(() => undefined);
    }
    return () => {
      vivo = false;
    };
  }, [token]);

  // ─── Autoguardado ──────────────────────────────────────────────────────
  const payload = useMemo(() => payloadDeDocumento(doc), [doc]);

  const guardar = useCallback(
    async (cambios: Partial<GuardarCotizacion>, completo: GuardarCotizacion) => {
      if (!token) throw new Error("Tu sesión expiró: vuelve a entrar.");
      if (!idRef.current) {
        const creada = await crearCotizacion(token, { ...completo, activityId: activityId ?? undefined });
        idRef.current = creada.id;
        setId(creada.id);
        // Sin recargar: el documento sigue en pantalla con lo que se esté escribiendo.
        window.history.replaceState(null, "", `/erp/cotizaciones/${creada.id}`);
      } else {
        await actualizarCotizacion(token, idRef.current, cambios);
      }
      // La vista previa no espera al guardado: ya se arma con lo que está en pantalla.
      await recargar();
    },
    [token, activityId, recargar],
  );

  const auto = useAutoguardado<GuardarCotizacion>({
    payload,
    base: arranque.base,
    habilitado: editable && !falta && Boolean(token),
    guardar,
  });

  // Ctrl/Cmd+S guarda ya.
  const guardarAhora = auto.guardarAhora;
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void guardarAhora().then((ok) => ok && setAviso("Guardado."));
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [guardarAhora]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  // ─── Acciones ──────────────────────────────────────────────────────────
  async function asegurarGuardado(): Promise<boolean> {
    if (falta) {
      setError(falta);
      return false;
    }
    const ok = await auto.guardarAhora();
    if (!ok) setError("Hay cambios que no se pudieron guardar: revisa el aviso de arriba y reintenta.");
    return ok;
  }

  /**
   * Enviada, rechazada o vencida → borrador otra vez. La API guarda la versión que vio el cliente
   * antes de soltarla; al reenviarla sale como la siguiente revisión.
   */
  async function desbloquear() {
    if (!token || !idRef.current) return;
    setDesbloqueando(true);
    setError(null);
    try {
      await actualizarCotizacion(token, idRef.current, { status: "BORRADOR" });
      await recargar();
      setRecargaVista((v) => v + 1);
      setAviso("Listo: la versión enviada quedó guardada y ya puedes editar.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo retomar la cotización");
    } finally {
      setDesbloqueando(false);
    }
  }

  async function descargarPdf() {
    if (!id || !(await asegurarGuardado())) return;
    await triggerFileDownload(urlPdfCotizacion(id), `${detalle?.folio ?? `cotizacion-${id}`}.pdf`, {
      authToken: token ?? undefined,
      mimeType: "application/pdf",
    });
  }

  async function abrirEnvio() {
    setError(null);
    if (!id || !(await asegurarGuardado())) return;
    await recargar();
    setEnvio(true);
  }

  async function onAplicarPaquete(clave: string, cantidad: number) {
    if (!token || !idRef.current || !(await asegurarGuardado())) return;
    try {
      const d = await aplicarPaquete(token, idRef.current, { clave, cantidad });
      setDetalle(d);
      // El servidor rehízo partidas y alcance: se toman tal cual y ya están guardados.
      const nuevo = { ...docRef.current, partidas: partidasDesdeApi(d.items), bloques: bloquesDesdeApi(d.alcanceBloques) };
      setDoc(nuevo);
      auto.fijarBase(payloadDeDocumento(nuevo));
      setRecargaVista((v) => v + 1);
      setAviso("Paquete agregado: partidas y alcance actualizados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar el paquete");
    }
  }

  // ─── Personalizar y plantillas ─────────────────────────────────────────
  // Cotización nueva: las condiciones comerciales ya escritas con las del segmento.
  const condicionesPuestas = useRef(Boolean(inicial));
  useEffect(() => {
    if (condicionesPuestas.current || !plantillas.length) return;
    const sugeridas = plantillas.find((p) => p.segmento === docRef.current.segmento)?.condiciones;
    if (!sugeridas) return;
    condicionesPuestas.current = true;
    setDoc((d) => ({ ...d, opciones: conCondicionesSugeridas(d.opciones, sugeridas) }));
  }, [plantillas]);

  const usarPlantilla = useCallback(
    async (plantilla: number) => {
      if (!token) return;
      try {
        const { contenido, nombre } = await obtenerPlantillaGuardada(token, plantilla);
        const sugeridas = plantillas.find((p) => p.segmento === contenido.segmento)?.condiciones ?? null;
        condicionesPuestas.current = true;
        setDoc((d) => documentoDesdePlantilla(contenido, d, sugeridas));
        setPlantillaElegida(plantilla);
        setAviso(`Plantilla «${nombre}» aplicada: escribe el cliente y se guarda sola.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo abrir la plantilla");
      }
    },
    [token, plantillas],
  );

  // `/erp/cotizaciones/nueva?plantilla=ID`: se aplica en cuanto hay sesión.
  const plantillaAplicada = useRef(false);
  useEffect(() => {
    if (plantillaAplicada.current || !plantillaId || inicial || !token) return;
    plantillaAplicada.current = true;
    void usarPlantilla(plantillaId);
  }, [plantillaId, inicial, token, usarPlantilla]);

  async function guardarPlantilla(nombre: string, conPartidas: boolean) {
    if (!token || !idRef.current || !(await asegurarGuardado())) return;
    try {
      const hecha = await guardarComoPlantilla(token, { nombre, cotizacionId: idRef.current, conPartidas });
      setAviso(
        `Plantilla «${hecha.nombre}» guardada${hecha.conPartidas ? ` con ${hecha.partidas} partidas` : ""}. Aparece en «Nueva cotización».`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la plantilla");
    }
  }

  const incluirSeccion = (clave: keyof SeccionesOpcionales) =>
    cambiar((d) => ({ ...d, opciones: { ...d.opciones, secciones: { ...d.opciones.secciones, [clave]: true } } }));

  const onDetalle = useCallback(
    (d: CotizacionDetalle | null) => {
      if (d) setDetalle(d);
      else void recargar();
      setRecargaVista((v) => v + 1);
    },
    [recargar],
  );

  // ─── Lo que se ve ──────────────────────────────────────────────────────
  const totales = useMemo(() => totalesDePartidas(doc.partidas), [doc.partidas]);
  const completas = seccionesCompletas(doc, detalle?.planos?.length ?? 0);
  const plantillaSegmento = plantillas.find((p) => p.segmento === doc.segmento) ?? null;
  const version = `${Math.max(1, (detalle?.revision ?? 1) + (detalle?.sentAt && detalle.estado === "BORRADOR" ? 1 : 0))}.0`;
  const faltasEnvio = faltaParaEnviar(doc);

  const siglasUsuario = useMemo(() => {
    if (!detalle || !user) return undefined;
    if (detalle.elaboro?.id === user.id) return detalle.elaboro?.siglas ?? null;
    return detalle.participantes.find((p) => p.userId === user.id)?.siglas;
  }, [detalle, user]);

  const pendientesAlEnviar =
    detalle && detalle.estado === "BORRADOR" && detalle.conNomenclatura
      ? `Al enviarla saldrá como ${folioAlEnviar({
          folio: detalle.folio,
          siglasAutor: detalle.elaboro?.siglas,
          participantes: [...detalle.participantes.map((p) => p.siglas), siglasUsuario ?? null],
          yaEnviada: Boolean(detalle.sentAt),
          revision: detalle.revision,
        })}${siglasUsuario === undefined ? " (más tus siglas)" : ""}.`
      : null;

  // ─── Debajo de la barra fija del panel ─────────────────────────────────
  // La barra y la navegación del editor se quedan fijas justo debajo de la barra del panel, mida
  // lo que mida (cambia con el tamaño de pantalla y con el estilo del panel).
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || typeof window === "undefined") return;
    const medir = () => {
      const alto = altoCabeceraFija(editor);
      editor.style.setProperty("--shell-alto", `${alto}px`);
    };
    medir();
    window.addEventListener("resize", medir);
    const t = setTimeout(medir, 400);
    return () => {
      window.removeEventListener("resize", medir);
      clearTimeout(t);
    };
  }, []);

  // ─── Dónde está quien edita ────────────────────────────────────────────
  // El cursor manda la vista previa a su hoja; lo que se está leyendo se marca en la navegación.
  const documentoRef = useRef<HTMLDivElement>(null);
  const alEnfocar = useCallback((e: FocusEvent<HTMLDivElement>) => {
    const seccion = (e.target as HTMLElement).closest?.("[data-seccion]")?.getAttribute("data-seccion");
    if (esSeccionPropuesta(seccion)) setSeccionCursor(seccion);
  }, []);

  useEffect(() => {
    const raiz = documentoRef.current;
    if (!raiz || typeof IntersectionObserver === "undefined") return;
    const visibles = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          const idSeccion = (e.target as HTMLElement).id;
          if (e.isIntersecting) visibles.set(idSeccion, e.boundingClientRect.top);
          else visibles.delete(idSeccion);
        }
        // La de más arriba que cruza la franja de lectura.
        const primera = [...visibles.entries()].sort((a, b) => a[1] - b[1])[0];
        if (primera) setSeccionVista(primera[0]);
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    raiz.querySelectorAll("section[id]").forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [Boolean(detalle)]); // eslint-disable-line react-hooks/exhaustive-deps

  const irASeccion = (idSeccion: string) => {
    const destino = document.getElementById(idSeccion);
    if (!destino) return;
    destino.scrollIntoView({ behavior: "smooth", block: "start" });
    setSeccionVista(idSeccion);
    if (esSeccionPropuesta(idSeccion)) setSeccionCursor(idSeccion);
  };

  // Firmas: «Elaboró» es el autor (con su puesto); «Autorizó» se elige de quienes intervinieron.
  const elaboroParticipante = detalle?.participantes.find((p) => p.rol === "ELABORO");
  const autorFirma = detalle?.elaboro?.nombre
    ? { nombre: detalle.elaboro.nombre, cargo: elaboroParticipante?.puesto ?? null }
    : user?.nombre
      ? { nombre: user.nombre, cargo: null }
      : null;
  const personasFirma = useMemo(() => {
    const vistas = new Map<string, { nombre: string; cargo?: string | null; userId?: number | null }>();
    for (const p of detalle?.participantes ?? []) vistas.set(p.nombre, { nombre: p.nombre, cargo: p.puesto ?? null, userId: p.userId });
    if (user?.nombre && !vistas.has(user.nombre)) vistas.set(user.nombre, { nombre: user.nombre, userId: user.id });
    return [...vistas.values()].filter((p) => p.nombre);
  }, [detalle, user]);

  const claseGuardado = [
    styles.guardado,
    auto.estado === "guardado" ? styles.gGuardado : "",
    auto.estado === "guardando" ? styles.gGuardando : "",
    auto.estado === "pendiente" ? styles.gPendiente : "",
    auto.estado === "error" ? styles.gError : "",
  ].join(" ");

  const pausa = falta ?? (bloqueada && auto.hayPendientes() ? "En pausa: la cotización ya salió" : null);

  return (
    <div className={styles.editor} ref={editorRef}>
      <header className={styles.barra}>
        <div className={styles.barraIzq}>
          <Link href="/erp/cotizaciones" className={styles.volver} aria-label="Volver a cotizaciones" title="Cotizaciones">
            ←
          </Link>
          <div className={styles.barraFolio}>
            <div className={styles.barraFolioLinea}>
              <span className={styles.folioTexto} title={detalle?.folio}>
                {detalle?.folio ?? "Nueva cotización"}
              </span>
              {detalle ? <span className={claseEstado(detalle.estado)}>{detalle.estadoEtiqueta}</span> : null}
            </div>
            <span className={styles.barraSub}>
              {[SEGMENTO_LABEL[doc.segmento], doc.clientName.trim() || "sin cliente", formatoMoneda(totales.total)].join(" · ")}
            </span>
          </div>
        </div>
        <div className={styles.barraDer}>
          <span className={claseGuardado} role="status" aria-live="polite">
            {textoGuardado(auto.estado, auto.guardadoEn, pausa, auto.error)}
          </span>
          {auto.estado === "error" ? (
            <button type="button" className={styles.ghostBtn} onClick={() => void auto.guardarAhora()}>
              Reintentar
            </button>
          ) : null}
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => void descargarPdf()}
            disabled={!id}
            title="Descarga la versión guardada"
          >
            Descargar PDF
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void abrirEnvio()}
            disabled={!id || aprobada || (bloqueada && detalle?.estado !== "ENVIADA")}
            title={aprobada ? "Ya está aprobada" : undefined}
          >
            Enviar por correo
          </button>
        </div>
      </header>

      <nav className={styles.indice} aria-label="Secciones del documento">
        <ol className={styles.indiceLista}>
          {[...SECCIONES, ...(detalle ? [{ id: "seguimiento", numero: "", titulo: "Seguimiento" } as const] : [])].map((s) => {
            const hecho =
              s.id === "seguimiento"
                ? false
                : s.id === "portada"
                  ? Boolean(doc.projectName.trim() && doc.clientName.trim())
                  : completas[s.id as keyof typeof completas];
            const actual = seccionVista === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`${styles.indiceItem} ${actual ? styles.indiceActual : ""}`}
                  aria-current={actual ? "location" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    irASeccion(s.id);
                  }}
                >
                  {s.id === "seguimiento" ? null : (
                    <span className={`${styles.indiceMarca} ${hecho ? styles.indiceHecho : ""}`} aria-hidden>
                      {hecho ? "✓" : s.numero || "·"}
                    </span>
                  )}
                  <span>{s.titulo}</span>
                  {hecho ? <span className={styles.soloLector}> (completa)</span> : null}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className={styles.pestanas} role="tablist" aria-label="Ver">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === "documento"}
          className={`${styles.pestana} ${pestana === "documento" ? styles.pestanaActiva : ""}`}
          onClick={() => setPestana("documento")}
        >
          Documento
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === "vista"}
          className={`${styles.pestana} ${pestana === "vista" ? styles.pestanaActiva : ""}`}
          onClick={() => setPestana("vista")}
        >
          Vista previa (PDF)
        </button>
      </div>

      {aprobada ? (
        <div className={`${styles.aviso} ${styles.avisoOk}`}>
          <p>Aprobada: es el compromiso firmado con el cliente y ya no se edita. Puedes descargar el PDF cuando quieras.</p>
        </div>
      ) : bloqueada && detalle ? (
        <div className={`${styles.aviso} ${styles.avisoInfo}`}>
          <p>
            {detalle.estado === "ENVIADA"
              ? `Ya salió al cliente${detalle.sentToEmail ? ` (${detalle.sentToEmail})` : ""} como ${detalle.folio}. Para cambiarla se crea una revisión: la versión enviada se guarda y, al reenviarla, sale como R${(detalle.revision || 1) + 1}.`
              : `Está ${detalle.estadoEtiqueta.toLowerCase()}. Puedes retomarla como borrador, ajustarla y volver a enviarla.`}
          </p>
          <button type="button" className={styles.primaryBtn} onClick={() => void desbloquear()} disabled={desbloqueando}>
            {desbloqueando
              ? "Un momento…"
              : detalle.estado === "ENVIADA"
                ? `Crear revisión R${(detalle.revision || 1) + 1}`
                : "Retomar como borrador"}
          </button>
        </div>
      ) : null}

      {detalle?.rejectedReason ? (
        <div className={`${styles.aviso} ${styles.avisoAlerta}`}>
          <p>
            Rechazada{detalle.rejectedByName ? ` por ${detalle.rejectedByName}` : ""}: {detalle.rejectedReason}
          </p>
        </div>
      ) : null}

      {error ? (
        <div className={`${styles.aviso} ${styles.avisoError}`} role="alert">
          <p>{error}</p>
          <button type="button" className={styles.ghostBtn} onClick={() => setError(null)}>
            Cerrar
          </button>
        </div>
      ) : null}

      <div className={styles.cuerpo}>
        <div
          ref={documentoRef}
          className={`${styles.documento} ${pestana === "vista" ? styles.ocultoEnAngosto : ""}`}
          onFocusCapture={alEnfocar}
        >
          {!id && !inicial ? (
            <ElegirPlantilla token={token} elegida={plantillaElegida} onElegir={usarPlantilla} onError={setError} />
          ) : null}
          <SeccionPortada
            doc={doc}
            cambiar={cambiar}
            token={token}
            editable={editable}
            version={version}
            esNueva={!inicial}
          />
          {!id ? (
            <div className={`${styles.aviso} ${styles.avisoInfo}`}>
              <p>
                Se guarda solo en cuanto escribas el cliente. En ese momento se emite el folio con tu nomenclatura
                (NEX-tu clave-consecutivo) y aparece la vista previa del PDF.
                {activityId ? ` Queda ligada a la actividad #${activityId}: su evidencia entra como anexo.` : ""}
              </p>
            </div>
          ) : null}
          <PanelPersonalizar
            doc={doc}
            cambiar={cambiar}
            editable={editable}
            sugeridas={detalle?.condicionesSugeridas ?? plantillaSegmento?.condiciones ?? null}
            autor={autorFirma}
            personas={personasFirma}
            puedeGuardarPlantilla={Boolean(id) && !falta}
            onGuardarPlantilla={guardarPlantilla}
          />
          <SeccionObjetivo
            doc={doc}
            cambiar={cambiar}
            editable={editable}
            sugerido={detalle?.objetivoSugerido ?? null}
            plantilla={plantillaSegmento?.objetivo ?? null}
            excluida={!doc.opciones.secciones.objetivo}
            onIncluir={() => incluirSeccion("objetivo")}
          />
          <SeccionAlcance
            doc={doc}
            cambiar={cambiar}
            editable={editable}
            plantillas={plantillaSegmento?.bloques ?? []}
            excluida={!doc.opciones.secciones.alcance}
            onIncluir={() => incluirSeccion("alcance")}
          />
          <SeccionPlanos
            cotizacionId={id}
            token={token}
            planos={detalle?.planos ?? []}
            editable={editable}
            onDetalle={onDetalle}
            onError={setError}
            excluida={!doc.opciones.secciones.planos}
            onIncluir={() => incluirSeccion("planos")}
          />
          <SeccionCotizacion
            doc={doc}
            cambiar={cambiar}
            editable={editable}
            detalle={detalle}
            token={token}
            paquetes={paquetes}
            onAplicarPaquete={onAplicarPaquete}
            onIncluirTerminos={() => incluirSeccion("terminos")}
          />
          {detalle ? (
            <Seguimiento
              detalle={detalle}
              versiones={versiones}
              token={token}
              pendientesAlEnviar={pendientesAlEnviar}
              onDetalle={(d) => {
                onDetalle(d);
                if (d?.id) void versionesDeCotizacion(token!, d.id).then(setVersiones).catch(() => undefined);
              }}
              onError={setError}
              onAviso={setAviso}
            />
          ) : null}
        </div>
        <div className={`${styles.columnaVista} ${pestana === "documento" ? styles.ocultoEnAngosto : ""}`}>
          <VistaPrevia
            cotizacionId={id}
            token={token}
            borrador={payload}
            visible={ancho || pestana === "vista"}
            seccion={seccionCursor}
            recarga={recargaVista}
          />
        </div>
      </div>

      {envio && detalle ? (
        <DialogoEnvio
          detalle={detalle}
          cliente={doc.clientName}
          proyecto={doc.projectName}
          correoCliente={doc.clientEmail}
          siglasUsuario={siglasUsuario}
          faltas={faltasEnvio}
          onCerrar={() => setEnvio(false)}
          onEnviar={async (datos) => {
            if (!token || !idRef.current) return;
            const enviada = await enviarCotizacion(token, idRef.current, datos);
            setEnvio(false);
            await recargar();
            setRecargaVista((v) => v + 1);
            setAviso(`Enviada a ${datos.email} como ${enviada.quoteNumber}.`);
          }}
        />
      ) : null}

      {aviso ? (
        <div className={styles.toast} role="status">
          {aviso}
        </div>
      ) : null}
    </div>
  );
}
