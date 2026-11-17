/**
 * Campos de evidencia por elemento al asignar con IA (Adam, 15-11-2026): «instalar 4 cámaras en IPADE»
 * debe dejar «Cámara 1» … «Cámara 4», cada una con foto antes, en progreso y después, editables en la
 * tarjeta antes de confirmar. Se guardan con `PUT activities/:id/evidencia-campos` (mismos límites que
 * `activities/evidence/evidence-fields.helpers.ts`: 40 campos, 120 caracteres).
 *
 * 16-11: cada campo lleva `notas` con la foto exacta pedida por momento; cierre «Pruebas y entrega»
 * (y Grabador si faltó); lo vago sin cantidad también sale completo.
 * 17-11: ningún tipo queda sin secuencia (admin/junta/campo o instalación sin equipos).
 */
export type MomentoEvidencia = 'ANTES' | 'EN_PROGRESO' | 'DESPUES';
export type CampoEvidenciaPropuesto = { nombre: string; momentos: MomentoEvidencia[]; notas: string };
export type ElementoPlan = { nombre: string; cantidad: number };

const MAX_CAMPOS = 40;
const MAX_NOMBRE = 120;
const MAX_NOTAS = 500;
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
const PATRONES_EQUIPO = EQUIPOS.map(([raiz, nombre]) => ({ re: new RegExp(`\\b(?:${raiz})\\b`, 'g'), nombre }));

/** Notas de instalación (ANTES · Durante · DESPUES). Máx 500. */
const NOTAS_INSTALACION: Record<string, string> = {
  Cámara:
    'Antes: punto de montaje y ruta de cable sin intervenir. · Durante: cámara fijada con conector y cable etiquetado. · Después: cámara terminada y su imagen en vivo en el grabador/app.',
  NVR:
    'Antes: lugar del rack/gabinete y cableado de red/energía listos. · Durante: NVR fijado, discos y red conectados. · Después: NVR configurado, cámaras en vivo y grabando.',
  DVR:
    'Antes: lugar del rack/gabinete y cableado coax/energía listos. · Durante: DVR fijado, discos y cámaras conectados. · Después: DVR configurado, canales en vivo y grabando.',
  Lector:
    'Antes: punto de instalación y cableado al panel sin intervenir. · Durante: lector fijado con cable y conector terminados. · Después: lector leído en el panel/app y acceso de prueba OK.',
  Torniquete:
    'Antes: hueco, anclajes y canalización listos. · Durante: torniquete armado, cableado y sensores conectados. · Después: giros de prueba, LED/alarma OK y entrega al cliente.',
  Biométrico:
    'Antes: punto de montaje y cable de red/energía sin intervenir. · Durante: equipo fijado, enrollado y cable etiquetado. · Después: rostros/huellas de prueba y sincronizado con el servidor.',
  Sensor:
    'Antes: zona a cubrir y cableado sin intervenir. · Durante: sensor fijado, alineado y cable terminado. · Después: disparo de prueba reportado en panel/app.',
  Nodo:
    'Antes: ubicación y acometida de red/energía. · Durante: nodo montado, enlaces y etiquetas puestos. · Después: ping/enlace estable y documentado.',
  'Access point':
    'Antes: punto de montaje y PoE/red listos. · Durante: AP fijado, cable etiquetado y antenas orientadas. · Después: SSID al aire, clientes de prueba y cobertura OK.',
  Switch:
    'Antes: espacio en rack y acometida listos. · Durante: switch fijado, uplinks y PoE conectados. · Después: puertos activos, VLANs/PoE verificados y etiquetados.',
  Rack:
    'Antes: sitio limpio, anclajes y acometidas. · Durante: rack armado, charolas y PDU instalados. · Después: rack cerrado, etiquetado y con inventario visible.',
  Monitor:
    'Antes: soporte/pared y HDMI/energía listos. · Durante: monitor fijado y cableado. · Después: imagen del grabador/app a pantalla completa.',
  Bocina:
    'Antes: punto de montaje y cable de audio/energía. · Durante: bocina fijada y cable terminado. · Después: prueba de audio clara desde la fuente.',
  'Panel de alarma':
    'Antes: nicho/pared y acometidas listos. · Durante: panel fijado, zonas y comunicador cableados. · Después: armado/desarmado de prueba y zonas reportando.',
  'Chapa magnética':
    'Antes: marco/hoja y cableado al panel. · Durante: chapa y armature fijados, cable terminado. · Después: retención con puerta cerrada y apertura por lector/botón.',
  Electroimán:
    'Antes: marco/hoja y cableado al panel. · Durante: electroimán fijado y cable terminado. · Después: retención y liberación de prueba OK.',
  'Botón de salida':
    'Antes: punto a la altura correcta y cable al panel. · Durante: botón fijado y cable terminado. · Después: apertura de emergencia de prueba.',
  'Control de acceso':
    'Antes: panel/controlador y acometidas listos. · Durante: equipo fijado, lectores y chapas cableados. · Después: accesos de prueba y eventos en software.',
  _:
    'Antes: sitio y materiales sin intervenir. · Durante: equipo fijado con conector y cable etiquetado. · Después: equipo terminado, probado y documentado.',
};

/** Notas de mantenimiento (ANTES · DESPUES). */
const NOTAS_MANTENIMIENTO: Record<string, string> = {
  Cámara:
    'Antes: estado en que se encontró la cámara (sucia, desalineada, sin imagen o con falla). · Después: limpia, ajustada, con imagen clara y funcionando.',
  NVR:
    'Antes: estado del grabador (discos, alertas, grabación detenida o suciedad). · Después: limpio, discos OK, grabando y con acceso remoto verificado.',
  DVR:
    'Antes: estado del grabador (discos, alertas o canales caídos). · Después: limpio, canales OK y grabando.',
  Lector:
    'Antes: estado del lector (sucio, sin leer o suelto). · Después: limpio, lee tarjeta/huella y reporta al panel.',
  Torniquete:
    'Antes: estado mecánico y sensores (trabado, ruidos o LED en falla). · Después: giro suave, sensores OK y listo para uso.',
  Biométrico:
    'Antes: estado del equipo (sucio, sin leer o fuera de sync). · Después: limpio, lectura OK y sincronizado.',
  Sensor:
    'Antes: estado del sensor (desalineado, sucio o sin reportar). · Después: alineado, limpio y disparo de prueba OK.',
  Nodo:
    'Antes: estado del nodo (sin enlace, caliente o con alarmas). · Después: enlace estable, limpio y sin alarmas.',
  'Access point':
    'Antes: estado del AP (caído, cobertura pobre o caliente). · Después: al aire, clientes OK y cobertura verificada.',
  Switch:
    'Antes: estado del switch (puertos caídos, PoE o alertas). · Después: puertos activos, limpio y sin alertas.',
  Rack:
    'Antes: estado del rack (desorden, polvo o puertas abiertas). · Después: ordenado, limpio y cerrado.',
  Monitor:
    'Antes: estado de la pantalla (apagada, sin señal o sucia). · Después: imagen clara del sistema en vivo.',
  Bocina:
    'Antes: estado del audio (sin sonido, distorsión o suelta). · Después: audio claro y fijación firme.',
  'Panel de alarma':
    'Antes: estado del panel (fallas de zona, batería o comunicador). · Después: zonas OK, batería bien y armado de prueba.',
  'Chapa magnética':
    'Antes: estado de la chapa (floja, sin retención o cable dañado). · Después: retención firme y apertura de prueba OK.',
  Electroimán:
    'Antes: estado del electroimán (sin fuerza o cable dañado). · Después: retención y liberación de prueba OK.',
  'Botón de salida':
    'Antes: estado del botón (suelto, sin abrir o cable dañado). · Después: apertura de emergencia de prueba OK.',
  'Control de acceso':
    'Antes: estado del controlador (offline, eventos perdidos o chapas en falla). · Después: online, accesos de prueba y eventos OK.',
  _:
    'Antes: estado en que se encontró el equipo (sucio, flojo, con falla o alarma). · Después: limpio, ajustado y funcionando.',
};

const NOTA_GRABADOR =
  'Antes: lugar del rack/gabinete y cableado de red/energía listos. · Después: NVR configurado, cámaras en vivo y grabando.';
const NOTA_PRUEBAS =
  'Todas las cámaras/equipos funcionando, grabando y entregados al cliente (foto del grabador o pantalla con todas las vistas).';

/** Subtipos administrativos: capturas de pantalla + archivo (reglas WhatsApp 17-11-2026). */
const ADMIN_SUBTIPOS = new Set([
  'Facturación y contabilidad',
  'Trámite',
  'Compra de material',
  'Reporte / documentación',
  'Diseño, CAD y memoria técnica',
  'Configuración y soporte remoto',
]);

/** Subtipos de campo sin equipos: secuencia «Trabajo realizado». */
const CAMPO_SUBTIPOS = new Set([
  'Levantamiento',
  'Recolección',
  'Entrega',
  'Preparación de equipo',
  'Capacitación',
  'Evento o guardia',
]);

const NOTA_CAPTURAS =
  'Captura de pantalla (no foto del monitor con el celular). Antes: punto de partida (pantalla o documento sin hacer). · Durante: el trabajo a medio camino. · Después: resultado terminado (factura timbrada, trámite enviado, cotización lista).';
const NOTA_ARCHIVO = 'Adjunta el archivo final en la actividad (PDF, Excel, Word…) cuando aplique.';
const NOTA_JUNTA =
  'Durante: foto o captura de la reunión. · Después: minuta o acuerdos (captura o archivo).';
const NOTA_TRABAJO_SOLO_ANTES_DESPUES =
  'Fotos claras que muestren el trabajo, no solo el lugar. Antes: cómo se encontró. · Después: terminado.';
const NOTAS_TRABAJO: Record<string, string> = {
  Entrega:
    'Fotos claras que muestren el trabajo, no solo el lugar. Antes: material completo antes de salir. · Durante: entregándolo. · Después: recibido y firmado.',
  Levantamiento:
    'Fotos claras que muestren el trabajo, no solo el lugar. Antes: vista general. · Durante: medidas y puntos clave. · Después: croquis o notas.',
  Capacitación:
    'Fotos claras que muestren el trabajo, no solo el lugar. Antes: grupo y tema. · Durante: durante la capacitación. · Después: lista de asistencia.',
  _:
    'Fotos claras que muestren el trabajo, no solo el lugar. Antes: cómo se encontró. · Durante: haciéndolo. · Después: terminado.',
};

/** Momentos de instalación/mantenimiento por equipos. El resto lo resuelve camposPorDefecto. */
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

export function esInstalacion(tipo: string, subtipo?: string | null): boolean {
  const s = subtipo ?? '';
  if (tipo === 'proyecto' || tipo === 'obra') return true;
  if (tipo === 'servicio') return s === 'INSTALACION';
  if (tipo === 'tarea') return s === 'Instalación' || s === 'Cableado y canalización';
  return false;
}

const sinAcentos = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function claveEquipo(nombre: string): string {
  const base = nombre
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+\d+\s*$/g, '')
    .trim();
  if (/^c[aá]maras?/i.test(base) || /^c[aá]mara\b/i.test(base)) return 'Cámara';
  if (/^grabador/i.test(base)) return 'NVR';
  for (const [, etiqueta] of EQUIPOS) {
    if (base.toLowerCase() === etiqueta.toLowerCase()) return etiqueta;
    if (base.toLowerCase().startsWith(etiqueta.toLowerCase())) return etiqueta;
  }
  return '_';
}

export function notaDe(nombreEquipo: string, momentos: MomentoEvidencia[]): string {
  const clave = claveEquipo(nombreEquipo);
  const dict = momentos.includes('EN_PROGRESO') ? NOTAS_INSTALACION : NOTAS_MANTENIMIENTO;
  return (dict[clave] ?? dict._!).slice(0, MAX_NOTAS);
}

function campo(nombre: string, momentos: MomentoEvidencia[], notas?: string): CampoEvidenciaPropuesto {
  return {
    nombre: nombre.slice(0, MAX_NOMBRE),
    momentos: [...momentos],
    notas: (notas ?? notaDe(nombre, momentos)).slice(0, MAX_NOTAS),
  };
}

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

/**
 * Equipos mencionados sin número. En plural («poner cámaras en IPADE») la cantidad queda por confirmar;
 * en singular («revisar el DVR», «la cámara del acceso») es uno.
 */
export function equiposSinCantidad(...textos: Array<string | null | undefined>): Array<{ nombre: string; plural: boolean }> {
  const texto = sinAcentos(textos.filter(Boolean).join(' '));
  if (!texto.trim()) return [];
  const conCantidad = new Set(elementosDelTexto(...textos).map((e) => e.nombre));
  // Quita «4 cámaras» / «un NVR» para no volver a contarlos como vagos.
  let limpio = texto;
  for (const { re } of PATRONES) {
    re.lastIndex = 0;
    limpio = limpio.replace(re, ' ');
  }
  const vistos = new Set<string>();
  const salida: Array<{ nombre: string; plural: boolean }> = [];
  for (const { re, nombre } of PATRONES_EQUIPO) {
    if (conCantidad.has(nombre) || vistos.has(nombre)) continue;
    re.lastIndex = 0;
    const m = re.exec(limpio);
    if (m) {
      vistos.add(nombre);
      salida.push({ nombre, plural: /^\S*s(?:\s|$)/.test(m[0].trim()) });
    }
  }
  return salida;
}

function plural(nombre: string): string {
  if (/^[A-Z0-9]{2,}$/.test(nombre)) return nombre; // siglas: «NVR», «DVR»
  if (/[aeiouáéó]$/i.test(nombre)) return `${nombre}s`;
  if (/(r|n|l)$/i.test(nombre)) return `${nombre}es`;
  return nombre;
}

function tieneGrabador(campos: CampoEvidenciaPropuesto[]): boolean {
  return campos.some((c) => /^(NVR|DVR|Grabador)\b/i.test(c.nombre));
}

function tieneCamaras(campos: CampoEvidenciaPropuesto[]): boolean {
  return campos.some((c) => /^C[aá]maras?\b/i.test(c.nombre));
}

function agregarCierreProfesional(salida: CampoEvidenciaPropuesto[], tipo: string, subtipo?: string | null): void {
  if (!esInstalacion(tipo, subtipo) || !salida.length) return;
  if (tieneCamaras(salida) && !tieneGrabador(salida) && salida.length < MAX_CAMPOS) {
    salida.push(campo('Grabador (NVR)', ANTES_Y_DESPUES, NOTA_GRABADOR));
  }
  if (salida.length < MAX_CAMPOS && !salida.some((c) => c.nombre === 'Pruebas y entrega')) {
    salida.push(campo('Pruebas y entrega', ['DESPUES'], NOTA_PRUEBAS));
  }
}

/** Secuencia mínima cuando no hay equipos: admin, junta, campo o instalación/mantenimiento sin elementos. */
export function camposPorDefecto(tipo: string, subtipo?: string | null): CampoEvidenciaPropuesto[] {
  const s = subtipo ?? '';
  if (tipo === 'comercial' || (tipo === 'tarea' && ADMIN_SUBTIPOS.has(s))) {
    return [campo('Capturas de pantalla', TODOS, NOTA_CAPTURAS), campo('Archivo entregable', ['DESPUES'], NOTA_ARCHIVO)];
  }
  if (tipo === 'tarea' && s === 'Junta') {
    return [campo('Junta', ['EN_PROGRESO', 'DESPUES'], NOTA_JUNTA)];
  }
  if (tipo === 'tarea' && CAMPO_SUBTIPOS.has(s)) {
    return [campo('Trabajo realizado', TODOS, (NOTAS_TRABAJO[s] ?? NOTAS_TRABAJO._!).slice(0, MAX_NOTAS))];
  }
  const momentos = momentosDe(tipo, subtipo);
  if (momentos.length) {
    const notas = momentos.includes('EN_PROGRESO') ? NOTAS_TRABAJO._! : NOTA_TRABAJO_SOLO_ANTES_DESPUES;
    return [campo('Trabajo realizado', momentos, notas)];
  }
  return [campo('Trabajo realizado', TODOS, NOTAS_TRABAJO._!)];
}

/** Los campos por elemento: «Cámara 1…N» si son varios; si no hay equipos, secuencia por defecto (nunca vacío). */
export function camposDeElementos(
  accion: { titulo?: string | null; indicaciones?: string | null; elementos?: ElementoPlan[] | null },
  tipo: string,
  subtipo?: string | null,
): CampoEvidenciaPropuesto[] {
  const momentos = momentosDe(tipo, subtipo);
  if (!momentos.length) return camposPorDefecto(tipo, subtipo);
  const deIa = (accion.elementos ?? [])
    .map((e) => ({ nombre: String(e?.nombre ?? '').trim().slice(0, MAX_NOMBRE - 6), cantidad: Math.floor(Number(e?.cantidad)) }))
    .filter((e) => e.nombre && e.cantidad >= 1);
  let elementos = deIa.length ? deIa : elementosDelTexto(accion.titulo, accion.indicaciones);
  if (!elementos.length) {
    elementos = equiposSinCantidad(accion.titulo, accion.indicaciones).map((e) => ({ nombre: e.nombre, cantidad: e.plural ? 0 : 1 }));
  }
  const salida: CampoEvidenciaPropuesto[] = [];
  for (const el of elementos) {
    if (salida.length >= MAX_CAMPOS) break;
    const nombre = el.nombre[0]!.toUpperCase() + el.nombre.slice(1);
    if (el.cantidad === 0) {
      salida.push(campo(`${plural(nombre)} (cantidad por confirmar)`, momentos));
      continue;
    }
    if (el.cantidad === 1) salida.push(campo(nombre, momentos));
    else if (salida.length + el.cantidad > MAX_CAMPOS) salida.push(campo(`${plural(nombre)} (${el.cantidad})`, momentos));
    else for (let i = 1; i <= el.cantidad; i++) salida.push(campo(`${nombre} ${i}`, momentos));
  }
  if (!salida.length) return camposPorDefecto(tipo, subtipo);
  agregarCierreProfesional(salida, tipo, subtipo);
  return salida.slice(0, MAX_CAMPOS);
}

export function avisoCantidadPorConfirmar(campos: CampoEvidenciaPropuesto[]): string | null {
  const vago = campos.find((c) => /cantidad por confirmar/i.test(c.nombre));
  if (!vago) return null;
  if (/^C[aá]maras?\b/i.test(vago.nombre)) return 'No dijiste cuántas cámaras: ajusta los campos de evidencia.';
  const base = vago.nombre.replace(/\s*\(cantidad por confirmar\)\s*/i, '').trim() || 'equipos';
  return `No dijiste la cantidad de ${base.toLowerCase()}: ajusta los campos de evidencia.`;
}

export function lineaAlcanceEvidencia(campos: CampoEvidenciaPropuesto[]): string | null {
  if (!campos.length) return null;
  if (campos.some((c) => c.nombre === 'Capturas de pantalla')) {
    return 'Alcance: trabajo administrativo. Evidencia: capturas de pantalla antes, durante y después, y archivo entregable.';
  }
  if (campos.some((c) => c.nombre === 'Junta')) {
    return 'Alcance: junta. Evidencia: foto o captura durante la reunión y minuta o acuerdos al final.';
  }
  const trabajo = campos.find((c) => c.nombre === 'Trabajo realizado');
  if (trabajo && !campos.some((c) => /^Cámara \d+$/i.test(c.nombre)) && !campos.some((c) => c.nombre === 'Pruebas y entrega')) {
    return trabajo.momentos.includes('EN_PROGRESO')
      ? 'Alcance: trabajo en campo. Evidencia: fotos claras del trabajo antes, durante y después (no solo el lugar).'
      : 'Alcance: trabajo en campo. Evidencia: fotos claras del trabajo antes y después (no solo el lugar).';
  }
  const pruebas = campos.some((c) => c.nombre === 'Pruebas y entrega');
  const vagoCam = campos.find((c) => /^C[aá]maras?\b/i.test(c.nombre) && /cantidad por confirmar/i.test(c.nombre));
  if (vagoCam) {
    return `Alcance: cámaras (cantidad por confirmar). Evidencia: foto antes, durante y después de cada una; ajusta la cantidad.${pruebas ? ' Más pruebas y entrega.' : ''}`;
  }
  const cams = campos.filter((c) => /^Cámara \d+$/i.test(c.nombre));
  if (cams.length) {
    const n = cams.length;
    const cola = pruebas
      ? 'Evidencia: foto antes, durante y después de cada una, más pruebas y entrega.'
      : 'Evidencia: foto antes, durante y después de cada una.';
    return `Alcance: ${n} cámara${n === 1 ? '' : 's'} (Cámara 1–${n}). ${cola}`;
  }
  const principales = campos.filter((c) => c.nombre !== 'Pruebas y entrega' && !/^Grabador\b/i.test(c.nombre));
  const resumen = principales
    .slice(0, 4)
    .map((c) => c.nombre)
    .join(', ');
  const cola = pruebas ? ', más pruebas y entrega' : '';
  return `Alcance: ${resumen || 'equipos'}. Evidencia: foto de cada momento pedido${cola}.`;
}
