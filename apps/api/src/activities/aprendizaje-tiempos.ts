/**
 * Lo que enseñan las actividades terminadas, además de la tabla de tarifas.
 *
 * Medido el 02-11-2026 sin mirar el futuro: cada actividad se predijo solo con lo terminado antes de
 * asignarla y se comparó contra su reloj, dentro de ±50 %:
 * - Título igual, tabla y mediana del tipo: 56 % (60 % desde el 15-10, ya con historial).
 * - Con títulos parecidos, persona y tipo, y tope de lo que queda de jornada: 61 % (69 %).
 *
 * El techo lo pone el reloj: 2 de cada 3 corren hasta que acaba el día, haya trabajo o no. Por eso
 * también se le pregunta a la persona (`tiempo-dicho.ts`), y lo que dice manda sobre el reloj aquí.
 * Predecir «lo que queda del día» sin más daba 67 % y no sirve: acierta por decir siempre lo mismo,
 * y en lo que de verdad terminó antes del fin del día cae a 8 %.
 *
 * Puro, con pruebas.
 */
import { claveDeTipo, mediana, normalizar } from '../ai/complejidad/tiempos-tipicos.js';
import { tipoDelTitulo, type HistorialTitulo, type PersonaTipo, type TipoActividad } from './tiempo-entrega.js';

/** Una actividad terminada: lo que dijo la persona o, si no dijo, su reloj. */
export type MuestraTiempo = { titulo: string; userId: number; minutos: number; clave: string };

/** Veces mínimas para creerle a un título, igual o parecido. */
const VECES_TITULO = 2;
/** Veces mínimas de la misma persona en el mismo tipo. */
export const VECES_PERSONA_TIPO = 3;
/** Comparten al menos la mitad de sus palabras. */
export const PARECIDO_MINIMO = 0.5;

const VACIAS = new Set('de del la el los las en y a al para por con sin un una unos unas se su sus que e o u'.split(' '));
/** No dicen qué trabajo es: dos títulos no se parecen solo por ellas. */
const VAGAS = new Set('actividad actividades tarea tareas apoyo revision revisar hacer realizar seguimiento varios varias general generales'.split(' '));

/** Las palabras con sentido de un título, sin números ni vacías. */
export function palabrasDelTitulo(titulo: string | null | undefined): string[] {
  return [
    ...new Set(
      normalizar(titulo)
        .split(/[^a-z0-9ñ]+/)
        .filter((w) => w.length > 2 && !VACIAS.has(w) && !/^\d+$/.test(w)),
    ),
  ];
}

/** Palabras en común entre todas las que hay (0 a 1). */
export function parecidoDeTitulos(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const enB = new Set(b);
  const comunes = a.filter((w) => enB.has(w)).length;
  return comunes / new Set([...a, ...b]).size;
}

/**
 * El tipo con el que se aprende: el que dice el título si el elegido no cuadra. Lo que no cae en
 * ningún tipo se junta: de esa persona, también enseña.
 */
export function claveConTitulo(a: TipoActividad & { titulo?: string | null; indicaciones?: string | null }): string {
  const delTitulo = tipoDelTitulo(a);
  return claveDeTipo(delTitulo ? { ...a, ...delTitulo } : a) ?? 'sin-tipo';
}

/**
 * Lo que tomó el mismo título: primero las veces de la persona, si son 2+; si no, las de cualquiera.
 * Sin 2 iguales, lo que tomaron títulos parecidos («Cableado biblioteca Tlaxcala» y «Cableado de
 * biblioteca»). null si no alcanza.
 */
export function historialDeMuestras(muestras: MuestraTiempo[], titulo: string | null | undefined, responsableId?: number | null): HistorialTitulo | null {
  const clave = normalizar(titulo);
  if (clave.length < 4) return null;
  const iguales = muestras.filter((m) => normalizar(m.titulo) === clave);
  const propias = responsableId ? iguales.filter((m) => m.userId === responsableId) : [];
  const usar = propias.length >= VECES_TITULO ? propias : iguales.length >= VECES_TITULO ? iguales : null;
  if (usar) return { minutos: mediana(usar.map((m) => m.minutos)) ?? 0, veces: usar.length, propio: usar === propias };

  const palabras = palabrasDelTitulo(titulo);
  if (!palabras.some((w) => !VAGAS.has(w))) return null;
  const parecidas = muestras.filter((m) => parecidoDeTitulos(palabras, palabrasDelTitulo(m.titulo)) >= PARECIDO_MINIMO);
  if (parecidas.length < VECES_TITULO) return null;
  return { minutos: mediana(parecidas.map((m) => m.minutos)) ?? 0, veces: parecidas.length, propio: false, parecidos: true };
}

/** Lo que le toma a esta persona este tipo de trabajo. null con menos de 3 veces. */
export function personaTipoDeMuestras(muestras: MuestraTiempo[], clave: string, responsableId?: number | null): PersonaTipo | null {
  if (!responsableId) return null;
  const mismas = muestras.filter((m) => m.userId === responsableId && m.clave === clave);
  if (mismas.length < VECES_PERSONA_TIPO) return null;
  return { minutos: mediana(mismas.map((m) => m.minutos)) ?? 0, veces: mismas.length };
}
