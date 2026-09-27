/**
 * Catálogos base del negocio, como datos tipados (sin Nest ni Prisma, para poder probarlos con jest):
 *
 *  1. Catálogo maestro de partidas del «Formato V2» (código, equipo, marca, modelo, unidad, grupo y
 *     familia). Es la fuente de las partidas de la plantilla «Proyecto integral».
 *  2. Familias de producto, marcas y servicios reales del negocio (minados de los documentos
 *     comerciales), con su frecuencia para priorizar qué se precarga primero.
 *  3. Catálogo de kits de herramientas de campo.
 *
 * NO lleva precios: el precio lo pone quien cotiza. Tampoco lleva cantidades de proyectos anteriores
 * (el formato original traía las de una obra concreta; aquí se descartaron a propósito).
 *
 * ── Kits de herramientas: por qué son datos y no una tabla ─────────────────────────────────────
 * El esquema no tiene un modelo de «definición de kit». Lo que existe es:
 *   · `ToolInventoryItem`        una herramienta física (serie, foto, estado);
 *   · `ToolKitAssignment`        asigna una herramienta concreta a una persona (su kit personal);
 *   · `ActivityToolRequirement`  un renglón del checklist de una OT: `descripcion` + `cantidad`
 *                                (y, opcionalmente, un producto o una herramienta concreta).
 * Un kit «de campo» es una lista de lo que hay que llevar, es decir, exactamente una lista de
 * renglones `{ descripcion, cantidad }` del checklist. Por eso el kit se guarda aquí con esa misma
 * forma y `requisitosDeKit()` lo entrega listo para `ActivityToolsService.definirRequisitos` (que ya
 * normaliza y quita duplicados con `normalizarRequisitos`). No hace falta migración: cuando se quiera
 * ofrecer «aplicar kit» en el formulario de asignación de una OT, basta con leer `KITS_HERRAMIENTAS`
 * (o exponerlo por un endpoint de solo lectura) y mandar `requisitosDeKit(kit)` como requisitos.
 * Si más adelante los kits deben ser editables por el usuario, ahí sí conviene un modelo propio
 * (`ToolKitTemplate` + renglones), y este módulo sirve de semilla.
 */
import type { GrupoPartida } from './partidas-grupos.js';

// ─── 1. Catálogo maestro de partidas (Formato V2) ───────────────────────────────────────────────

export const CLAVES_FAMILIA_V2 = ['TELECOM', 'ENERGIA', 'CCTV_COMPUTO', 'INFRAESTRUCTURA'] as const;
export type ClaveFamiliaV2 = (typeof CLAVES_FAMILIA_V2)[number];

export type FamiliaV2 = { clave: ClaveFamiliaV2; numero: 1 | 2 | 3 | 4; nombre: string };

/** Las cuatro secciones del formato maestro, en su orden. */
export const FAMILIAS_V2: readonly FamiliaV2[] = [
  { clave: 'TELECOM', numero: 1, nombre: 'Equipo de telecomunicaciones' },
  { clave: 'ENERGIA', numero: 2, nombre: 'Respaldo de energía' },
  { clave: 'CCTV_COMPUTO', numero: 3, nombre: 'CCTV, cómputo, pantallas y proyección' },
  { clave: 'INFRAESTRUCTURA', numero: 4, nombre: 'Infraestructura' },
];

export type PartidaCatalogo = {
  /** Código del formato («1.01», «4.10»). */
  codigo: string;
  equipo: string;
  marca: string | null;
  modelo: string | null;
  unidad: string;
  /** Grupo de la propuesta técnica (Equipos / Materiales / Mano de obra). */
  grupo: GrupoPartida;
  familia: ClaveFamiliaV2;
  descripcion?: string;
};

const E: GrupoPartida = 'EQUIPOS';
const M: GrupoPartida = 'MATERIALES';
const O: GrupoPartida = 'MANO_DE_OBRA';

type Fila = [
  codigo: string,
  equipo: string,
  marca: string | null,
  modelo: string | null,
  unidad: string,
  grupo: GrupoPartida,
  descripcion?: string,
];

function familia(clave: ClaveFamiliaV2, filas: Fila[]): PartidaCatalogo[] {
  return filas.map(([codigo, equipo, marca, modelo, unidad, grupo, descripcion]) => ({
    codigo,
    equipo,
    marca,
    modelo,
    unidad,
    grupo,
    familia: clave,
    ...(descripcion ? { descripcion } : {}),
  }));
}

/**
 * Los conceptos del «Formato Cotización V2» (catálogo de conceptos). El grupo (Equipos / Materiales /
 * Mano de obra) lo asignó quien armó este catálogo: el formato original no lo trae.
 */
export const CATALOGO_PARTIDAS_V2: readonly PartidaCatalogo[] = [
  // 1 — Equipo de telecomunicaciones
  ...familia('TELECOM', [
    ['1.01', 'Router', 'Cisco', null, 'Pieza', E],
    ['1.02', 'Switch de 8 puertos', 'Cisco', null, 'Pieza', E],
    ['1.03', 'Switch de 24 puertos', 'Cisco', null, 'Pieza', E],
    ['1.04', 'Switch de 48 puertos', 'Cisco', null, 'Pieza', E],
    ['1.05', 'Switch industrial (I4.0)', 'Cisco', null, 'Pieza', E],
    ['1.06', 'Access point para oficina', 'Cisco', null, 'Pieza', E],
    ['1.07', 'Access point para almacén', 'Cisco', null, 'Pieza', E],
    ['1.08', 'Access point para área de producción', 'Cisco', null, 'Pieza', E],
    ['1.09', 'Módulo SFP / GBIC', 'Cisco', null, 'Pieza', E],
    ['1.10', 'Jumper de fibra óptica LC-LC', 'Panduit', null, 'Pieza', M],
  ]),
  // 2 — Respaldo de energía
  ...familia('ENERGIA', [
    ['2.01', 'UPS de 3 kVA', 'APC', null, 'Pieza', E],
    ['2.02', 'UPS de 1 kVA', 'APC', null, 'Pieza', E],
    ['2.03', 'UPS de 1 kVA (gabinete IDF)', 'APC', null, 'Pieza', E],
    ['2.04', 'Tarjeta de red para UPS', 'APC', null, 'Pieza', E],
    ['2.05', 'PDU', 'Panduit', null, 'Pieza', E],
  ]),
  // 3 — CCTV, cómputo, pantallas y proyección
  ...familia('CCTV_COMPUTO', [
    ['3.01', 'Pantalla (salas de juntas)', 'Samsung', null, 'Pieza', E],
    ['3.02', 'Proyección inalámbrica', 'Yealink', null, 'Pieza', E],
    ['3.03', 'Proyector', 'Epson', null, 'Pieza', E],
    ['3.04', 'NVR de 64 canales', 'Hanwha', 'XRN6410RB2', 'Pieza', E],
    ['3.05', 'Cámara tipo bala (resistente a humedad)', 'Hanwha', 'XNO-8020R', 'Pieza', E],
    ['3.06', 'Cámara tipo domo', 'Hanwha', 'QNV-C8013R', 'Pieza', E],
    ['3.09', 'Cámara tipo bala', 'Hanwha', 'QNO-C8013R', 'Pieza', E],
    ['3.10', 'Cámara fisheye', 'Hanwha', 'SBP-300HM6', 'Pieza', E],
    ['3.11', 'Cajas de montaje', 'Hanwha', null, 'Pieza', M],
    ['3.12', 'Disco duro', 'Western Digital', 'WD8001PURP', 'Pieza', E, 'Disco duro de 8 TB.'],
    ['3.13', 'Instalación de CCTV', null, null, 'Servicio', O],
    ['3.14', 'Configuración de CCTV', null, null, 'Servicio', O],
    ['3.15', 'Computadora de escritorio', 'Lenovo', null, 'Pieza', E],
    ['3.16', 'Licencia de software', 'Hanwha', null, 'Licencia', E],
  ]),
  // 4 — Infraestructura
  ...familia('INFRAESTRUCTURA', [
    ['4.01', 'Panel de parcheo de 24 puertos', 'Panduit', null, 'Pieza', E],
    ['4.02', 'Panel de parcheo de 48 puertos', 'Panduit', null, 'Pieza', E],
    ['4.03', 'Charolas', 'North System', null, 'Pieza', M],
    ['4.04', 'Sistema de tierra física', null, null, 'Lote', M],
    ['4.05', 'Alarma contra incendio', null, null, 'Sistema', E],
    ['4.06', 'Piso falso', null, null, 'Metro cuadrado', M],
    [
      '4.07',
      'Canalización',
      null,
      'Pared gruesa',
      'Metro',
      M,
      'Con disparos al interior de la planta, en acero inoxidable y con etiquetado de voz y datos. El metraje de canalización se determina durante la visita técnica al sitio.',
    ],
    ['4.08', 'Nodos de red', 'Panduit', 'PanNet Cat6', 'Nodo', M],
    ['4.09', 'Escalerilla / charola', null, null, 'Metro', M],
    ['4.10', 'Patchcord Cat6 de 3 ft', 'Panduit', 'Cat6 de diámetro reducido', 'Pieza', M],
    ['4.11', 'Patchcord Cat6 de 7 ft', 'Panduit', 'Cat6 de diámetro reducido', 'Pieza', M],
    ['4.12', 'Fibra óptica', 'Panduit', null, 'Metro', M],
    ['4.13', 'Rack abierto', 'North System', null, 'Pieza', E],
    ['4.14', 'Rack cerrado', 'North System', null, 'Pieza', E],
    ['4.15', 'Gabinete IDF', 'Panduit', null, 'Pieza', E],
    ['4.16', 'Organizador vertical', 'Panduit', null, 'Pieza', E],
    ['4.17', 'Organizador horizontal', 'Panduit', null, 'Pieza', E],
    ['4.18', 'Charola para fibra óptica', null, null, 'Pieza', M],
    ['4.19', 'Servicio de mudanza de infraestructura (del sitio anterior al nuevo)', null, null, 'Servicio', O],
    ['4.20', 'Renta de plataforma elevadora (Genie)', null, null, 'Día', O],
    ['4.21', 'Antena punto a punto (P2P)', 'Ubiquiti', null, 'Pieza', E],
    ['4.22', 'Gabinete metálico para exterior', 'Argos', null, 'Pieza', E],
    [
      '4.23',
      'Instalación',
      null,
      null,
      'Servicio',
      O,
      'Mano de obra e instalación de nodos, de cámaras y de accesorios en el sitio principal y en los IDF.',
    ],
    ['4.24', 'Caja hermética con ventana acrílica', null, null, 'Pieza', M],
  ]),
];

// ─── 2. Familias de producto, marcas y servicios reales ─────────────────────────────────────────

/** `frecuencia` = cuántas veces aparece en los documentos comerciales minados (prioridad de precarga). */
export type Frecuente = { nombre: string; frecuencia?: number };

export type FamiliaProducto = {
  clave: string;
  nombre: string;
  marcas: Frecuente[];
  conceptos: Frecuente[];
};

export const FAMILIAS_PRODUCTO: readonly FamiliaProducto[] = [
  {
    clave: 'CCTV',
    nombre: 'CCTV / videovigilancia',
    marcas: [{ nombre: 'Hikvision', frecuencia: 170 }, { nombre: 'Hilook' }, { nombre: 'Hanwha' }, { nombre: 'Dahua' }, { nombre: 'Axis' }],
    conceptos: [
      { nombre: 'Cámara domo' },
      { nombre: 'Cámara bala' },
      { nombre: 'Cámara PTZ' },
      { nombre: 'NVR', frecuencia: 123 },
      { nombre: 'DVR' },
    ],
  },
  {
    clave: 'COMPUTO',
    nombre: 'Cómputo y servidores',
    marcas: [{ nombre: 'Lenovo', frecuencia: 399 }, { nombre: 'Dell' }],
    conceptos: [{ nombre: 'Workstation' }, { nombre: 'Servidor' }],
  },
  {
    clave: 'PANTALLAS',
    nombre: 'Pantallas, proyección y videowall',
    marcas: [{ nombre: 'Samsung', frecuencia: 61 }, { nombre: 'Epson' }],
    conceptos: [{ nombre: 'Proyector' }, { nombre: 'Videowall', frecuencia: 95 }],
  },
  {
    clave: 'REDES',
    nombre: 'Redes y cableado',
    marcas: [
      { nombre: 'Cisco', frecuencia: 48 },
      { nombre: 'UniFi / Ubiquiti', frecuencia: 40 },
      { nombre: 'Meraki' },
      { nombre: 'Aruba' },
      { nombre: 'TP-Link' },
      { nombre: 'Grandstream' },
      { nombre: 'Panduit' },
    ],
    conceptos: [
      { nombre: 'Switch', frecuencia: 285 },
      { nombre: 'Router' },
      { nombre: 'Access point' },
      { nombre: 'Fibra óptica', frecuencia: 599 },
      { nombre: 'Cable Cat6', frecuencia: 184 },
      { nombre: 'Cable Cat5' },
      { nombre: 'Patchcord' },
      { nombre: 'Nodos de red' },
      { nombre: 'Rack', frecuencia: 407 },
    ],
  },
  {
    clave: 'ENERGIA',
    nombre: 'Energía',
    marcas: [{ nombre: 'APC' }],
    conceptos: [{ nombre: 'UPS', frecuencia: 109 }],
  },
  {
    clave: 'ALMACENAMIENTO',
    nombre: 'Almacenamiento',
    marcas: [{ nombre: 'Western Digital', frecuencia: 27 }],
    conceptos: [{ nombre: 'Disco duro' }],
  },
  {
    clave: 'LICENCIAS',
    nombre: 'Licencias y software',
    marcas: [{ nombre: 'Microsoft / Office', frecuencia: 54 }, { nombre: 'ESET', frecuencia: 26 }, { nombre: 'Kaspersky' }, { nombre: 'Sophos' }],
    conceptos: [{ nombre: 'Licencia', frecuencia: 445 }],
  },
  {
    clave: 'SEGURIDAD_PERIMETRAL',
    nombre: 'Seguridad perimetral',
    marcas: [{ nombre: 'Fortinet / FortiGate', frecuencia: 23 }, { nombre: 'SonicWall' }],
    conceptos: [{ nombre: 'Firewall' }],
  },
  {
    clave: 'TELEFONIA',
    nombre: 'Telefonía y VoIP',
    marcas: [{ nombre: 'Yealink', frecuencia: 16 }, { nombre: 'Grandstream' }, { nombre: '3CX' }],
    conceptos: [{ nombre: 'Conmutador', frecuencia: 38 }],
  },
  {
    clave: 'CONTROL_ACCESO',
    nombre: 'Control de acceso',
    marcas: [],
    conceptos: [{ nombre: 'Torniquete', frecuencia: 68 }, { nombre: 'Biométrico' }],
  },
  {
    clave: 'DETECCION',
    nombre: 'Detección',
    marcas: [],
    conceptos: [{ nombre: 'Alarma', frecuencia: 168 }, { nombre: 'Incendio', frecuencia: 115 }],
  },
  {
    clave: 'SATELITAL',
    nombre: 'Conectividad satelital',
    marcas: [{ nombre: 'Starlink', frecuencia: 13 }],
    conceptos: [],
  },
];

export type ServicioBase = { clave: string; nombre: string; unidad: string; grupo: GrupoPartida; frecuencia?: number };

/** Servicios que el negocio realmente cobra (todos son mano de obra). */
export const SERVICIOS_BASE: readonly ServicioBase[] = [
  { clave: 'mano-de-obra', nombre: 'Mano de obra', unidad: 'Servicio', grupo: 'MANO_DE_OBRA', frecuencia: 483 },
  { clave: 'instalacion', nombre: 'Instalación', unidad: 'Servicio', grupo: 'MANO_DE_OBRA', frecuencia: 276 },
  { clave: 'soporte', nombre: 'Soporte', unidad: 'Servicio', grupo: 'MANO_DE_OBRA', frecuencia: 184 },
  { clave: 'mantenimiento', nombre: 'Mantenimiento', unidad: 'Servicio', grupo: 'MANO_DE_OBRA', frecuencia: 145 },
  { clave: 'configuracion', nombre: 'Configuración', unidad: 'Servicio', grupo: 'MANO_DE_OBRA', frecuencia: 113 },
  { clave: 'capacitacion', nombre: 'Capacitación', unidad: 'Servicio', grupo: 'MANO_DE_OBRA', frecuencia: 17 },
  { clave: 'poliza', nombre: 'Póliza de servicio', unidad: 'Periodo', grupo: 'MANO_DE_OBRA' },
];

// ─── 3. Kits de herramientas de campo ───────────────────────────────────────────────────────────

export type HerramientaDeKit = {
  /** Lo que ve el técnico en el checklist («Multímetro básico»). */
  descripcion: string;
  cantidad: number;
  unidad: string;
  /** Herramienta que se devuelve (`HERRAMIENTA`) o material que se consume o se deja en sitio (`MATERIAL`). */
  tipo: 'HERRAMIENTA' | 'MATERIAL';
};

export type KitHerramientas = {
  clave: string;
  nombre: string;
  descripcion: string;
  herramientas: HerramientaDeKit[];
};

const h = (descripcion: string, cantidad: number, tipo: HerramientaDeKit['tipo'] = 'HERRAMIENTA'): HerramientaDeKit => ({
  descripcion,
  cantidad,
  unidad: 'Pieza',
  tipo,
});

/** Kits definidos por el negocio. Hoy hay uno: el kit de herramientas y material del ingeniero de campo (IDC). */
export const KITS_HERRAMIENTAS: readonly KitHerramientas[] = [
  {
    clave: 'idc-campo',
    nombre: 'Kit de herramientas y material IDC de campo',
    descripcion: 'Herramienta y material que lleva el ingeniero de campo a una instalación o a un servicio.',
    herramientas: [
      h('Memoria USB 3.0 de 64 GB', 1),
      h('SSD de 240 GB', 1),
      h('Case para disco duro SATA 3.5 (Carso)', 1),
      h('Cable adaptador USB 3.0 a SATA 2.5', 1),
      h('Patch cord de 3 m', 1, 'MATERIAL'),
      h('Jack RJ45 Cat6', 3, 'MATERIAL'),
      h('Plug RJ45 Cat6', 10, 'MATERIAL'),
      h('Kit de RJ45 con pila (corta cable, ponchadora y tester)', 1),
      h('Generador de tonos básico', 1),
      h('Multímetro básico', 1),
      h('Juego de desarmadores multipuntas', 1),
      h('Juego de desarmadores tipo relojero', 1),
      h('Pinzas de corte', 1),
      h('Pinzas de punta', 1),
      h('Teclado alámbrico USB', 1),
      h('Mouse alámbrico USB', 1),
      h('Cinchos', 20, 'MATERIAL'),
      h('Laptop', 1),
    ],
  },
];

export function buscarKit(clave: unknown): KitHerramientas | null {
  const buscada = String(clave ?? '').trim().toLowerCase();
  return KITS_HERRAMIENTAS.find((k) => k.clave === buscada) ?? null;
}

/**
 * El kit como renglones del checklist de una OT (`ActivityToolRequirement`): `descripcion` y `cantidad`,
 * la misma forma que recibe `normalizarRequisitos` / `definirRequisitos`.
 */
export function requisitosDeKit(kit: KitHerramientas): Array<{ descripcion: string; cantidad: number }> {
  return kit.herramientas.map((herramienta) => ({ descripcion: herramienta.descripcion, cantidad: herramienta.cantidad }));
}
