/**
 * Cuando un nombre coincide con varias personas («Antonio»), o nadie dijo quién, se propone a la
 * más probable con lo que ya se sabe de la empresa. Sin IA, puro y con pruebas. Siempre es una
 * propuesta: la tarjeta la dice y se puede cambiar antes de confirmar.
 *
 * En orden de peso (medido con el historial de producción del 01-11-2026):
 * 1. Que se le pueda asignar ese tipo: un servicio solo lo reciben soporte y servicios.
 * 2. Que su puesto sea el de ese trabajo (Técnico Instalador para instalar).
 * 3. Cuántas actividades parecidas ha tenido, luego con ese cliente, luego en total.
 * 4. Empate: el nombre de pila (Antonio Hernández antes que José Antonio).
 */
import { claveDeTipo } from '../complejidad/tiempos-tipicos.js';
import { normalizar } from './nombres.js';
import type { TipoActividad } from './tipos-actividad.js';

/** Lo que se necesita de una actividad anterior para saber quién hace qué. */
export type ActividadPasada = {
  responsableId: number | null;
  coreKind: string | null;
  ticketType: string | null;
  ticketTypeCustom: string | null;
  clientId: number | null;
  titulo?: string | null;
};

export type Trabajo = {
  tipo: TipoActividad;
  /** Subtipo de la tarea o tipo del servicio. */
  subtipo: string | null;
  clienteId: number | null;
};

type Persona = { id: number; nombre: string; puesto?: string | null; recibe?: readonly TipoActividad[] };

/** Qué puesto corresponde a cada trabajo: clave de tipo (sin acentos) → puesto (sin acentos). */
const PUESTO_POR_TRABAJO: Array<[RegExp, RegExp]> = [
  [/^(obra|tarea:(instalacion|cableado|preparacion|mantenimiento|recoleccion|entrega|levantamiento))/, /instala|campo|obra/],
  [/^(servicio:|tarea:(correctivo|configuracion))/, /soporte|servicio|campo|redes/],
  [/^comercial/, /comercial|ventas/],
  [/^tarea:facturacion/, /contador|finanzas|administra/],
  [/^tarea:(tramite|compra)/, /administra|compras|almacen/],
  [/^(proyecto|tarea:diseno)/, /obra|proyecto|disen/],
];

const ETIQUETA_PLURAL: Record<TipoActividad, string> = {
  tarea: 'tareas',
  proyecto: 'actividades de proyecto',
  obra: 'obras',
  servicio: 'servicios',
  comercial: 'actividades comerciales',
};

export function puestoEncaja(puesto: string | null | undefined, t: Trabajo): boolean {
  const clave = normalizar(claveDeTipo({ coreKind: t.tipo, ticketType: t.subtipo, ticketTypeCustom: t.subtipo }) ?? t.tipo).replace(/ /g, ':');
  const texto = normalizar(puesto);
  return PUESTO_POR_TRABAJO.some(([trabajo, buscado]) => trabajo.test(clave) && buscado.test(texto));
}

export type Evaluada<T> = {
  persona: T;
  puntos: number;
  recibe: boolean;
  puesto: boolean;
  parecidas: number;
  conCliente: number;
  total: number;
};

/** Las candidatas de la más a la menos probable para ese trabajo. */
export function ordenarPorProbabilidad<T extends Persona>(
  candidatas: T[],
  trabajo: Trabajo,
  historial: ActividadPasada[] = [],
  /** Palabras que se dijeron: el nombre de pila desempata. */
  dichas: string[] = [],
): Array<Evaluada<T>> {
  const clave = claveDeTipo({ coreKind: trabajo.tipo, ticketType: trabajo.subtipo, ticketTypeCustom: trabajo.subtipo });
  return candidatas
    .map((persona, orden) => {
      const suyas = historial.filter((a) => a.responsableId === persona.id);
      const recibe = !persona.recibe || persona.recibe.includes(trabajo.tipo);
      const puesto = puestoEncaja(persona.puesto, trabajo);
      const parecidas = clave ? suyas.filter((a) => claveDeTipo(a) === clave).length : 0;
      const conCliente = trabajo.clienteId ? suyas.filter((a) => a.clientId === trabajo.clienteId).length : 0;
      const total = suyas.length;
      const pila = dichas.includes(normalizar(persona.nombre).split(' ')[0]) ? 1 : 0;
      const puntos =
        (recibe ? 1000 : 0) +
        (puesto ? 100 : 0) +
        Math.min(parecidas, 5) * 10 +
        Math.min(conCliente, 5) * 5 +
        Math.min(total, 20) +
        pila;
      return { persona, puntos, recibe, puesto, parecidas, conCliente, total, orden };
    })
    .sort((a, b) => b.puntos - a.puntos || a.orden - b.orden)
    .map(({ orden: _orden, ...evaluada }) => evaluada);
}

/** Por qué se propone a esa persona, en corto («porque puede recibir servicios»). */
export function motivoDe<T extends Persona>(mejor: Evaluada<T>, otras: Array<Evaluada<T>>, trabajo: Trabajo): string {
  if (mejor.recibe && otras.length && otras.every((o) => !o.recibe)) return `porque puede recibir ${ETIQUETA_PLURAL[trabajo.tipo]}`;
  if (mejor.puesto && otras.length && !otras.some((o) => o.puesto)) return `por su puesto (${mejor.persona.puesto})`;
  if (mejor.parecidas > 0) return `porque ha hecho ${mejor.parecidas === 1 ? 'una actividad parecida' : `${mejor.parecidas} actividades parecidas`}`;
  if (mejor.conCliente > 0) return 'porque ya ha atendido a este cliente';
  if (mejor.puesto) return `por su puesto (${mejor.persona.puesto})`;
  if (mejor.total > 0) return 'porque es quien más actividades ha tenido';
  return 'por el nombre que dijeron';
}

/** ¿Hay algo que respalde a esta persona cuando nadie la mencionó? */
export function tieneRespaldo<T extends Persona>(e: Evaluada<T>): boolean {
  return e.recibe && (e.puesto || e.parecidas > 0 || e.conCliente > 0);
}
