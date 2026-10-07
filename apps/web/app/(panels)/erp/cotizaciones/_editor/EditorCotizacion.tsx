"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ButtonLink,
  StatusBadge,
  Stepper,
  Tabs,
  focusField,
  type RecordStep,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { triggerFileDownload } from "@/lib/file-download";
import { formatApiError } from "@/lib/erp-api";
import {
  SEGMENTO_LABEL,
  actualizarCotizacion,
  aplicarPaquete,
  crearCotizacion,
  enviarCotizacion,
  formatoFecha,
  guardarComoPlantilla,
  obtenerPlantillaGuardada,
  formatoMoneda,
  listarPaquetes,
  listarPlantillas,
  obtenerCotizacion,
  urlPdfCotizacion,
  urlPdfCotizacionInterno,
  versionesDeCotizacion,
  type CotizacionDetalle,
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
  esCorreo,
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

/**
 * Pasos de la cotización con lo que de verdad pasó: cuándo se emitió, cuándo salió al cliente y en
 * qué terminó. Lo que no ha pasado queda pendiente, sin fecha inventada.
 */
function pasosDe(detalle: CotizacionDetalle, version: string): RecordStep[] {
  const { estado, sentAt } = detalle;
  const enBorrador = estado === "BORRADOR";
  const aprobo = [...detalle.participantes].reverse().find((p) => p.rol === "APROBO");
  const final: RecordStep =
    estado === "APROBADA"
      ? { id: "final", label: "Aprobada", hint: aprobo ? formatoFecha(aprobo.at) : undefined, state: "done" }
      : estado === "RECHAZADA"
        ? { id: "final", label: "Rechazada", hint: detalle.rejectedByName ? `Por ${detalle.rejectedByName}` : undefined, state: "current" }
        : estado === "VENCIDA"
          ? { id: "final", label: "Vencida", hint: detalle.validUntil ? formatoFecha(detalle.validUntil) : undefined, state: "current" }
          : {
              id: "final",
              label: "Aprobada",
              hint: detalle.validUntil ? `Vigente al ${formatoFecha(detalle.validUntil)}` : "La firma el cliente",
              state: "pending",
            };
  return [
    {
      id: "borrador",
      label: "Borrador",
      hint: enBorrador && sentAt ? `Versión ${version}` : formatoFecha(detalle.issueDate),
      state: enBorrador ? "current" : "done",
    },
    {
      id: "enviada",
      label: "Enviada",
      hint: sentAt ? (enBorrador ? `Última: ${formatoFecha(sentAt)}` : formatoFecha(sentAt)) : "Sin enviar",
      state: estado === "ENVIADA" ? "current" : sentAt && !enBorrador ? "done" : "pending",
    },
    final,
  ];
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
  const veCostos = hasPermission(user, PERMISSIONS.COTIZACIONES_ACCESS);
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
        if (creada.salesClientId) {
          setDoc((d) => (d.salesClientId ? d : { ...d, salesClientId: creada.salesClientId ?? null }));
        }
        // Sin recargar: el documento sigue en pantalla con lo que se esté escribiendo.
        window.history.replaceState(null, "", `/erp/cotizaciones/${creada.id}`);
      } else {
        const actualizada = await actualizarCotizacion(token, idRef.current, cambios);
        if (actualizada.salesClientId) {
          setDoc((d) => (d.salesClientId ? d : { ...d, salesClientId: actualizada.salesClientId ?? null }));
        }
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
      setError(formatApiError(e, "No se pudo retomar la cotización"));
    } finally {
      setDesbloqueando(false);
    }
  }

  async function descargarPdf(interno = false) {
    if (!id || !(await asegurarGuardado())) return;
    const folio = detalle?.folio ?? `cotizacion-${id}`;
    await triggerFileDownload(
      interno ? urlPdfCotizacionInterno(id) : urlPdfCotizacion(id),
      interno ? `${folio}-interno.pdf` : `${folio}.pdf`,
      {
        authToken: token ?? undefined,
        mimeType: "application/pdf",
      },
    );
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
      setError(formatApiError(e, "No se pudo agregar el paquete"));
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
        setError(formatApiError(e, "No se pudo abrir la plantilla"));
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
      setError(formatApiError(e, "No se pudo guardar la plantilla"));
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
  const totales = useMemo(
    () => totalesDePartidas(doc.partidas, doc.marginPercent, doc.conIva !== false),
    [doc.partidas, doc.marginPercent, doc.conIva],
  );
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

  /**
   * Un solo primario: la siguiente acción lógica. Borrador o enviada → enviarla; aprobada → su PDF;
   * rechazada o vencida → retomarla como borrador (el botón vive en su aviso).
   */
  const siguiente: "enviar" | "pdf" | "retomar" = aprobada
    ? "pdf"
    : bloqueada && detalle && detalle.estado !== "ENVIADA"
      ? "retomar"
      : "enviar";
  const pasos = detalle ? pasosDe(detalle, version) : [];
  const partidasConNombre = doc.partidas.filter((p) => p.name.trim()).length;
  const pendientes =
    detalle?.estado === "BORRADOR"
      ? [
          { id: "cliente", label: "Cliente", hecho: Boolean(doc.clientName.trim()), ir: () => focusField("cot-cliente") },
          { id: "partida", label: "Una partida", hecho: completas.cotizacion, ir: () => irASeccion("cotizacion") },
          { id: "correo", label: "Correo del cliente", hecho: esCorreo(doc.clientEmail), ir: () => focusField("cot-correo") },
        ]
      : [];

  return (
    <div className={styles.editor} ref={editorRef}>
      <header className={styles.barra}>
        <div className={styles.barraIzq}>
          <ButtonLink
            href="/erp/cotizaciones"
            icon
            className={styles.volver}
            aria-label="Volver a cotizaciones"
            title="Cotizaciones"
          >
            <ArrowBackRoundedIcon aria-hidden="true" />
          </ButtonLink>
          <div className={styles.barraFolio}>
            <div className={styles.barraFolioLinea}>
              <span className={styles.folioTexto} title={detalle?.folio}>
                {detalle?.folio ?? "Nueva cotización"}
              </span>
              {detalle ? <StatusBadge status={detalle.estado} label={detalle.estadoEtiqueta} size="sm" /> : null}
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
            <Button size="sm" variant="ghost" onClick={() => void auto.guardarAhora()}>
              Reintentar
            </Button>
          ) : null}
          {veCostos ? (
            <Button
              variant="ghost"
              className={styles.barraBoton}
              iconStart={<PictureAsPdfOutlinedIcon />}
              onClick={() => void descargarPdf(true)}
              disabled={!id}
              title="PDF interno: costo, markup sobre el costo y precio. No se envía al cliente."
            >
              PDF interno
            </Button>
          ) : null}
          <Button
            variant={siguiente === "pdf" ? "primary" : "secondary"}
            className={styles.barraBoton}
            iconStart={<PictureAsPdfOutlinedIcon />}
            onClick={() => void descargarPdf(false)}
            disabled={!id}
            title="PDF para el cliente: precios ya con margen, sin costo"
          >
            PDF final
          </Button>
          {siguiente !== "pdf" ? (
            <Button
              variant={siguiente === "enviar" ? "primary" : "secondary"}
              className={styles.barraBoton}
              iconStart={<SendOutlinedIcon />}
              onClick={() => void abrirEnvio()}
              disabled={!id || aprobada || (bloqueada && detalle?.estado !== "ENVIADA")}
            >
              Enviar por correo
            </Button>
          ) : null}
        </div>
      </header>

      {detalle ? (
        <section className={styles.ficha} aria-label="Resumen de la cotización">
          <div className={styles.fichaTop}>
            <span className={styles.fichaIco} aria-hidden="true">
              <RequestQuoteOutlinedIcon />
            </span>
            <div className={styles.fichaTexto}>
              <h1 className={styles.fichaTitulo}>{doc.projectName.trim() || "Sin título de proyecto"}</h1>
              <div className={styles.fichaDatos}>
                <span className={styles.fichaDato}>
                  <ApartmentOutlinedIcon aria-hidden="true" />
                  {doc.clientName.trim() || "Sin cliente"}
                </span>
                {detalle.elaboro?.nombre ? (
                  <span className={styles.fichaDato}>
                    <Avatar name={detalle.elaboro.nombre} size={22} />
                    {detalle.elaboro.nombre}
                    <span className={styles.fichaTenue}>· elaboró</span>
                  </span>
                ) : null}
                {doc.validUntil ? (
                  <span className={styles.fichaDato}>
                    <EventOutlinedIcon aria-hidden="true" />
                    Vigencia {formatoFecha(doc.validUntil)}
                  </span>
                ) : null}
                <Badge tone="outline" size="sm">
                  {SEGMENTO_LABEL[doc.segmento]}
                </Badge>
                <Badge tone="outline" size="sm">
                  Versión {version}
                </Badge>
              </div>
              {pendientes.length ? (
                <div className={styles.fichaPendientes} aria-label="Para enviarla">
                  <span className={styles.fichaPendientesTitulo}>Para enviarla</span>
                  {pendientes.map((p) =>
                    p.hecho ? (
                      <span key={p.id} className={styles.pendienteHecho}>
                        <CheckRoundedIcon aria-hidden="true" />
                        {p.label}
                      </span>
                    ) : (
                      <Button key={p.id} size="sm" variant="tonal" className={styles.pendienteFalta} onClick={p.ir}>
                        Falta: {p.label.toLowerCase()}
                      </Button>
                    ),
                  )}
                </div>
              ) : null}
            </div>
            <div className={styles.fichaTotal}>
              <span className={styles.fichaTotalEtiqueta}>Total</span>
              <strong className={styles.fichaTotalCifra}>{formatoMoneda(totales.total, doc.moneda)}</strong>
              <span className={styles.fichaTotalPie}>
                {partidasConNombre === 1 ? "1 partida" : `${partidasConNombre} partidas`} ·{" "}
                {totales.conIva ? `IVA ${formatoMoneda(totales.iva, doc.moneda)}` : "sin IVA"}
              </span>
            </div>
          </div>
          <Stepper steps={pasos} ariaLabel="Avance de la cotización" />
        </section>
      ) : null}

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

      <div className={styles.pestanas}>
        <Tabs
          ariaLabel="Ver"
          items={[
            { id: "documento", label: "Documento" },
            { id: "vista", label: "Vista previa (PDF)" },
          ]}
          value={pestana}
          onChange={setPestana}
        />
      </div>

      {aprobada || (bloqueada && detalle) || detalle?.rejectedReason || error ? (
        <div className={styles.avisos}>
          {aprobada ? (
            <Alert tone="success">
              Aprobada: es el compromiso firmado con el cliente y ya no se edita. Puedes descargar el PDF cuando quieras.
            </Alert>
          ) : bloqueada && detalle ? (
            <Alert
              tone="info"
              action={
                <Button
                  size="sm"
                  variant={siguiente === "retomar" ? "primary" : "tonal"}
                  loading={desbloqueando}
                  onClick={() => void desbloquear()}
                >
                  {desbloqueando
                    ? "Un momento…"
                    : detalle.estado === "ENVIADA"
                      ? `Crear revisión R${(detalle.revision || 1) + 1}`
                      : "Retomar como borrador"}
                </Button>
              }
            >
              {detalle.estado === "ENVIADA"
                ? `Ya salió al cliente${detalle.sentToEmail ? ` (${detalle.sentToEmail})` : ""} como ${detalle.folio}. Para cambiarla se crea una revisión: la versión enviada se guarda y, al reenviarla, sale como R${(detalle.revision || 1) + 1}.`
                : `Está ${detalle.estadoEtiqueta.toLowerCase()}. Puedes retomarla como borrador, ajustarla y volver a enviarla.`}
            </Alert>
          ) : null}

          {detalle?.rejectedReason ? (
            <Alert tone="warning">
              Rechazada{detalle.rejectedByName ? ` por ${detalle.rejectedByName}` : ""}: {detalle.rejectedReason}
            </Alert>
          ) : null}

          {error ? (
            <Alert tone="danger" role="alert" onDismiss={() => setError(null)} dismissLabel="Cerrar">
              {error}
            </Alert>
          ) : null}
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
            <Alert tone="info">
              Se guarda sola al escribir el cliente; ahí se emite el folio.
              {activityId ? ` Queda ligada a la actividad #${activityId}.` : ""}
            </Alert>
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
          <CheckCircleRoundedIcon className={styles.toastIcono} aria-hidden="true" />
          {aviso}
        </div>
      ) : null}
    </div>
  );
}
