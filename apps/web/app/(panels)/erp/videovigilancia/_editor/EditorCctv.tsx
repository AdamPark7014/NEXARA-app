"use client";

/**
 * Editor del Diseñador de videovigilancia: maqueta 3D, plano técnico y dibujo 2D con croquis
 * calibrado, muros, huecos, obstáculos, áreas y ambientación; cámaras del catálogo con su cobertura
 * DORI recortada por muros, humanoides y la vista desde cada cámara. Guarda solo, con control de
 * versión: si otro encargado guardó antes, avisa en lugar de pisarlo. Mockups aprobados por Adam
 * el 29-10-2026 y el 01-11-2026.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import RedoRoundedIcon from "@mui/icons-material/RedoRounded";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import { Alert, Badge, Button, Input, Segmented } from "@/components/base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { MODELOS_CAMARA, TIPOS_DE_RACK, etiquetaModelo, modeloPorId, type ModeloCamara, type ModeloEquipo, type TipoEquipo } from "@/lib/cctv/catalogo";
import {
  agregarEquipo,
  agregarEtiqueta,
  avisoDeEquipo,
  borrar,
  calibrarPlano,
  estadoInicial,
  nuevoId,
  reducirEditor,
  resumenDelPlano,
  siguienteNumeroEquipo,
  type ResumenDiseno,
  type Seleccion,
} from "@/lib/cctv/editor";
import { GRABACION_POR_OMISION, type Grabacion } from "@/lib/cctv/infraestructura";
import { hayWebGL } from "@/lib/cctv/medidas";
import { problemasDelPlano, tapasDelPlano, type MaterialPiso, type Plano, type Punto, type TipoMueble } from "@/lib/cctv/plano";
import {
  actualizarNivel,
  agregarNivel,
  copiarMurosDeAbajo,
  elevacionTexto,
  esPlantaBaja,
  listaNiveles,
  nivelBase,
  nivelDeAbajo,
  nivelDeCamara,
  quitarNivel,
  reemplazarNivel,
  siguienteNumeroGlobal,
  todasLasCamaras,
  transformarCroquis,
  type NivelConPlano,
} from "@/lib/cctv/niveles";
import { conexionesDelSistema } from "@/lib/cctv/sistema";
import { useCatalogo } from "@/lib/cctv/useCatalogo";
import { useUser } from "@/components/UserContext";
import { useExistencias } from "@/lib/cctv/useExistencias";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { gruposDeEquipos } from "@/lib/cctv/sistema";
import PasarACotizacion from "./PasarACotizacion";
import { camaraEnMetros, coberturaCamara, type PoligonoCobertura } from "@/lib/cctv/visibilidad";
import { ConflictoDeVersion, ETIQUETA_ESTADO_DISENO, guardarDiseno, subirCroquis, type Diseno, type EstadoDiseno } from "@/lib/cctv/api";
import { LEYENDA_NIVELES, COLOR_NIVEL } from "./colores";
import { TIPOS_CROQUIS, esOscuro, prepararCroquis } from "./croquis";
import DiagramaSistema from "./DiagramaSistema";
import type { DisenoGenerado } from "@/lib/cctv/generarSitio";
import DialogoEquipo from "./DialogoEquipo";
import MemoriaTecnica from "./MemoriaTecnica";
import Inspector, { type Pestana } from "./Inspector";
import Lienzo, { type Herramienta } from "./Lienzo";
import Lienzo3D from "./Lienzo3D";
import PanelEquipos from "./PanelEquipos";
import PlanoTecnico, { HojaAjustada, IMPRIMIR_HOJA } from "./PlanoTecnico";
import VistaCamara from "./VistaCamara";
import styles from "./editor.module.css";

/** three.js pesa: la maqueta se baja solo al abrirla. */
const AsistenteDiseno = dynamic(() => import("./AsistenteDiseno"), { ssr: false });
const Maqueta3D = dynamic(() => import("./Maqueta3D"), {
  ssr: false,
  loading: () => <p className={styles.maquetaCarga}>Armando la maqueta…</p>,
});

const HERRAMIENTAS: ReadonlyArray<{ id: Herramienta; etiqueta: string; tecla?: string; icono: string; grupo?: "camara" }> = [
  { id: "seleccionar", etiqueta: "Seleccionar", tecla: "V", icono: "M5 3l14 8-6 1.5L10 19z" },
  { id: "muro", etiqueta: "Muro", tecla: "M", icono: "M4 20L20 4" },
  { id: "puerta", etiqueta: "Puerta", tecla: "P", icono: "M3 20h18M6 20V6h8v14M14 6a8 8 0 016 8" },
  { id: "ventana", etiqueta: "Ventana", icono: "M4 5h16v14H4zM12 5v14M4 12h16" },
  { id: "acceso", etiqueta: "Acceso", icono: "M3 20h4M17 20h4M7 20V8M17 20V8" },
  { id: "obstaculo", etiqueta: "Obstáculo", icono: "M12 3l8 4.5v9L12 21l-8-4.5v-9z" },
  { id: "area", etiqueta: "Área", icono: "M4 6h16v12H4zM4 12h16M10 6v12" },
  { id: "cota", etiqueta: "Cota", icono: "M4 8v8M20 8v8M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3" },
  { id: "etiqueta", etiqueta: "Texto", icono: "M5 6h14M12 6v13" },
  { id: "camara", etiqueta: "+ Cámara", tecla: "C", icono: "M3 8.5L15.5 5l1.5 5.5L4.5 14zM17 8l4-1v5l-3.5.5M8 13.2V19H4", grupo: "camara" },
  { id: "persona", etiqueta: "Persona", tecla: "H", icono: "M12 3a2 2 0 110 4 2 2 0 010-4zM12 8v7M8 11h8M12 15l-3 6M12 15l3 6", grupo: "camara" },
];

const AYUDA_HERRAMIENTA: Record<Herramienta, string> = {
  seleccionar: "Clic para elegir y arrastrar para mover. Arrastra el fondo para mover la vista; la rueda acerca. Supr borra y Ctrl+Z deshace.",
  muro: "Clic para empezar y clic para terminar; sigue encadenando. Doble clic o Esc corta. Alt suelta el imán.",
  puerta: "Clic sobre un muro para poner una puerta de 0.9 m.",
  ventana: "Clic sobre un muro para poner una ventana de 1.2 m.",
  acceso: "Clic sobre un muro para un acceso o portón de 3 m.",
  obstaculo: "Arrastra para dibujar un anaquel, columna o rack.",
  cota: "Marca los dos extremos de una medida conocida para calibrar la escala.",
  area: "Arrastra un rectángulo: será un área con su piso. Su material se cambia en el panel.",
  mueble: "Clic en el sitio para poner la pieza elegida. Es ambientación: no tapa la vista.",
  etiqueta: "Clic donde va el nombre del área.",
  camara: "Clic para poner la cámara. Cerca de una esquina o un muro se pega sola y ve al cuarto; con Alt queda libre.",
  equipo: "Clic en el sitio para ponerlo. Los de muro se pegan al muro más cercano y los de rack entran al gabinete.",
  persona: "Clic para poner un humanoide; arrástralo para ver cómo lo capta cada cámara.",
};

type Meta = { nombre: string; estado: EstadoDiseno; grabacion: Grabacion };

/** Diseño recién guardado: la API manda el plano tal cual, con los croquis en ruta relativa. */
function planoDe(d: Diseno): Plano {
  return transformarCroquis(d.plano, (url) => resolveAssetUrl(url) || url);
}

export default function EditorCctv({
  diseno,
  token,
  onRecargar,
  camaraInicial,
}: {
  diseno: Diseno;
  token: string;
  onRecargar: () => void;
  /** Cámara a elegir al abrir (al volver de su ficha). */
  camaraInicial?: string | null;
}) {
  const router = useRouter();
  const [estado, despachar] = useReducer(reducirEditor, diseno, (d) => {
    const inicial = estadoInicial(planoDe(d));
    const enNivel = camaraInicial ? nivelDeCamara(inicial.plano, camaraInicial) : null;
    return enNivel ? { ...inicial, seleccion: { tipo: "camara" as const, id: camaraInicial! } } : inicial;
  });
  // La raíz guarda todos los pisos; se edita el nivel activo (`plano`).
  const { plano: raiz, seleccion } = estado;
  const [nivelId, setNivelId] = useState(() => {
    const p = planoDe(diseno);
    return (camaraInicial ? nivelDeCamara(p, camaraInicial)?.nivel.id : null) ?? nivelBase(p).id;
  });
  const niveles = useMemo(() => listaNiveles(raiz), [raiz]);
  const nivelActivo = niveles.find((n) => n.nivel.id === nivelId) ?? niveles[0];
  const plano = nivelActivo.plano;
  const abajo = useMemo(() => nivelDeAbajo(raiz, nivelActivo.nivel.id), [raiz, nivelActivo.nivel.id]);
  const totalCamaras = useMemo(() => todasLasCamaras(raiz).length, [raiz]);
  const numeroNuevo = useMemo(() => siguienteNumeroGlobal(raiz), [raiz]);
  const raizRef = useRef(raiz);
  raizRef.current = raiz;
  const nivelRef = useRef(nivelActivo.nivel.id);
  nivelRef.current = nivelActivo.nivel.id;
  const [meta, setMeta] = useState<Meta>({ nombre: diseno.nombre, estado: diseno.estado, grabacion: diseno.grabacion ?? GRABACION_POR_OMISION });
  const [metaSucia, setMetaSucia] = useState(false);
  const version = useRef(diseno.version);
  const [guardando, setGuardando] = useState(false);
  const [guardadoA, setGuardadoA] = useState<Date | null>(null);
  const [conflicto, setConflicto] = useState<string | null>(null);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenDiseno | null>(diseno.resumen);
  const [herramienta, setHerramienta] = useState<Herramienta>("seleccionar");
  const [capas, setCapas] = useState({ croquis: true, etiquetas: true, calor: false, translucidos: false, humanoides: true, abajo: true, cobertura: false, claves: true, noche: false, tamanoReal: false, cableado: true, cableado3d: false });
  // Pisos de abajo para la vista apilada (en gris). La raíz cambia con cada edición de cualquier
  // piso; si los de abajo no cambiaron se reutiliza la lista para no recalcular su cobertura.
  const debajoRef = useRef<{ clave: string; valor: NivelConPlano[] }>({ clave: "[]", valor: [] });
  const debajo = useMemo(() => {
    const lista = capas.abajo ? niveles.filter((n) => n.nivel.elevacionM < nivelActivo.nivel.elevacionM) : [];
    const clave = JSON.stringify(lista.map(({ nivel, plano: p }) => [nivel, p.escala, p.croquis, p.muros, p.aberturas, p.obstaculos, p.etiquetas, p.camaras, p.personas]));
    if (clave !== debajoRef.current.clave) debajoRef.current = { clave, valor: lista };
    return debajoRef.current.valor;
  }, [capas.abajo, niveles, nivelActivo.nivel.elevacionM]);
  const [webgl, setWebgl] = useState(() => hayWebGL());
  // Con muros se abre en la maqueta; sin nada todavía, donde se empieza: el dibujo con su croquis.
  const [modo, setModo] = useState<"2d" | "3d" | "plano" | "diagrama">(() => (webgl && listaNiveles(planoDe(diseno)).some((n) => n.plano.muros.length) ? "3d" : "2d"));
  const [verDesde, setVerDesde] = useState<string | null>(null);
  const [recorriendo, setRecorriendo] = useState(false);
  const [muebleNuevo, setMuebleNuevo] = useState<TipoMueble>("escritorio");
  const [pisoNuevo, setPisoNuevo] = useState<MaterialPiso>("concreto");
  const [todasLasVistas, setTodasLasVistas] = useState(false);
  const [modeloNuevo, setModeloNuevo] = useState<ModeloCamara>(MODELOS_CAMARA[0]);
  const [equipoNuevo, setEquipoNuevo] = useState<ModeloEquipo | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [armando, setArmando] = useState(false);
  /** Sube al armar un diseño nuevo: la maqueta se abre encuadrada en él. */
  const [disenosArmados, setDisenosArmados] = useState(0);
  const [leyendoFicha, setLeyendoFicha] = useState(false);
  const catalogo = useCatalogo(token);
  const existencias = useExistencias(token, catalogo);
  const { user } = useUser();
  const puedeCotizar = hasPermission(user, PERMISSIONS.COTIZACIONES_ACCESS);
  const [cotizando, setCotizando] = useState(false);
  const [cotizacionId, setCotizacionId] = useState<number | null>(diseno.cotizacionId);
  const [pestana, setPestana] = useState<Pestana>("seleccion");
  const [medida, setMedida] = useState<{ a: Punto; b: Punto } | null>(null);
  const [textoEn, setTextoEn] = useState<Punto | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  /** Aplica un cambio al nivel activo (todo lo del editor trabaja sobre un solo piso). */
  const aplicar = useCallback(
    (p: Plano, opciones?: { seleccion?: Seleccion | null; fusion?: string }) => {
      despachar({ tipo: "aplicar", plano: reemplazarNivel(raizRef.current, nivelRef.current, p), seleccion: opciones?.seleccion, fusion: opciones?.fusion });
      if (opciones?.seleccion) setPestana("seleccion");
    },
    [],
  );
  /** Cambios del edificio (agregar, quitar o renombrar niveles). */
  const aplicarRaiz = useCallback((nueva: Plano) => despachar({ tipo: "aplicar", plano: nueva }), []);
  const cambiarNivel = (id: string) => {
    setNivelId(id);
    despachar({ tipo: "seleccionar", seleccion: null });
    setHerramienta("seleccionar");
  };
  const seleccionar = useCallback((s: Seleccion | null) => {
    despachar({ tipo: "seleccionar", seleccion: s });
    if (s) setPestana("seleccion");
  }, []);

  const numeroEquipo = useCallback((t: TipoEquipo) => siguienteNumeroEquipo(raizRef.current, t), []);
  // El cable se traza con todo el edificio; que no estorbe mientras se arrastra algo.
  const raizDiferida = useDeferredValue(raiz);
  const conexiones = useMemo(() => conexionesDelSistema(raizDiferida), [raizDiferida]);

  /** Lo recién agregado al catálogo queda listo para ponerse. */
  const alAgregarModelo = (id: string) => {
    setAgregando(false);
    setLeyendoFicha(false);
    void catalogo.recargar().then((c) => {
      const nuevo = c.equipos.find((e) => e.id === id);
      const camara = c.camaras.find((e) => e.id === id);
      if (nuevo) elegirEquipo(nuevo);
      else if (camara) {
        setModeloNuevo(camara);
        setHerramienta("camara");
      }
      setAviso("Agregado al catálogo. Toca el sitio para ponerlo.");
    });
  };

  /** Un solo paso de deshacer: si no era lo que se quería, Ctrl+Z regresa todo. */
  const alArmarDiseno = (d: DisenoGenerado) => {
    const dias = d.grabacionDias;
    setArmando(false);
    setVerDesde(null);
    setHerramienta("seleccionar");
    despachar({ tipo: "aplicar", plano: d.raiz, seleccion: null });
    setNivelId(listaNiveles(d.raiz)[0].nivel.id);
    setDisenosArmados((n) => n + 1);
    if (dias) {
      setMeta((x) => ({ ...x, grabacion: { ...x.grabacion, retencionDias: dias } }));
      setMetaSucia(true);
    }
    if (webgl) setModo("3d");
    setAviso(d.avisos[0] ?? `Listo: ${d.resumen}. Ajusta lo que quieras; Ctrl+Z lo deshace.`);
  };

  /** Lo de rack, si hay gabinete en este nivel, no necesita un clic en el sitio: entra directo. */
  const elegirEquipo = (m: ModeloEquipo) => {
    setVerDesde(null);
    const gabinete = (plano.equipos ?? []).find((e) => e.tipo === "gabinete");
    if (TIPOS_DE_RACK.has(m.tipo) && gabinete) {
      const r = agregarEquipo(plano, gabinete.pos, m, numeroEquipo(m.tipo));
      aplicar(r.plano, { seleccion: { tipo: "equipo", id: r.equipo.id } });
      setHerramienta("seleccionar");
      const texto = avisoDeEquipo(r.plano, r.equipo);
      if (texto) setAviso(texto);
      return;
    }
    setEquipoNuevo(m);
    setHerramienta("equipo");
  };

  /* ── Cálculo: lo que tapa y la cobertura de cada cámara (con caché por cámara) ── */
  const tapas = useMemo(() => tapasDelPlano(plano), [plano]);
  const claveTapas = useMemo(() => JSON.stringify([plano.muros, plano.aberturas, plano.obstaculos, plano.escala.metrosPorPx]), [plano.muros, plano.aberturas, plano.obstaculos, plano.escala.metrosPorPx]);
  const cache = useRef(new Map<string, PoligonoCobertura[]>());
  const coberturas = useMemo(() => {
    const salida = new Map<string, PoligonoCobertura[]>();
    const usadas = new Set<string>();
    for (const c of plano.camaras) {
      const clave = `${JSON.stringify(c)}|${claveTapas}`;
      usadas.add(clave);
      let pols = cache.current.get(clave);
      if (!pols) {
        const cm = camaraEnMetros(c, plano.escala);
        pols = cm ? coberturaCamara(cm, tapas) : [];
        cache.current.set(clave, pols);
      }
      salida.set(c.id, pols);
    }
    for (const k of [...cache.current.keys()]) if (!usadas.has(k)) cache.current.delete(k);
    return salida;
  }, [plano.camaras, plano.escala, tapas, claveTapas]);
  const muroIds = useMemo(() => new Set(plano.muros.map((m) => m.id)), [plano.muros]);
  const esHoja = useCallback((t: { origen: string }) => !muroIds.has(t.origen) && plano.aberturas.some((a) => a.id === t.origen && a.tipo === "puerta"), [muroIds, plano.aberturas]);
  const problemas = useMemo(() => problemasDelPlano(plano), [plano]);

  /* ── Guardado automático ── */
  const guardar = useCallback(async () => {
    if (conflicto) return;
    const mandado = raiz;
    const planoParaApi = transformarCroquis(mandado, rutaRelativa);
    const nuevoResumen = resumenDelPlano(mandado, meta.grabacion);
    setGuardando(true);
    try {
      const r = await guardarDiseno(token, diseno.id, {
        version: version.current,
        nombre: meta.nombre.trim() || diseno.nombre,
        estado: meta.estado,
        grabacion: meta.grabacion,
        plano: planoParaApi,
        resumen: nuevoResumen,
      });
      version.current = r.version;
      despachar({ tipo: "guardado", plano: mandado });
      setMetaSucia(false);
      setResumen(nuevoResumen);
      setGuardadoA(new Date());
      setErrorGuardar(null);
    } catch (e) {
      if (e instanceof ConflictoDeVersion) setConflicto(e.message);
      else setErrorGuardar(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }, [conflicto, raiz, meta, token, diseno.id, diseno.nombre]);

  useEffect(() => {
    if ((!estado.sucio && !metaSucia) || guardando || conflicto) return;
    const t = setTimeout(() => void guardar(), 1200);
    return () => clearTimeout(t);
  }, [estado.sucio, metaSucia, guardando, conflicto, guardar]);

  useEffect(() => {
    if (!estado.sucio && !metaSucia) return;
    const salir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", salir);
    return () => window.removeEventListener("beforeunload", salir);
  }, [estado.sucio, metaSucia]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(t);
  }, [aviso]);

  /* ── Teclado ── */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        despachar({ tipo: e.shiftKey ? "rehacer" : "deshacer" });
        return;
      }
      if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        despachar({ tipo: "rehacer" });
        return;
      }
      if (ctrl) return;
      if ((e.key === "Delete" || e.key === "Backspace") && seleccion) {
        e.preventDefault();
        aplicar(borrar(plano, seleccion), { seleccion: null });
        return;
      }
      if (e.key === "Escape") {
        setHerramienta("seleccionar");
        setMedida(null);
        setTextoEn(null);
        return;
      }
      const h = HERRAMIENTAS.find((x) => x.tecla?.toLowerCase() === e.key.toLowerCase());
      if (h) setHerramienta(h.id);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [plano, seleccion, aplicar]);

  /* ── Croquis ── */
  const alElegirCroquis = async (f: File | undefined) => {
    if (!f) return;
    setSubiendo(true);
    try {
      const png = await prepararCroquis(f);
      const invertido = await esOscuro(png).catch(() => false);
      const r = await subirCroquis(token, diseno.id, png, f.name.replace(/\.[^.]+$/, "") + ".png");
      const vacio = !plano.muros.length && !plano.camaras.length;
      const escala = plano.escala.calibracion || !vacio ? plano.escala : { metrosPorPx: 60 / r.anchoPx, calibracion: null };
      aplicar({
        ...plano,
        escala,
        croquis: { url: resolveAssetUrl(r.url) || r.url, anchoPx: r.anchoPx, altoPx: r.altoPx, opacidad: plano.croquis?.opacidad ?? 0.6, invertido },
      });
      if (!escala.calibracion) {
        setHerramienta("cota");
        setAviso("Croquis cargado. Marca los extremos de una cota conocida para calibrar la escala.");
      }
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo subir el croquis.");
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  };

  const camaraSel = seleccion?.tipo === "camara" ? plano.camaras.find((c) => c.id === seleccion.id) : null;
  // La vista de la cámara sale al elegir una (como en el artboard); sin selección el plano queda libre.
  const camaraVista = camaraSel ?? null;
  const cal = plano.escala.calibracion;
  const cob = resumen?.cobertura;

  const textoGuardado = conflicto
    ? "Sin guardar: hay una versión más nueva"
    : guardando
      ? "Guardando…"
      : estado.sucio || metaSucia
        ? "Cambios sin guardar"
        : guardadoA
          ? "Guardado"
          : "Al día";

  const textoHerramienta =
    modo === "3d" && !webgl
      ? "Muros a su altura real y cámaras a su altura de montaje. Clic en un muro, una cámara o una persona para editarla en el panel."
      : herramienta === "seleccionar"
        ? null
        : AYUDA_HERRAMIENTA[herramienta];

  const barraNiveles = (
    <section className={styles.niveles} aria-label="Niveles del edificio">
      {niveles.map(({ nivel, plano: p }) => (
        <button key={nivel.id} type="button" className={styles.nivel} aria-pressed={nivel.id === nivelActivo.nivel.id} onClick={() => cambiarNivel(nivel.id)}>
          <b>{nivel.nombre}</b>
          <span>
            {elevacionTexto(nivel.elevacionM)} · {p.camaras.length ? `${p.camaras.length} ${p.camaras.length === 1 ? "cámara" : "cámaras"}` : "sin cámaras"}
          </span>
        </button>
      ))}
      <Button
        size="sm"
        onClick={() => {
          const r = agregarNivel(raiz);
          aplicarRaiz(r.raiz);
          cambiarNivel(r.id);
          setPestana("plano");
          setAviso("Nivel nuevo: sube su croquis o copia los muros del nivel de abajo (pestaña Plano).");
        }}
      >
        + Nivel
      </Button>
      {abajo ? (
        <label className={styles.capa}>
          <input type="checkbox" checked={capas.abajo} onChange={(e) => setCapas((c) => ({ ...c, abajo: e.target.checked }))} />
          Ver el nivel de abajo en gris
        </label>
      ) : null}
    </section>
  );

  return (
    <div className={styles.pagina}>
      <header className={styles.cabeza}>
        <Link href="/erp/videovigilancia" className={styles.volver} aria-label="Volver a Videovigilancia" title="Volver a Videovigilancia">
          <ChevronLeftRoundedIcon fontSize="small" />
        </Link>
        <div className={styles.cabezaTexto}>
          <div className={styles.tituloFila}>
            <h1 className={styles.titulo}>{meta.nombre || diseno.nombre}</h1>
            <div className={styles.insignias}>
              <Badge tone={meta.estado === "aprobada" ? "success" : meta.estado === "enviada" ? "info" : "neutral"}>{ETIQUETA_ESTADO_DISENO[meta.estado]}</Badge>
              <Badge tone="brand">CCTV · {totalCamaras} {totalCamaras === 1 ? "cámara" : "cámaras"}</Badge>
              {cal ? <Badge tone="success">Escala calibrada · cota {cal.metros.toFixed(2)} m</Badge> : <Badge tone="warning">Escala sin calibrar</Badge>}
            </div>
          </div>
          <div className={styles.sub}>
            <span>{diseno.clienteNombre ?? "Sin cliente"}</span>
            <span>Creado por {diseno.creadoPor?.nombre ?? "—"}</span>
            <span className={conflicto || errorGuardar ? styles.guardadoMal : styles.guardadoBien} aria-live="polite">
              {textoGuardado}
            </span>
          </div>
        </div>
        <Segmented
          ariaLabel="Vista"
          value={modo}
          onChange={(m) => {
            setModo(m);
            setVerDesde(null);
            if (m !== "2d" && !webgl) setHerramienta("seleccionar");
            if (m === "plano" || m === "diagrama") setHerramienta("seleccionar");
          }}
          items={[
            { id: "3d", label: "Maqueta 3D" },
            { id: "plano", label: "Plano técnico" },
            { id: "diagrama", label: "Diagrama" },
            { id: "2d", label: "Dibujo" },
          ]}
        />
        <div className={styles.cabezaAcciones}>
          <Button variant="ghost" icon aria-label="Deshacer (Ctrl+Z)" title="Deshacer (Ctrl+Z)" disabled={!estado.pasado.length} onClick={() => despachar({ tipo: "deshacer" })}>
            <UndoRoundedIcon fontSize="small" />
          </Button>
          <Button variant="ghost" icon aria-label="Rehacer (Ctrl+Y)" title="Rehacer (Ctrl+Y)" disabled={!estado.futuro.length} onClick={() => despachar({ tipo: "rehacer" })}>
            <RedoRoundedIcon fontSize="small" />
          </Button>
          <Button iconStart={<UploadFileOutlinedIcon fontSize="small" />} loading={subiendo} onClick={() => archivo.current?.click()}>
            {plano.croquis ? "Cambiar croquis" : "Subir croquis"}
          </Button>
          {puedeCotizar ? (
            <Button
              iconStart={<RequestQuoteOutlinedIcon fontSize="small" />}
              onClick={() => setCotizando(true)}
              disabled={!totalCamaras && !gruposDeEquipos(raiz, meta.grabacion).length}
              title={cotizacionId ? "Actualiza las partidas del diseño en su cotización" : "Crea una cotización con los equipos, el cable y el plano"}
            >
              {cotizacionId ? "Actualizar cotización" : "Pasar a cotización"}
            </Button>
          ) : null}
          <Button
            variant="primary"
            iconStart={<DescriptionOutlinedIcon fontSize="small" />}
            onClick={async () => {
              if (estado.sucio || metaSucia) await guardar();
              router.push(`/erp/videovigilancia/${diseno.id}/propuesta`);
            }}
            disabled={!totalCamaras}
            title={totalCamaras ? undefined : "Coloca al menos una cámara"}
          >
            Propuesta PDF
          </Button>
          <input ref={archivo} type="file" accept={TIPOS_CROQUIS} hidden onChange={(e) => void alElegirCroquis(e.target.files?.[0])} />
        </div>
      </header>

      {conflicto ? (
        <Alert tone="danger" action={<Button size="sm" onClick={onRecargar}>Recargar</Button>}>
          {conflicto} Lo que cambiaste después de abrirlo no se guardó.
        </Alert>
      ) : errorGuardar ? (
        <Alert tone="warning" action={<Button size="sm" onClick={() => void guardar()}>Reintentar</Button>}>
          {errorGuardar}
        </Alert>
      ) : null}

      <section className={styles.editor}>
        {modo === "diagrama" ? (
          <div className={styles.hojaVista}>
            <div className={styles.hojaBarra}>
              <span className={styles.tenue}>Sale solo de lo que está colocado en la maqueta.</span>
              <Button iconStart={<PrintOutlinedIcon fontSize="small" />} onClick={() => window.print()} title="Sale en doble carta">
                Imprimir diagrama
              </Button>
            </div>
            <style>{IMPRIMIR_HOJA}</style>
            <HojaAjustada>
              <DiagramaSistema raiz={raiz} resumen={resumen} grabacion={meta.grabacion} proyecto={meta.nombre || diseno.nombre} version={version.current} fecha={diseno.updatedAt} />
            </HojaAjustada>
          </div>
        ) : modo === "plano" ? (
          <div className={styles.hojaVista}>
            <div className={styles.hojaBarra}>
              {barraNiveles}
              <Button
                iconStart={<PrintOutlinedIcon fontSize="small" />}
                onClick={() => window.print()}
                title="Sale en doble carta, a escala"
              >
                Imprimir plano
              </Button>
            </div>
            <style>{IMPRIMIR_HOJA}</style>
            <HojaAjustada>
              <PlanoTecnico
                raiz={raiz}
                plano={plano}
                nivel={nivelActivo.nivel}
                numeroHoja={niveles.findIndex((n) => n.nivel.id === nivelActivo.nivel.id) + 1}
                coberturas={coberturas}
                resumen={resumen}
                grabacion={meta.grabacion}
                datos={{ proyecto: meta.nombre || diseno.nombre, cliente: diseno.clienteNombre, elaboro: diseno.creadoPor?.nombre ?? null, fecha: diseno.updatedAt, version: version.current }}
              />
            </HojaAjustada>
          </div>
        ) : (
          <div className={styles.cuerpo}>
            <PanelEquipos
              modeloActivo={modeloNuevo}
              muebleActivo={muebleNuevo}
              pisoActivo={pisoNuevo}
              herramienta={herramienta}
              camaras={catalogo.camaras}
              equipos={catalogo.equipos}
              equipoActivo={equipoNuevo}
              onElegirEquipo={elegirEquipo}
              onAgregar={() => setAgregando(true)}
              onArmar={() => setArmando(true)}
              existencias={existencias.porClave}
              onElegirCamara={(m) => {
                setModeloNuevo(m);
                setHerramienta("camara");
                setVerDesde(null);
              }}
              onElegirMueble={(t) => {
                setMuebleNuevo(t);
                setHerramienta("mueble");
                setVerDesde(null);
              }}
              onElegirPiso={(p) => {
                setPisoNuevo(p);
                setHerramienta("area");
                setVerDesde(null);
              }}
            />
            <div className={styles.lienzoCaja}>
              {modo === "3d" && webgl ? (
                <Maqueta3D
                  // De entrada la maqueta se ve limpia: cobertura y cable se encienden con un clic. En el dibujo el cable sigue visible.
                  key={disenosArmados}
                  versionCatalogo={catalogo.version}
                  plano={plano}
                  nivelId={nivelActivo.nivel.id}
                  conexiones={conexiones}
                  nombreNivel={nivelActivo.nivel.nombre}
                  elevacionM={nivelActivo.nivel.elevacionM}
                  debajo={debajo}
                  seleccion={seleccion}
                  tapas={tapas}
                  coberturas={coberturas}
                  capas={{ ...capas, cableado: capas.cableado3d }}
                  herramienta={herramienta}
                  modeloNuevo={modeloNuevo}
                  muebleNuevo={muebleNuevo}
                  pisoNuevo={pisoNuevo}
                  equipoNuevo={equipoNuevo}
                  numeroEquipo={numeroEquipo}
                  numeroNuevo={numeroNuevo}
                  verDesde={verDesde}
                  onVerDesde={setVerDesde}
                  onAplicar={aplicar}
                  onSeleccionar={seleccionar}
                  onAviso={setAviso}
                  onPedirMedida={(a, b) => setMedida({ a, b })}
                  onPedirTexto={setTextoEn}
                  onHerramienta={setHerramienta}
                  onRecorrido={setRecorriendo}
                  onPerderWebGL={() => {
                    setWebgl(false);
                    setVerDesde(null);
                    setAviso("Este equipo no pudo mantener la vista 3D: seguimos con la vista sencilla.");
                  }}
                />
              ) : modo === "3d" ? (
                <Lienzo3D
                  plano={plano}
                  key={nivelActivo.nivel.id}
                  nombreNivel={nivelActivo.nivel.nombre}
                  elevacionM={nivelActivo.nivel.elevacionM}
                  debajo={debajo}
                  seleccion={seleccion}
                  tapas={tapas}
                  coberturas={coberturas}
                  capas={capas}
                  onSeleccionar={seleccionar}
                />
              ) : (
                <Lienzo
                  key={nivelActivo.nivel.id}
                  plano={plano}
                  seleccion={seleccion}
                  herramienta={herramienta}
                  capas={capas}
                  tapas={tapas}
                  coberturas={coberturas}
                  modeloNuevo={modeloNuevo}
                  muebleNuevo={muebleNuevo}
                  pisoNuevo={pisoNuevo}
                  equipoNuevo={equipoNuevo}
                  numeroEquipo={numeroEquipo}
                  conexiones={conexiones}
                  nivelId={nivelActivo.nivel.id}
                  onAplicar={aplicar}
                  onSeleccionar={seleccionar}
                  onAviso={setAviso}
                  onPedirMedida={(a, b) => setMedida({ a, b })}
                  onPedirTexto={setTextoEn}
                  onHerramienta={setHerramienta}
                  numeroNuevo={numeroNuevo}
                  planoAbajo={capas.abajo ? abajo?.plano ?? null : null}
                />
              )}

              {!verDesde ? (
                <div className={`${styles.barra} ${recorriendo ? styles.barraRecorrido : ""}`}>
                  <div className={styles.herramientas} role="toolbar" aria-label="Herramientas del plano" hidden={(modo === "3d" && !webgl) || recorriendo}>
                    {HERRAMIENTAS.map((h, i) => (
                      <span key={h.id} className={styles.herramientaHueco}>
                        {h.grupo === "camara" && HERRAMIENTAS[i - 1]?.grupo !== "camara" ? <span className={styles.separador} aria-hidden="true" /> : null}
                        <button
                          type="button"
                          className={`${styles.herramienta} ${h.grupo === "camara" ? styles.herramientaCamara : ""}`}
                          aria-pressed={herramienta === h.id}
                          title={h.tecla ? `${h.etiqueta} (${h.tecla})` : h.etiqueta}
                          onClick={() => setHerramienta(h.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d={h.icono} />
                          </svg>
                          {h.etiqueta}
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className={styles.capas} role="group" aria-label="Capas">
                    {modo === "3d" && webgl
                      ? ([
                          ["cobertura", "Cobertura"],
                          ["cableado3d", "Cableado"],
                          ["humanoides", "Personas"],
                          ["noche", "De noche"],
                          ["tamanoReal", "Tamaño real"],
                        ] as const).filter(([k]) => !(recorriendo && (k === "cableado3d" || k === "tamanoReal"))).map(([k, t]) => (
                          <button key={k} type="button" className={styles.capaBoton} aria-pressed={capas[k]} onClick={() => setCapas((c) => ({ ...c, [k]: !c[k] }))}>
                            {t}
                          </button>
                        ))
                      : null}
                    <details className={styles.capasMas}>
                      <summary>Capas</summary>
                      <div>
                        {(modo === "2d"
                          ? ([
                              ["croquis", "Croquis"],
                              ["etiquetas", "Etiquetas"],
                              ["cableado", "Cableado"],
                              ["calor", "Mapa de calor"],
                            ] as const)
                          : webgl
                            ? ([
                                ["claves", "Claves de equipos"],
                                ["etiquetas", "Nombres de áreas"],
                                ["croquis", "Croquis en el piso"],
                                ["translucidos", "Muros translúcidos"],
                              ] as const)
                            : ([
                                ["croquis", "Croquis"],
                                ["etiquetas", "Etiquetas"],
                                ["translucidos", "Muros translúcidos"],
                                ["humanoides", "Humanoides"],
                              ] as const)
                        ).map(([k, t]) => (
                          <label key={k} className={styles.capa}>
                            <input type="checkbox" checked={capas[k]} onChange={(e) => setCapas((c) => ({ ...c, [k]: e.target.checked }))} />
                            {t}
                          </label>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              ) : null}
              {textoHerramienta && !verDesde ? (
                <p className={styles.ayudaHerramienta}>
                  {textoHerramienta}
                  {herramienta === "camara" ? (
                    <label className={styles.modeloNuevo}>
                      Modelo
                      <select value={modeloNuevo.id} onChange={(e) => setModeloNuevo(modeloPorId(e.target.value) ?? MODELOS_CAMARA[0])}>
                        {catalogo.camaras.map((m) => (
                          <option key={m.id} value={m.id}>
                            {etiquetaModelo(m)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </p>
              ) : null}

              {!plano.croquis && !plano.muros.length && modo === "2d" ? (
                <div className={styles.vacio}>
                  <b>Empieza por el croquis del sitio</b>
                  <span>JPG, PNG o el PDF que exporta AutoCAD. Después lo calibras con una cota y dibujas o corriges los muros.</span>
                  <div className={styles.acciones}>
                    <Button variant="primary" loading={subiendo} onClick={() => archivo.current?.click()}>
                      Subir croquis
                    </Button>
                    <Button onClick={() => setHerramienta("muro")}>Dibujar a mano</Button>
                    <Button onClick={() => setArmando(true)}>Armar con IA</Button>
                  </div>
                </div>
              ) : null}
              {!verDesde && !recorriendo ? (
                <div className={styles.leyenda} aria-label="Nivel de detalle según IEC 62676-4">
                  {cob ? (
                    <>
                      <p className={styles.leyendaTotal}>
                        <b>{cob.cubierto.toFixed(1)} %</b> del interior cubierto
                      </p>
                      <span className={styles.leyendaBarra} aria-hidden="true">
                        <i style={{ width: `${cob.identificacion}%`, background: COLOR_NIVEL.identificacion }} />
                        <i style={{ width: `${cob.reconocimiento}%`, background: COLOR_NIVEL.reconocimiento }} />
                        <i style={{ width: `${cob.observacion}%`, background: COLOR_NIVEL.observacion }} />
                        <i style={{ width: `${cob.deteccion}%`, background: COLOR_NIVEL.deteccion }} />
                      </span>
                    </>
                  ) : (
                    <p className={styles.seccion}>Nivel de detalle · IEC 62676-4</p>
                  )}
                  {LEYENDA_NIVELES.map((n) => (
                    <span key={n.nivel} className={styles.leyendaFila}>
                      <span className={styles.punto} style={{ background: COLOR_NIVEL[n.nivel] }} />
                      {n.etiqueta}
                      <b>{cob ? `${Math.round(cob[n.nivel as keyof typeof cob] as number)} %` : n.ppm}</b>
                    </span>
                  ))}
                  {capas.noche && modo === "3d" ? <p className={styles.leyendaNota}>De noche, el cono llega hasta el alcance de IR de cada ficha.</p> : null}
                </div>
              ) : null}
              {camaraVista && modo === "2d" ? (
                <div className={styles.pipCaja}>
                  <VistaCamara plano={plano} camara={camaraVista} tapas={tapas} coberturas={coberturas} esHoja={esHoja} />
                </div>
              ) : null}
              {!verDesde ? <div className={styles.nivelesFlota}>{barraNiveles}</div> : null}
              {medida ? (
                <DialogoMedida
                  plano={plano}
                  a={medida.a}
                  b={medida.b}
                  onCancelar={() => setMedida(null)}
                  onCalibrar={(metrosReales) => {
                    const nuevo = calibrarPlano(plano, medida.a, medida.b, metrosReales);
                    if (!nuevo) setAviso("Esa medida no sirve para calibrar: marca dos puntos separados y una medida mayor a cero.");
                    else {
                      aplicar(nuevo);
                      setAviso(`Escala calibrada: ${metrosReales.toFixed(2)} m.`);
                      setHerramienta("seleccionar");
                    }
                    setMedida(null);
                  }}
                  onSoloCota={(texto) => {
                    aplicar({ ...plano, cotas: [...plano.cotas, { id: nuevoId("co"), a: medida.a, b: medida.b, texto }] });
                    setMedida(null);
                  }}
                />
              ) : null}
              {textoEn ? (
                <DialogoTexto
                  onCancelar={() => setTextoEn(null)}
                  onAceptar={(t) => {
                    aplicar(agregarEtiqueta(plano, textoEn, t));
                    setTextoEn(null);
                  }}
                />
              ) : null}
              {aviso ? (
                <div className={styles.aviso} role="status">
                  {aviso}
                </div>
              ) : null}
            </div>
            <Inspector
              plano={plano}
              seleccion={seleccion}
              pestana={pestana}
              onPestana={setPestana}
              tapas={tapas}
              onAplicar={aplicar}
              onSeleccionar={seleccionar}
              conexiones={conexiones}
              meta={meta}
              onMeta={(m) => {
                setMeta((x) => ({ ...x, ...m }));
                setMetaSucia(true);
              }}
              resumen={resumen}
              onRecalibrar={() => {
                if (!webgl) setModo("2d");
                setHerramienta("cota");
                setAviso("Marca los dos extremos de una cota conocida.");
              }}
              onCambiarCroquis={() => archivo.current?.click()}
              onHerramienta={(h) => {
                if (!webgl) setModo("2d");
                setHerramienta(h);
              }}
              onVerLoQueVe={
                webgl
                  ? (id) => {
                      setModo("3d");
                      setVerDesde(id);
                    }
                  : undefined
              }
              fichaDe={(camId) => `/erp/videovigilancia/${diseno.id}/camara/${encodeURIComponent(camId)}`}
              numeroNuevo={numeroNuevo}
              nivel={{
                nivel: nivelActivo.nivel,
                esPlantaBaja: esPlantaBaja(raiz, nivelActivo.nivel.id),
                nombreDeAbajo: abajo?.nivel.nombre ?? null,
                onCambiar: (cambios) => aplicarRaiz(actualizarNivel(raiz, nivelActivo.nivel.id, cambios)),
                onCopiarMuros: () => {
                  aplicarRaiz(copiarMurosDeAbajo(raiz, nivelActivo.nivel.id));
                  setAviso(`Muros copiados de ${abajo?.nivel.nombre ?? "abajo"}. Ctrl+Z los quita.`);
                },
                onQuitar: () => {
                  const nombre = nivelActivo.nivel.nombre;
                  aplicarRaiz(quitarNivel(raiz, nivelActivo.nivel.id));
                  cambiarNivel(nivelBase(raiz).id);
                  setAviso(`Se quitó ${nombre}. Ctrl+Z lo regresa.`);
                },
              }}
            />
          </div>
        )}

        {modo === "3d" && plano.camaras.length ? (
          <section className={styles.tiraVistas} aria-label="Vistas desde las cámaras">
            <div className={styles.tiraVistasCabeza}>
              <h2>Vistas desde las cámaras</h2>
              <span className={styles.tenue}>Óptica real de cada lente; la etiqueta va pegada a la persona más cercana en su ángulo</span>
              {plano.camaras.length > 4 ? (
                <button type="button" className={styles.enlace} onClick={() => setTodasLasVistas((t) => !t)} style={{ marginLeft: "auto" }}>
                  {todasLasVistas ? "Ver menos" : `Ver las ${plano.camaras.length}`}
                </button>
              ) : null}
            </div>
            <div className={styles.tiraVistasGrid}>
              {[...plano.camaras]
                .sort((a, b) => Number(b.id === camaraSel?.id) - Number(a.id === camaraSel?.id) || a.numero - b.numero)
                .slice(0, todasLasVistas ? undefined : 4)
                .map((c) => (
                  <VistaCamara key={c.id} plano={plano} camara={c} tapas={tapas} coberturas={coberturas} esHoja={esHoja} />
                ))}
            </div>
          </section>
        ) : null}

        {agregando ? (
          <DialogoEquipo
            token={token}
            onCerrar={() => setAgregando(false)}
            onGuardado={alAgregarModelo}
            onMemoria={() => {
              setAgregando(false);
              setLeyendoFicha(true);
            }}
          />
        ) : null}
        {cotizando ? (
          <PasarACotizacion
            token={token}
            disenoId={diseno.id}
            raiz={raiz}
            grabacion={meta.grabacion}
            cotizacionId={cotizacionId}
            disponibilidad={existencias.porClave}
            filas={catalogo.filas}
            guardar={guardar}
            onCerrar={() => setCotizando(false)}
            onHecho={setCotizacionId}
          />
        ) : null}
        {armando ? (
          <AsistenteDiseno
            token={token}
            hayContenido={niveles.some((n) => n.plano.muros.length > 0 || n.plano.camaras.length > 0)}
            onCerrar={() => setArmando(false)}
            onArmado={alArmarDiseno}
          />
        ) : null}
        {leyendoFicha ? (
          <MemoriaTecnica
            token={token}
            onCerrar={() => setLeyendoFicha(false)}
            onGuardado={alAgregarModelo}
            onManual={() => {
              setLeyendoFicha(false);
              setAgregando(true);
            }}
          />
        ) : null}

        <footer className={styles.estado}>
          <span>
            <b>Escala</b>{" "}
            {cal ? `1 px = ${(plano.escala.metrosPorPx * 100).toFixed(1)} cm · cota de ${cal.metros.toFixed(2)} m` : "sin calibrar"}
          </span>
          <span className={problemas.length ? styles.conProblemas : styles.sinProblemas} title={problemas.join("\n") || undefined}>
            {problemas.length ? `${problemas.length} ${problemas.length === 1 ? "detalle" : "detalles"} por revisar en el plano` : "Plano sin problemas"}
          </span>
          {cob ? (
            <span>
              <b>Interior cubierto {Math.round(cob.cubierto)} %</b> · identificación {Math.round(cob.identificacion)} % · reconocimiento {Math.round(cob.reconocimiento)} % · observación{" "}
              {Math.round(cob.observacion)} %
            </span>
          ) : null}
          {resumen ? (
            <span className={styles.estadoFin}>
              {Math.round(resumen.mbps)} Mbps · {resumen.tb.toFixed(1)} TB a {meta.grabacion.retencionDias} días ({meta.grabacion.codec.toUpperCase()})
            </span>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

/** La API guarda el croquis en ruta relativa (`/uploads/…`), no con el dominio de la API. */
function rutaRelativa(url: string): string {
  try {
    const u = new URL(url);
    return /^\/uploads\//.test(u.pathname) ? u.pathname : url;
  } catch {
    return url;
  }
}

function DialogoMedida({
  plano,
  a,
  b,
  onCancelar,
  onCalibrar,
  onSoloCota,
}: {
  plano: Plano;
  a: Punto;
  b: Punto;
  onCancelar: () => void;
  onCalibrar: (metros: number) => void;
  onSoloCota: (texto: string) => void;
}) {
  const actual = Math.hypot(b.x - a.x, b.y - a.y) * plano.escala.metrosPorPx;
  const [valor, setValor] = useState(actual.toFixed(2));
  const n = Number(valor.replace(",", "."));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (n > 0) onCalibrar(n);
  };
  return (
    <form className={styles.dialogo} onSubmit={enviar} aria-label="Medida de la cota">
      <b>¿Cuánto mide esa cota en la realidad?</b>
      <span className={styles.tenue}>Con la escala actual mide {actual.toFixed(2)} m.</span>
      <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" autoFocus aria-label="Medida en metros" end={<span className={styles.unidad}>m</span>} />
      <div className={styles.acciones}>
        <Button type="submit" variant="primary" disabled={!(n > 0)}>
          Calibrar con esta medida
        </Button>
        <Button type="button" onClick={() => onSoloCota(n > 0 ? n.toFixed(2) : "")}>
          Solo dibujar la cota
        </Button>
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function DialogoTexto({ onCancelar, onAceptar }: { onCancelar: () => void; onAceptar: (texto: string) => void }) {
  const [texto, setTexto] = useState("");
  return (
    <form
      className={styles.dialogo}
      onSubmit={(e) => {
        e.preventDefault();
        if (texto.trim()) onAceptar(texto);
      }}
      aria-label="Texto del área"
    >
      <b>Nombre del área</b>
      <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. Área almacenamiento" autoFocus maxLength={80} />
      <div className={styles.acciones}>
        <Button type="submit" variant="primary" disabled={!texto.trim()}>
          Poner
        </Button>
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
