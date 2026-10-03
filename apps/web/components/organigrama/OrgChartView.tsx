"use client";

/**
 * Organigrama: una telaraña con el director al centro (`GET users/orgchart`).
 *
 * Montado en `/erp/organigrama` (Core) y `/erp/hr/orgchart` (RH). La página es
 * **solo el organigrama**: sin encabezado, sin cifras, sin barra por departamento
 * ni filtros. El director va al centro, sus reportes directos en el primer anillo
 * y cada equipo se abre en abanico detrás de su jefe (`radial-layout.ts`).
 *
 * - Se mueve arrastrando y se acerca con la rueda, con dos dedos o con los botones.
 * - Reasignar jefe o colocar a alguien «al lado de» otro: tocar su tarjeta. Solo con
 *   `canEditOrg` (RH y Dirección); la API exige USERS_MANAGE / CONSOLE_ADMIN.
 * - En pantallas angostas una telaraña no se lee: se cambia por una lista vertical.
 * - El subtítulo de cada persona es su `puesto`, no el nombre del rol RBAC.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/base";
import HrModuleRail from "@/components/hr/HrModuleRail";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { errorLegible } from "@/lib/recursos-ui";
import {
  type OrgChartNode,
  contarSubordinados,
  flattenOrgNodes,
  orgNodeSubtitle,
} from "@/lib/orgchart-layout";
import {
  type Medida,
  type NodoRadial,
  calcularRadial,
  elegirCentro,
  zoomQueCabe,
} from "./radial-layout";
import s from "./organigrama.module.css";

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.4;
/** Cuánto acerca o aleja cada pulsación de los botones. */
const ZOOM_PASO = 1.2;
/** Por debajo de este ancho de ventana se muestra la lista vertical. */
const ANCHO_LISTA = 720;
/** Píxeles que hay que mover el puntero para que cuente como arrastre y no como toque. */
const UMBRAL_ARRASTRE = 5;
/** Alto mínimo del lienzo: en una ventana muy baja se desplaza la página antes que aplastarlo. */
const ALTO_MINIMO = 420;

/** Colores por área, todos de los tokens del tema: sirven en claro y en oscuro. */
const COLORES_AREA = [
  "var(--ui-brand)",
  "var(--ui-info)",
  "var(--ui-violet)",
  "var(--ui-warning)",
  "var(--nx-magenta)",
  "var(--ui-success)",
  "var(--nx-skyblue-strong)",
  "var(--ui-danger)",
];
const COLOR_SIN_AREA = "var(--ui-neutral)";
const SIN_AREA = "Sin área";

type Vista = { z: number; x: number; y: number };

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function Avatar({ url, nombre, className }: { url?: string | null; nombre: string; className: string }) {
  const src = url ? resolveAssetUrl(url) : "";
  if (src) {
    // El nombre ya va escrito al lado: la foto es decorativa para el lector de pantalla.
    return <img src={src} alt="" loading="lazy" draggable={false} className={className} />;
  }
  return (
    <span aria-hidden className={className}>
      {iniciales(nombre)}
    </span>
  );
}

/** Lo que dice la tarjeta al pasar el puntero: todo lo que no cabe escrito. */
function resumenDe(persona: OrgChartNode, ancla: OrgChartNode | undefined, sinJefe: boolean) {
  const partes = [persona.nombre];
  const puesto = orgNodeSubtitle(persona);
  if (puesto) partes.push(puesto);
  if (persona.department?.nombre) partes.push(persona.department.nombre);
  const aCargo = contarSubordinados(persona);
  if (aCargo > 0) partes.push(`${aCargo} a cargo`);
  if (ancla) partes.push(`va al lado de ${ancla.nombre}`);
  if (sinJefe) partes.push("sin jefe asignado");
  return partes.join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tarjeta de persona
// ─────────────────────────────────────────────────────────────────────────────

function Tarjeta({
  nodo,
  color,
  compacto,
  ancla,
  editable,
  seleccionada,
  onEditar,
}: {
  nodo: NodoRadial;
  color: string;
  compacto: boolean;
  ancla?: OrgChartNode;
  editable: boolean;
  seleccionada: boolean;
  onEditar: (id: number) => void;
}) {
  const persona = nodo.persona;
  const puesto = orgNodeSubtitle(persona);
  const sinJefe = nodo.tipoEnlace === "sinJefe";
  const clases = [
    s.tarjeta,
    nodo.nivel === 0 ? s.tarjetaCentro : "",
    compacto && nodo.nivel > 0 ? s.tarjetaCompacta : "",
    sinJefe ? s.tarjetaSinJefe : "",
    seleccionada ? s.tarjetaSeleccionada : "",
  ]
    .filter(Boolean)
    .join(" ");
  const estilo = {
    left: nodo.x - nodo.ancho / 2,
    top: nodo.y - nodo.alto / 2,
    width: nodo.ancho,
    height: nodo.alto,
    "--area": color,
  } as CSSProperties;
  const contenido = (
    <>
      <Avatar url={persona.avatarUrl} nombre={persona.nombre} className={s.avatar} />
      <span className={s.texto}>
        <span className={s.nombre}>{persona.nombre}</span>
        {puesto || sinJefe ? (
          <span className={s.puestoFila}>
            {puesto ? <span className={s.puesto}>{puesto}</span> : null}
            {sinJefe ? <span className={s.marcaSinJefe}>Sin jefe</span> : null}
          </span>
        ) : null}
      </span>
    </>
  );
  const resumen = resumenDe(persona, ancla, sinJefe);

  if (!editable) {
    return (
      <div className={clases} style={estilo} title={resumen} data-org-id={persona.id}>
        {contenido}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${clases} ${s.tarjetaEditable}`}
      style={estilo}
      title={`${resumen}. Toca para cambiar a quién reporta.`}
      aria-label={`Colocar a ${persona.nombre} en el organigrama`}
      aria-pressed={seleccionada}
      data-org-id={persona.id}
      onClick={() => onEditar(persona.id)}
    >
      {contenido}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor: a quién reporta y al lado de quién se dibuja
// ─────────────────────────────────────────────────────────────────────────────

function EditorColocacion({
  persona,
  todos,
  token,
  color,
  onGuardado,
  onCerrar,
}: {
  persona: OrgChartNode;
  todos: OrgChartNode[];
  token: string;
  color: string;
  onGuardado: () => void;
  onCerrar: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [jefe, setJefe] = useState(persona.managerId ? String(persona.managerId) : "");
  const [lateral, setLateral] = useState(persona.lateralDeId ? String(persona.lateralDeId) : "");
  const primerCampo = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    primerCampo.current?.focus();
  }, []);

  /**
   * Guarda las dos colocaciones por separado, porque son dos cosas distintas:
   * «reporta a» cambia la línea de mando (y con ella permisos y alcance), «al
   * lado de» solo cambia dónde se dibuja. Cada una tiene su endpoint y solo se
   * llama la que cambió.
   */
  const guardar = async () => {
    setGuardando(true);
    setFallo(null);
    try {
      const managerId = jefe ? parseInt(jefe, 10) : null;
      const lateralDeId = lateral ? parseInt(lateral, 10) : null;
      if (managerId !== (persona.managerId ?? null)) {
        await apiFetch(`users/${persona.id}/manager`, token, {
          method: "PATCH",
          body: JSON.stringify({ managerId }),
        });
      }
      if (lateralDeId !== (persona.lateralDeId ?? null)) {
        await apiFetch(`users/${persona.id}/lateral`, token, {
          method: "PATCH",
          body: JSON.stringify({ lateralDeId }),
        });
      }
      onGuardado();
    } catch (e: unknown) {
      setFallo(errorLegible(e, "No se pudo guardar el cambio. Intenta de nuevo."));
    } finally {
      setGuardando(false);
    }
  };

  /** Nadie puede reportar a su propia gente: se quitan la persona y todo lo que cuelga de ella. */
  const opciones = useMemo(() => {
    const propios = new Set(flattenOrgNodes([persona]).map((n) => n.id));
    return todos
      .filter((u) => !propios.has(u.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [persona, todos]);

  const puesto = orgNodeSubtitle(persona);
  const aCargo = contarSubordinados(persona);
  const detalle = [puesto, persona.department?.nombre, aCargo > 0 ? `${aCargo} a cargo` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={s.editor}
      role="dialog"
      aria-label={`Colocar a ${persona.nombre}`}
      data-sin-arrastre
      style={{ "--area": color } as CSSProperties}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !guardando) onCerrar();
      }}
    >
      <div className={s.editorCabeza}>
        <Avatar url={persona.avatarUrl} nombre={persona.nombre} className={s.avatar} />
        <div className={s.texto}>
          <div className={s.editorNombre}>{persona.nombre}</div>
          {detalle ? <div className={s.editorDetalle}>{detalle}</div> : null}
        </div>
      </div>

      <label htmlFor={`jefe-${persona.id}`} className={s.etiqueta}>
        Reporta a:
      </label>
      <select
        id={`jefe-${persona.id}`}
        ref={primerCampo}
        value={jefe}
        onChange={(e) => setJefe(e.target.value)}
        className={s.select}
      >
        <option value="">— Nadie: sin jefe asignado —</option>
        {opciones.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
            {orgNodeSubtitle(u) ? ` · ${orgNodeSubtitle(u)}` : u.role ? ` · ${u.role.nombre}` : ""}
          </option>
        ))}
      </select>

      <label htmlFor={`lateral-${persona.id}`} className={s.etiqueta}>
        Al lado de:
      </label>
      <select
        id={`lateral-${persona.id}`}
        value={lateral}
        onChange={(e) => setLateral(e.target.value)}
        className={s.select}
      >
        <option value="">— En su lugar del organigrama —</option>
        {opciones.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
            {orgNodeSubtitle(u) ? ` · ${orgNodeSubtitle(u)}` : ""}
          </option>
        ))}
      </select>
      <p className={s.nota}>
        Se dibuja a su costado, con línea punteada. No manda sobre esa persona ni cuenta como
        gente suya.
      </p>

      {fallo ? (
        <p role="alert" className={s.fallo}>
          {fallo}
        </p>
      ) : null}

      <div className={s.editorAcciones}>
        <Button size="md" variant="primary" onClick={() => void guardar()} loading={guardando}>
          Guardar
        </Button>
        <Button size="md" variant="ghost" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lista vertical (pantallas angostas)
// ─────────────────────────────────────────────────────────────────────────────

function FilaLista({
  persona,
  porId,
  colorDe,
  editable,
  editandoId,
  onEditar,
  esCentro = false,
}: {
  persona: OrgChartNode;
  porId: Map<number, OrgChartNode>;
  colorDe: (p: OrgChartNode) => string;
  editable: boolean;
  editandoId: number | null;
  onEditar: (id: number) => void;
  esCentro?: boolean;
}) {
  const puesto = orgNodeSubtitle(persona);
  const ancla = persona.lateralDeId != null ? porId.get(persona.lateralDeId) : undefined;
  const hijos = persona.children ?? [];
  const contenido = (
    <>
      <Avatar url={persona.avatarUrl} nombre={persona.nombre} className={s.avatar} />
      <span className={s.texto}>
        <span className={s.filaNombre}>{persona.nombre}</span>
        {puesto ? <span className={s.filaPuesto}>{puesto}</span> : null}
        {ancla ? <span className={s.filaNota}>Al lado de {ancla.nombre}</span> : null}
      </span>
    </>
  );
  const clases = `${s.fila} ${esCentro ? s.filaCentro : ""}`;
  const estilo = { "--area": colorDe(persona) } as CSSProperties;
  return (
    <li>
      {editable ? (
        <button
          type="button"
          className={`${clases} ${s.tarjetaEditable}`}
          style={estilo}
          aria-label={`Colocar a ${persona.nombre} en el organigrama`}
          aria-pressed={editandoId === persona.id}
          data-org-id={persona.id}
          onClick={() => onEditar(persona.id)}
        >
          {contenido}
        </button>
      ) : (
        <div className={clases} style={estilo} data-org-id={persona.id}>
          {contenido}
        </div>
      )}
      {hijos.length > 0 ? (
        <ul className={s.sublista}>
          {hijos.map((hijo) => (
            <FilaLista
              key={hijo.id}
              persona={hijo}
              porId={porId}
              colorDe={colorDe}
              editable={editable}
              editandoId={editandoId}
              onEditar={onEditar}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista
// ─────────────────────────────────────────────────────────────────────────────

export type OrgChartViewProps = {
  /** Permite recolocar tocando una tarjeta: RH y dirección (`getHrSectionConfig(user).canAssign`). */
  canEditOrg: boolean;
  /** Carril de RH (plantilla, incidencias, KPIs): solo dentro de `/erp/hr`. */
  showHrRail?: boolean;
};

export default function OrgChartView({ canEditOrg, showHrRail = false }: OrgChartViewProps) {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [roots, setRoots] = useState<OrgChartNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [reintentando, setReintentando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);

  const lienzoRef = useRef<HTMLDivElement>(null);
  const [tamano, setTamano] = useState<Medida>({ ancho: 0, alto: 0 });
  const [altoLienzo, setAltoLienzo] = useState<number | null>(null);
  const [estrecho, setEstrecho] = useState(false);
  /** `null` = encuadre automático (todo el organigrama, director al centro). */
  const [vistaManual, setVistaManual] = useState<Vista | null>(null);
  /** Los botones animan el cambio; el arrastre y la rueda no, o se sentirían con retraso. */
  const [suave, setSuave] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  /**
   * Solo la primera carga pinta el esqueleto. Recargar tras guardar una colocación
   * deja el organigrama a la vista; si falla, se queda lo último que cargó y el
   * aviso ofrece reintentar.
   */
  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const data = await apiFetch("users/orgchart", token);
      setRoots(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(errorLegible(e, "No se pudo cargar el organigrama"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const reintentar = async () => {
    setReintentando(true);
    await load();
    setReintentando(false);
  };

  useEffect(() => {
    void load();
  }, [load]);

  const todos = useMemo(() => flattenOrgNodes(roots), [roots]);
  const porId = useMemo(() => new Map(todos.map((n) => [n.id, n])), [todos]);

  /** Un color por área, el mismo en la tarjeta, en su conector y en la leyenda. */
  const areas = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const u of todos) {
      const nombre = u.department?.nombre ?? SIN_AREA;
      cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
    }
    const conArea = [...cuenta.keys()]
      .filter((n) => n !== SIN_AREA)
      .sort((a, b) => (cuenta.get(b) ?? 0) - (cuenta.get(a) ?? 0) || a.localeCompare(b, "es"));
    const lista = conArea.map((nombre, i) => ({
      nombre,
      color: COLORES_AREA[i % COLORES_AREA.length],
    }));
    if (cuenta.has(SIN_AREA)) lista.push({ nombre: SIN_AREA, color: COLOR_SIN_AREA });
    return lista;
  }, [todos]);
  const colorDe = useCallback(
    (p: OrgChartNode) =>
      areas.find((a) => a.nombre === (p.department?.nombre ?? SIN_AREA))?.color ?? COLOR_SIN_AREA,
    [areas],
  );

  // ── Medidas ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const consulta = window.matchMedia(`(max-width: ${ANCHO_LISTA - 1}px)`);
    const aplicar = () => setEstrecho(consulta.matches);
    aplicar();
    consulta.addEventListener?.("change", aplicar);
    return () => consulta.removeEventListener?.("change", aplicar);
  }, []);

  /**
   * El lienzo llena lo que queda de ventana debajo de él. Se calcula midiendo
   * dónde empieza (el carril de RH o un aviso lo empujan) en vez de restar a ojo
   * la barra superior: así no aparece una barra de desplazamiento de página.
   */
  const medir = useCallback(() => {
    const el = lienzoRef.current;
    if (!el) return;
    const arriba = el.getBoundingClientRect().top + window.scrollY;
    const alto = Math.max(ALTO_MINIMO, Math.floor(window.innerHeight - arriba - 16));
    setAltoLienzo((prev) => (prev === alto ? prev : alto));
    const ancho = el.clientWidth;
    const altoReal = el.clientHeight;
    setTamano((prev) =>
      prev.ancho === ancho && prev.alto === altoReal ? prev : { ancho, alto: altoReal },
    );
  }, []);

  useLayoutEffect(() => {
    medir();
  }, [medir, altoLienzo, estrecho, loading, error, showHrRail]);

  useEffect(() => {
    const el = lienzoRef.current;
    if (!el) return;
    window.addEventListener("resize", medir);
    const observador = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    observador?.observe(el);
    return () => {
      window.removeEventListener("resize", medir);
      observador?.disconnect();
    };
  }, [medir]);

  // ── Diseño y encuadre ──────────────────────────────────────────────────────

  /** Redondeado: arrastrar el borde de la ventana no recalcula el dibujo a cada píxel. */
  const aspecto = tamano.alto > 0 ? Math.round((tamano.ancho / tamano.alto) * 10) / 10 : 1.6;
  const diseno = useMemo(() => calcularRadial(roots, { aspecto }), [roots, aspecto]);
  const centro = useMemo(() => elegirCentro(roots), [roots]);

  const vistaAuto = useMemo<Vista>(
    () => ({ z: zoomQueCabe(diseno, tamano), x: tamano.ancho / 2, y: tamano.alto / 2 }),
    [diseno, tamano],
  );
  const vista = vistaManual ?? vistaAuto;
  const vistaRef = useRef(vista);
  vistaRef.current = vista;

  /** Acerca o aleja dejando quieto el punto (px, py) del lienzo: lo que se mira no se va. */
  const zoomEn = useCallback((px: number, py: number, factor: number) => {
    const actual = vistaRef.current;
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, actual.z * factor));
    if (z === actual.z) return;
    const k = z / actual.z;
    setVistaManual({ z, x: px - (px - actual.x) * k, y: py - (py - actual.y) * k });
  }, []);

  const zoomConBoton = (factor: number) => {
    setSuave(true);
    zoomEn(tamano.ancho / 2, tamano.alto / 2, factor);
  };

  const centrar = () => {
    setSuave(true);
    setVistaManual(null);
  };

  // Rueda: acerca hacia donde apunta el cursor. Va con `addEventListener` porque
  // React la registra pasiva y no dejaría frenar el desplazamiento de la página.
  useEffect(() => {
    const el = lienzoRef.current;
    if (!el || estrecho) return;
    const alGirar = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("[data-sin-arrastre]")) return;
      e.preventDefault();
      setSuave(false);
      const caja = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // Con Ctrl llega el gesto de pellizco del touchpad, que viene en pasos más finos.
      const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015));
      zoomEn(e.clientX - caja.left, e.clientY - caja.top, factor);
    };
    el.addEventListener("wheel", alGirar, { passive: false });
    return () => el.removeEventListener("wheel", alGirar);
  }, [estrecho, zoomEn]);

  // Arrastre con un dedo o el ratón; pellizco con dos dedos.
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<
    | { tipo: "arrastre"; id: number; x0: number; y0: number; vista: Vista; movio: boolean }
    | { tipo: "pellizco"; distancia: number; vista: Vista; mx: number; my: number }
    | null
  >(null);

  const alBajar = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (estrecho) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-sin-arrastre]")) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const caja = e.currentTarget.getBoundingClientRect();
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      gesto.current = {
        tipo: "pellizco",
        distancia: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        vista: vistaRef.current,
        mx: (a.x + b.x) / 2 - caja.left,
        my: (a.y + b.y) / 2 - caja.top,
      };
      for (const id of punteros.current.keys()) {
        try {
          e.currentTarget.setPointerCapture(id);
        } catch {
          /* el puntero ya no existe */
        }
      }
      setSuave(false);
      return;
    }
    gesto.current = {
      tipo: "arrastre",
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      vista: vistaRef.current,
      movio: false,
    };
  };

  const alMover = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    if (!g || !punteros.current.has(e.pointerId)) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.tipo === "pellizco") {
      if (punteros.current.size < 2) return;
      const [a, b] = [...punteros.current.values()];
      const z = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, (g.vista.z * Math.hypot(a.x - b.x, a.y - b.y)) / g.distancia),
      );
      const k = z / g.vista.z;
      setVistaManual({ z, x: g.mx - (g.mx - g.vista.x) * k, y: g.my - (g.my - g.vista.y) * k });
      return;
    }
    if (g.id !== e.pointerId) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.movio) {
      if (Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return;
      // Se captura al empezar a arrastrar y no al bajar: así un toque sin
      // movimiento sigue llegando a la tarjeta, y un arrastre que empieza
      // encima de una tarjeta no la abre al soltar.
      g.movio = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* el puntero ya no existe */
      }
      setSuave(false);
      setArrastrando(true);
    }
    setVistaManual({ z: g.vista.z, x: g.vista.x + dx, y: g.vista.y + dy });
  };

  const alSoltar = (e: ReactPointerEvent<HTMLDivElement>) => {
    punteros.current.delete(e.pointerId);
    if (gesto.current?.tipo === "pellizco" && punteros.current.size >= 2) return;
    gesto.current = null;
    setArrastrando(false);
  };

  // ── Edición ────────────────────────────────────────────────────────────────

  const alEditar = useCallback(
    (id: number) => setEditandoId((actual) => (actual === id ? null : id)),
    [],
  );
  const enEdicion = editandoId != null ? porId.get(editandoId) : undefined;
  const alGuardar = () => {
    setEditandoId(null);
    void load();
  };

  // ── Pintado ────────────────────────────────────────────────────────────────

  const hayGente = roots.length > 0;
  const radial = hayGente && !estrecho;
  const colorDeId = (id: number) => {
    const p = porId.get(id);
    return p ? colorDe(p) : COLOR_SIN_AREA;
  };

  return (
    <div className={s.pagina} data-modo={estrecho ? "lista" : "radial"}>
      <h1 className="ui-sr-only">Organigrama</h1>

      {showHrRail && <HrModuleRail />}

      {error && (
        <InlineAlert
          variant={hayGente ? "warning" : "danger"}
          message={hayGente ? `${error}. Se muestra lo último que cargó.` : error}
          action={
            <Button size="sm" variant="secondary" onClick={() => void reintentar()} loading={reintentando}>
              Reintentar
            </Button>
          }
        />
      )}

      <div
        ref={lienzoRef}
        className={`${s.lienzo} ${radial ? s.lienzoRadial : ""} ${arrastrando ? s.lienzoArrastrando : ""}`}
        style={estrecho ? undefined : { height: altoLienzo ?? undefined }}
        onPointerDown={radial ? alBajar : undefined}
        onPointerMove={radial ? alMover : undefined}
        onPointerUp={radial ? alSoltar : undefined}
        onPointerCancel={radial ? alSoltar : undefined}
      >
        {loading ? (
          <div className={s.estado}>
            <SkeletonRows rows={5} label="Cargando organigrama" />
          </div>
        ) : !hayGente ? (
          error ? null : (
            <div className={s.estado}>
              <EmptyState
                title="Aún no hay nadie en el organigrama"
                description="Cuando RH dé de alta al personal y le asigne jefe, aparece aquí."
              />
            </div>
          )
        ) : estrecho ? (
          <ul className={s.lista} aria-label="Organigrama">
            {centro ? (
              <FilaLista
                persona={centro}
                porId={porId}
                colorDe={colorDe}
                editable={canEditOrg}
                editandoId={editandoId}
                onEditar={alEditar}
                esCentro
              />
            ) : null}
            {roots.some((r) => r.id !== centro?.id) ? (
              <li className={s.listaGrupo}>
                <span className={s.listaRotulo}>Sin jefe asignado</span>
                <ul className={s.listaSueltos}>
                  {roots
                    .filter((r) => r.id !== centro?.id)
                    .map((r) => (
                      <FilaLista
                        key={r.id}
                        persona={r}
                        porId={porId}
                        colorDe={colorDe}
                        editable={canEditOrg}
                        editandoId={editandoId}
                        onEditar={alEditar}
                      />
                    ))}
                </ul>
              </li>
            ) : null}
          </ul>
        ) : (
          <>
            <div
              className={`${s.mundo} ${suave ? s.mundoSuave : ""}`}
              style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})` }}
              role="group"
              aria-label="Organigrama"
            >
              <svg className={s.trazos} width="1" height="1" focusable="false">
                {diseno.anillos.map((anillo, i) => (
                  <path key={i} d={anillo} className={s.anillo} />
                ))}
                {diseno.enlaces.map((enlace) => {
                  const hasta = porId.get(enlace.a);
                  const desde = porId.get(enlace.de);
                  const rotulo =
                    enlace.tipo === "lateral"
                      ? `${hasta?.nombre} va al lado de ${desde?.nombre}`
                      : enlace.tipo === "sinJefe"
                        ? `${hasta?.nombre} no tiene jefe asignado`
                        : null;
                  return (
                    <path
                      key={`${enlace.de}-${enlace.a}`}
                      d={enlace.trazo}
                      className={`${s.enlace} ${enlace.tipo === "mando" ? "" : s.enlacePunteado}`}
                      style={{ "--area": colorDeId(enlace.a) } as CSSProperties}
                    >
                      {rotulo ? <title>{rotulo}</title> : null}
                    </path>
                  );
                })}
              </svg>
              {diseno.nodos.map((nodo) => (
                <Tarjeta
                  key={nodo.id}
                  nodo={nodo}
                  color={colorDe(nodo.persona)}
                  compacto={diseno.compacto}
                  ancla={
                    nodo.tipoEnlace === "lateral" && nodo.enlazaCon != null
                      ? porId.get(nodo.enlazaCon)
                      : undefined
                  }
                  editable={canEditOrg}
                  seleccionada={editandoId === nodo.id}
                  onEditar={alEditar}
                />
              ))}
            </div>

            {areas.length > 1 ? (
              <ul className={s.leyenda} aria-label="Áreas" data-sin-arrastre>
                {areas.map((area) => (
                  <li key={area.nombre} style={{ "--area": area.color } as CSSProperties}>
                    {area.nombre}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className={s.controles} role="group" aria-label="Zoom" data-sin-arrastre>
              <button
                type="button"
                className={s.control}
                onClick={() => zoomConBoton(ZOOM_PASO)}
                disabled={vista.z >= ZOOM_MAX}
                title="Acercar"
                aria-label="Acercar"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
              <button
                type="button"
                className={s.control}
                onClick={() => zoomConBoton(1 / ZOOM_PASO)}
                disabled={vista.z <= ZOOM_MIN}
                title="Alejar"
                aria-label="Alejar"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path d="M3 8h10" />
                </svg>
              </button>
              <button
                type="button"
                className={s.control}
                onClick={centrar}
                title="Centrar: ver todo el organigrama"
                aria-label="Centrar"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <circle cx="8" cy="8" r="2.2" />
                  <path d="M8 1.5v2.6M8 11.9v2.6M1.5 8h2.6M11.9 8h2.6" />
                </svg>
              </button>
            </div>
          </>
        )}

        {enEdicion ? (
          <EditorColocacion
            key={enEdicion.id}
            persona={enEdicion}
            todos={todos}
            token={token}
            color={colorDe(enEdicion)}
            onGuardado={alGuardar}
            onCerrar={() => setEditandoId(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
