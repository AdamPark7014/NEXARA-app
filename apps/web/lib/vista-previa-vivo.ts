/**
 * Vista previa en vivo del editor de cotizaciones: lo que no es pantalla.
 *
 * - `crearProgramador`: pide el PDF ~600 ms después de la última tecla, cancela la petición que va
 *   en camino cuando llega otra (AbortController) y descarta una respuesta vieja que llegue tarde.
 * - `leerSecciones` / `paginaDeSeccion`: la cabecera `X-Propuesta-Secciones` de la API dice en qué
 *   página empieza cada sección; con eso la vista previa sigue al cursor.
 *
 * Sin React ni DOM: se prueba con temporizadores falsos.
 */

export const SECCIONES_PROPUESTA = ["portada", "objetivo", "alcance", "planos", "cotizacion"] as const;
export type SeccionPropuesta = (typeof SECCIONES_PROPUESTA)[number];
export type PaginasDeSecciones = Partial<Record<SeccionPropuesta, number>>;

export const esSeccionPropuesta = (valor: unknown): valor is SeccionPropuesta =>
  typeof valor === "string" && (SECCIONES_PROPUESTA as readonly string[]).includes(valor);

/** `{"portada":1,"objetivo":2,…}` → mapa limpio. Cabecera ausente, rota o con basura → `{}`. */
export function leerSecciones(cabecera: string | null | undefined): PaginasDeSecciones {
  if (!cabecera) return {};
  let crudo: unknown;
  try {
    crudo = JSON.parse(cabecera);
  } catch {
    return {};
  }
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return {};
  const salida: PaginasDeSecciones = {};
  for (const [clave, valor] of Object.entries(crudo as Record<string, unknown>)) {
    const n = Number(valor);
    if (esSeccionPropuesta(clave) && Number.isInteger(n) && n >= 1 && n <= 10_000) salida[clave] = n;
  }
  return salida;
}

/**
 * Página (1 = portada) a la que se lleva la vista previa cuando se escribe en `seccion`.
 *
 * Una sección que el PDF no imprime (02 sin subsecciones, 03 sin planos) no tiene página: se va a
 * donde aparecería, que es donde empieza la siguiente que sí existe; si no hay siguiente, a la
 * última anterior. Sin datos, la portada.
 */
export function paginaDeSeccion(secciones: PaginasDeSecciones, seccion: SeccionPropuesta, totalPaginas?: number): number {
  const i = SECCIONES_PROPUESTA.indexOf(seccion);
  const acotar = (n: number) => (totalPaginas && totalPaginas > 0 ? Math.min(Math.max(1, n), totalPaginas) : Math.max(1, n));
  const propia = secciones[seccion];
  if (propia) return acotar(propia);
  for (const siguiente of SECCIONES_PROPUESTA.slice(i + 1)) {
    const n = secciones[siguiente];
    if (n) return acotar(n);
  }
  for (const anterior of SECCIONES_PROPUESTA.slice(0, i).reverse()) {
    const n = secciones[anterior];
    if (n) return acotar(n);
  }
  return 1;
}

/** La página donde empieza `seccion` se movió entre dos PDFs (hay que volver a llevarla ahí). */
export function seMovioSeccion(antes: PaginasDeSecciones, ahora: PaginasDeSecciones, seccion: SeccionPropuesta): boolean {
  return paginaDeSeccion(antes, seccion) !== paginaDeSeccion(ahora, seccion);
}

// ─── Programador de peticiones ───────────────────────────────────────────────

export type Temporizador = {
  poner: (fn: () => void, ms: number) => unknown;
  quitar: (id: unknown) => void;
};

const temporizadorReal: Temporizador = {
  poner: (fn, ms) => setTimeout(fn, ms),
  quitar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export type Programador<E> = {
  /** Pide la vista previa de `entrada` cuando pasen `espera` ms sin otra llamada. */
  programar: (entrada: E) => void;
  /** Pide ya (botón «Actualizar», primera carga); cancela lo pendiente. */
  ahora: (entrada: E) => void;
  /** Olvida lo pendiente y aborta lo que va en camino (desmontar, cambiar de cotización). */
  cancelar: () => void;
  /** Hay una petición en camino (para el indicador «Actualizando…»). */
  enCamino: () => boolean;
};

/**
 * Debounce + cancelación + descarte de respuestas viejas.
 *
 * Cada petición lleva un número; solo la última puede entregar su resultado. Aunque el `fetch`
 * ignore el `abort` (o la respuesta ya estuviera en el búfer), una respuesta de una petición
 * anterior nunca pisa a la más nueva.
 */
export function crearProgramador<E, R>(opciones: {
  pedir: (entrada: E, signal: AbortSignal) => Promise<R>;
  alResultado: (resultado: R, entrada: E) => void;
  alError?: (error: unknown, entrada: E) => void;
  /** Cambia el estado «en camino» (`true` al salir la petición, `false` al terminar la última). */
  alCambiarEstado?: (enCamino: boolean) => void;
  espera?: number;
  temporizador?: Temporizador;
}): Programador<E> {
  const espera = opciones.espera ?? 600;
  const reloj = opciones.temporizador ?? temporizadorReal;
  let pendiente: unknown = null;
  let control: AbortController | null = null;
  let ultima = 0;
  let viva = false;

  const marcar = (valor: boolean) => {
    if (viva === valor) return;
    viva = valor;
    opciones.alCambiarEstado?.(valor);
  };

  const quitarPendiente = () => {
    if (pendiente != null) reloj.quitar(pendiente);
    pendiente = null;
  };

  const disparar = (entrada: E) => {
    quitarPendiente();
    control?.abort();
    const propio = new AbortController();
    control = propio;
    const numero = ++ultima;
    marcar(true);
    let promesa: Promise<R>;
    try {
      promesa = opciones.pedir(entrada, propio.signal);
    } catch (e) {
      promesa = Promise.reject(e);
    }
    promesa.then(
      (resultado) => {
        if (numero !== ultima || propio.signal.aborted) return;
        control = null;
        marcar(false);
        opciones.alResultado(resultado, entrada);
      },
      (error) => {
        if (numero !== ultima) return;
        if (propio.signal.aborted || (error as { name?: string })?.name === "AbortError") return;
        control = null;
        marcar(false);
        opciones.alError?.(error, entrada);
      },
    );
  };

  return {
    programar(entrada) {
      quitarPendiente();
      pendiente = reloj.poner(() => {
        pendiente = null;
        disparar(entrada);
      }, espera);
    },
    ahora: disparar,
    cancelar() {
      quitarPendiente();
      control?.abort();
      control = null;
      ultima += 1;
      marcar(false);
    },
    enCamino: () => viva,
  };
}
