/**
 * Campos de evidencia por elemento al asignar con IA (Adam, 15-11-2026): «instalar 4 cámaras en IPADE»
 * debe dejar «Cámara 1» … «Cámara 4», cada una con foto antes, en progreso y después, editables en la
 * tarjeta antes de confirmar. Se guardan con `PUT activities/:id/evidencia-campos` (mismos límites que
 * `activities/evidence/evidence-fields.helpers.ts`: 40 campos, 120 caracteres).
 *
 * Fuente 1: lo que la IA leyó (`elem`). Fuente 2, si no lo dio: cantidad + equipo en el título o las
 * indicaciones, con un diccionario corto de seguridad electrónica. Módulo puro.
 */
export type MomentoEvidencia = 'ANTES' | 'EN_PROGRESO' | 'DESPUES';
export type CampoEvidenciaPropuesto = { nombre: string; momentos: MomentoEvidencia[] };
export type ElementoPlan = { nombre: string; cantidad: number };

const MAX_CAMPOS = 40;
const MAX_NOMBRE = 120;
const TODOS: MomentoEvidencia[] = ['ANTES', 'EN_PROGRESO', 'DESPUES'];
const ANTES_Y_DESPUES: MomentoEvidencia[] = ['ANTES', 'DESPUES'];

const NUMEROS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20,
};

/** Raíz sin acentos (en minúsculas) → nombre como se escribe en el campo. El orden importa: lo largo primero. */
const EQUIPOS: Array<[string, string]> = [
  ['camaras? (?:ip|domo|bala|ptz)?', 'Cámara'],
  ['control(?:es)? de acceso', 'Control de acceso'],
  ['paneles? de alarma', 'Panel de alarma'],
  ['chapas? magneticas?', 'Chapa magnética'],
  ['electroimanes?', 'Electroimán'],
  ['botones? de salida', 'Botón de salida'],
  ['access points?|aps?', 'Access point'],
  ['lectoras?|lectores?', 'Lector'],
  ['torniquetes?', 'Torniquete'],
  ['biometricos?|checadores?', 'Biométrico'],
  ['sensores?', 'Sensor'],
  ['nodos?', 'Nodo'],
  ['switch(?:es)?', 'Switch'],
  ['racks?', 'Rack'],
  ['monitores?|pantallas?', 'Monitor'],
  ['bocinas?', 'Bocina'],
  ['nvrs?', 'NVR'],
  ['dvrs?', 'DVR'],
];

const CANTIDAD = `(\\d{1,3}|${Object.keys(NUMEROS).join('|')})`;
const PATRONES = EQUIPOS.map(([raiz, nombre]) => ({ re: new RegExp(`\\b${CANTIDAD}\\s+(?:${raiz})\\b`, 'g'), nombre }));

/** Qué momentos se piden según el trabajo. Lo que no se instala ni se repara no lleva campos. */
export function momentosDe(tipo: string, subtipo?: string | null): MomentoEvidencia[] {
  const s = subtipo ?? '';
  if (tipo === 'proyecto' || tipo === 'obra') return TODOS;
  if (tipo === 'servicio') return s === 'INSTALACION' ? TODOS : s === 'PREVENTIVO' || s === 'CORRECTIVO' || s === 'EMERGENCIA' ? ANTES_Y_DESPUES : [];
  if (tipo === 'tarea') {
    if (s === 'Instalación' || s === 'Cableado y canalización') return TODOS;
    if (s === 'Mantenimiento preventivo' || s === 'Correctivo y diagnóstico') return ANTES_Y_DESPUES;
  }
  return [];
}

const sinAcentos = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** «4 cámaras y un NVR» → [{Cámara, 4}, {NVR, 1}]. Un mismo equipo dicho dos veces se suma. */
export function elementosDelTexto(...textos: Array<string | null | undefined>): ElementoPlan[] {
  const texto = sinAcentos(textos.filter(Boolean).join(' '));
  const suma = new Map<string, number>();
  for (const { re, nombre } of PATRONES) {
    re.lastIndex = 0;
    for (const m of texto.matchAll(re)) {
      const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : NUMEROS[m[1]!] ?? 0;
      if (n >= 1) suma.set(nombre, (suma.get(nombre) ?? 0) + n);
    }
  }
  return [...suma].map(([nombre, cantidad]) => ({ nombre, cantidad }));
}

function plural(nombre: string): string {
  if (/[aeiouáéó]$/i.test(nombre)) return `${nombre}s`;
  if (/(r|n|l)$/i.test(nombre)) return `${nombre}es`;
  return nombre;
}

/** Los campos por elemento: «Cámara 1…N» si son varios, el nombre solo si es uno, y un renglón si no caben. */
export function camposDeElementos(
  accion: { titulo?: string | null; indicaciones?: string | null; elementos?: ElementoPlan[] | null },
  tipo: string,
  subtipo?: string | null,
): CampoEvidenciaPropuesto[] {
  const momentos = momentosDe(tipo, subtipo);
  if (!momentos.length) return [];
  const deIa = (accion.elementos ?? [])
    .map((e) => ({ nombre: String(e?.nombre ?? '').trim().slice(0, MAX_NOMBRE - 6), cantidad: Math.floor(Number(e?.cantidad)) }))
    .filter((e) => e.nombre && e.cantidad >= 1);
  const elementos = deIa.length ? deIa : elementosDelTexto(accion.titulo, accion.indicaciones);
  const salida: CampoEvidenciaPropuesto[] = [];
  for (const el of elementos) {
    if (salida.length >= MAX_CAMPOS) break;
    const nombre = el.nombre[0]!.toUpperCase() + el.nombre.slice(1);
    if (el.cantidad === 1) salida.push({ nombre, momentos: [...momentos] });
    else if (salida.length + el.cantidad > MAX_CAMPOS) salida.push({ nombre: `${plural(nombre)} (${el.cantidad})`, momentos: [...momentos] });
    else for (let i = 1; i <= el.cantidad; i++) salida.push({ nombre: `${nombre} ${i}`, momentos: [...momentos] });
  }
  return salida.slice(0, MAX_CAMPOS);
}
