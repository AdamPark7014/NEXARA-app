/**
 * Casos del eval de «Cotizar con IA». Clientes y productos inventados: el repo es público. Las frases
 * reales de la empresa van en un JSON local (`--real`), nunca aquí.
 *
 * Cada caso dice qué renglones deben salir (`busca`: palabras que debe traer, ya sin acentos), con qué
 * cantidad y, si ya se cotizó o está en el catálogo, qué modelo debe elegir.
 */
import type { FilaCotizada } from '../../cotizaciones/partidas-frecuentes.js';
import type { FichaComparable } from '../../ventas/clientes-parecidos.js';

export type LineaEsperada = { cant: number; busca: string[]; modelo?: string };

export type CasoCotizar = {
  id: string;
  frase: string;
  /** Nombre del cliente que debe quedar. `null` = no lo dijeron: «A QUIEN CORRESPONDA». */
  cliente: string | null;
  lineas: LineaEsperada[];
  /** Debe resolverse sin llamar a la IA. */
  sinIa?: boolean;
};

export const PADRON_COTIZAR: FichaComparable[] = [
  { id: 1, name: 'A QUIEN CORRESPONDA' },
  { id: 2, name: 'Hotel Portal de Analco', legalName: 'Operadora Hotelera Portal de Analco, S.A. de C.V.' },
  { id: 3, name: 'Colegio Bosques de Zavaleta' },
  { id: 4, name: 'Lácteos San Andrés' },
  { id: 5, name: 'Bodega de' },
  { id: 6, name: 'Licencia' },
  { id: 7, name: 'Plaza Las Ánimas' },
  { id: 8, name: 'CEMEX' },
];

export const CLIENTES_USADOS = [
  { nombre: 'Materiales Pronto', salesClientId: 5 },
  { nombre: 'Universidad del Valle de Puebla', salesClientId: null },
];

const fila = (
  id: number,
  cotizacionId: number,
  name: string,
  datos: Partial<FilaCotizada> = {},
): FilaCotizada => ({ id, cotizacionId, name, unit: 'Pieza', unitCost: 100, unitPrice: 120, createdAt: '2026-10-01T12:00:00Z', ...datos });

/** Lo que la empresa de muestra ya cotizó. */
export const FILAS_COTIZAR: FilaCotizada[] = [
  fila(1, 10, 'Cámara IP domo 4 MP lente 2.8 mm IR 30 m', { brand: 'Hikvision', model: 'DS-2CD1143G2', unitCost: 1450, unitPrice: 1740 }),
  fila(2, 10, 'NVR 32 canales 4K', { brand: 'Hikvision', model: 'DS-7632NXI', unitCost: 7800, unitPrice: 9360 }),
  fila(3, 10, 'Disco duro 6 TB para videovigilancia', { brand: 'Toshiba', model: 'HDWT860', unitCost: 3100, unitPrice: 3720 }),
  fila(4, 10, 'Instalación de cámara de seguridad', { unit: 'Servicio', unitCost: 350, unitPrice: 350, grupo: 'MANO_DE_OBRA' }),
  fila(5, 10, 'Canalización con canaleta PVC en interiores', { unit: 'Lote', unitCost: 3500, unitPrice: 3500, grupo: 'MANO_DE_OBRA' }),
  fila(6, 11, 'Cámara IP bala 4 MP exterior IP67', { brand: 'Dahua', model: 'IPC-HFW2441', unitCost: 1300, unitPrice: 1560 }),
  fila(7, 11, 'Switch PoE 16 puertos gigabit', { brand: 'TP-Link', model: 'TL-SG1218MPE', unitCost: 3400, unitPrice: 4080 }),
  fila(8, 11, 'Bobina de cable UTP Cat6 305 m exterior', { brand: 'Linkedpro', model: 'PRO-CAT-6-EXT', unitCost: 2960, unitPrice: 3400 }),
  fila(9, 12, 'Access point Wi-Fi 6 para techo', { brand: 'TP-Link', model: 'EAP650', unitCost: 2500, unitPrice: 3000 }),
  fila(10, 12, 'Instalación de access point', { unit: 'Servicio', unitCost: 450, unitPrice: 450, grupo: 'MANO_DE_OBRA' }),
  fila(11, 13, 'Terminal biométrica facial', { brand: 'ZKTeco', model: 'SpeedFace-V5L', unitCost: 5000, unitPrice: 6000 }),
  fila(12, 13, 'Licencia BioTime 20 dispositivos', { brand: 'ZKTeco', model: 'BT-20', unit: 'Licencia', unitCost: 15000, unitPrice: 18000 }),
  fila(13, 14, 'Laptop Lenovo V14 G4 14 pulgadas', { brand: 'Lenovo', model: '2YT00WFLM', unitCost: 20500, unitPrice: 23600 }),
  fila(14, 14, 'Multifuncional láser monocromático', { brand: 'HP', model: 'M236sdw', unitCost: 4300, unitPrice: 5100 }),
  fila(15, 15, 'Impresora de etiquetas ZD421', { brand: 'Zebra', model: 'ZD421D', unitCost: 8200, unitPrice: 8950 }),
  fila(16, 15, 'Envío a domicilio', { unit: 'Servicio', unitCost: 250, unitPrice: 275 }),
  fila(17, 16, 'Mantenimiento preventivo a cámaras', { unit: 'Servicio', unitCost: 160, unitPrice: 160 }),
  fila(18, 17, 'Procesador Intel Core i7', { brand: 'Intel', model: 'i7-14700', unitCost: 6700, unitPrice: 7030 }),
  fila(19, 17, 'Tarjeta madre B760', { brand: 'ASUS', model: 'B760-PLUS', unitCost: 3900, unitPrice: 4090 }),
  fila(20, 17, 'Memoria RAM DDR5 32 GB', { brand: 'Kingston', model: 'FURY-32', unitCost: 3300, unitPrice: 3650 }),
];

export const CASOS_COTIZAR: CasoCotizar[] = [
  {
    id: 'c01',
    frase: '14 cámaras domo con NVR de 32 y canalización para la bodega de Materiales Pronto',
    cliente: 'Materiales Pronto',
    lineas: [
      { cant: 14, busca: ['camara', 'domo'], modelo: 'DS-2CD1143G2' },
      { cant: 1, busca: ['nvr', '32'], modelo: 'DS-7632NXI' },
      { cant: 1, busca: ['canalizacion'] },
    ],
  },
  {
    id: 'c02',
    frase: 'Cotízame para Hotel Portal de Analco 8 access point instalados y 2 bobinas de cable cat 6',
    cliente: 'Hotel Portal de Analco',
    lineas: [
      { cant: 8, busca: ['ap'], modelo: 'EAP650' },
      { cant: 8, busca: ['instalacion', 'ap'] },
      { cant: 2, busca: ['bobina', 'cat6'], modelo: 'PRO-CAT-6-EXT' },
    ],
  },
  {
    id: 'c03',
    frase: 'cuatro discos duros de 6 teras para Plaza Las Ánimas',
    cliente: 'Plaza Las Ánimas',
    lineas: [{ cant: 4, busca: ['disco', '6tb'], modelo: 'HDWT860' }],
  },
  {
    id: 'c04',
    frase: '12 terminales biométricas faciales con licencia biotime de 20 dispositivos para el Colegio Bosques de Zavaleta',
    cliente: 'Colegio Bosques de Zavaleta',
    lineas: [
      { cant: 12, busca: ['biometrico'], modelo: 'SpeedFace-V5L' },
      { cant: 1, busca: ['licencia', 'biotime'], modelo: 'BT-20' },
    ],
  },
  {
    id: 'c05',
    frase: '17 laptops Lenovo V14 y 2 multifuncionales para Universidad del Valle de Puebla',
    cliente: 'Universidad del Valle de Puebla',
    lineas: [
      { cant: 17, busca: ['laptop', 'lenovo'], modelo: '2YT00WFLM' },
      { cant: 2, busca: ['multifuncional'], modelo: 'M236sdw' },
    ],
  },
  {
    id: 'c06',
    frase: 'una licencia de ZKTeco biotime',
    cliente: null,
    lineas: [{ cant: 1, busca: ['licencia', 'biotime'], modelo: 'BT-20' }],
  },
  {
    id: 'c07',
    frase: 'en ve erre de treinta y dos canales, doce cámaras bala y un suich pe o e de 16 puertos para cemex',
    cliente: 'CEMEX',
    lineas: [
      { cant: 1, busca: ['nvr', '32'], modelo: 'DS-7632NXI' },
      { cant: 12, busca: ['camara', 'bala'], modelo: 'IPC-HFW2441' },
      { cant: 1, busca: ['switch', '16'], modelo: 'TL-SG1218MPE' },
    ],
  },
  {
    id: 'c08',
    frase: 'póliza de mantenimiento preventivo a 29 cámaras para Lácteos San Andrés',
    cliente: 'Lácteos San Andrés',
    lineas: [{ cant: 29, busca: ['mantenimiento', 'camara'] }],
  },
  {
    id: 'c09',
    frase: '100 metros de cable UTP categoría 6 y 20 conectores RJ45 para una oficina',
    cliente: null,
    lineas: [
      { cant: 100, busca: ['cable', 'utp'] },
      { cant: 20, busca: ['conector', 'rj45'] },
    ],
  },
  {
    id: 'c10',
    frase: 'necesito 3 impresoras zebra ZD421 con envío a Mérida para Ferretera del Sureste',
    cliente: 'Ferretera del Sureste',
    lineas: [
      { cant: 3, busca: ['impresora', 'zd421'], modelo: 'ZD421D' },
      { cant: 1, busca: ['envio'] },
    ],
  },
  {
    id: 'c11',
    frase: 'armar una compu con procesador i7, tarjeta madre B760 y dos memorias de 32 gigas',
    cliente: null,
    lineas: [
      { cant: 1, busca: ['procesador', 'i7'], modelo: 'i7-14700' },
      { cant: 1, busca: ['tarjeta', 'madre'], modelo: 'B760-PLUS' },
      { cant: 2, busca: ['memoria', '32gb'], modelo: 'FURY-32' },
    ],
  },
  {
    id: 'c12',
    frase: 'cámaras con audio, 6 piezas, para el Hotel Portal de Analco',
    cliente: 'Hotel Portal de Analco',
    lineas: [{ cant: 6, busca: ['camara', 'audio'] }],
  },
  {
    id: 'c13',
    frase: '50 cámaras turbo hd exterior, 2 dvr de 32, 4 discos de 6 tb, 50 balunes, 7 bobinas de cable, canaleta y configuración',
    cliente: null,
    lineas: [
      { cant: 50, busca: ['camara'] },
      { cant: 2, busca: ['dvr', '32'] },
      { cant: 4, busca: ['disco', '6tb'], modelo: 'HDWT860' },
      { cant: 50, busca: ['balun'] },
      { cant: 7, busca: ['bobina'] },
      { cant: 1, busca: ['canalizacion'] },
      { cant: 1, busca: ['configuracion'] },
    ],
  },
  {
    id: 'c14',
    frase: 'un par de switches poe de 16 para Materiales Pronto',
    cliente: 'Materiales Pronto',
    lineas: [{ cant: 2, busca: ['switch', 'poe'], modelo: 'TL-SG1218MPE' }],
  },
  {
    id: 'c15',
    frase: 'una docena de cámaras domo instaladas',
    cliente: null,
    lineas: [
      { cant: 12, busca: ['camara', 'domo'], modelo: 'DS-2CD1143G2' },
      { cant: 12, busca: ['instalacion', 'camara'] },
    ],
  },
  {
    id: 'c16',
    frase: 'Para Plaza Las Animas: 3 puntos de acceso',
    cliente: 'Plaza Las Ánimas',
    lineas: [{ cant: 3, busca: ['ap'], modelo: 'EAP650' }],
    sinIa: true,
  },
  {
    id: 'c17',
    frase: '4 NVR 32 canales, 8 discos duros de 6 TB',
    cliente: null,
    lineas: [
      { cant: 4, busca: ['nvr', '32'], modelo: 'DS-7632NXI' },
      { cant: 8, busca: ['disco', '6tb'], modelo: 'HDWT860' },
    ],
    sinIa: true,
  },
  {
    id: 'c18',
    frase: '4\tPza\tNVR 32 Canales IP 8K\tDS-7632NXI\t7,800.00\n2\tPza\tGabinete de pared 6U\tSR-1906\t2,474.54\n50\tPza\tPatch cord Cat6A 0.5m\tLP-STP-6A\t36.47\n1\tLote\tConfiguración lógica de red y NVR\tNEX-CONF\t4,500.00',
    cliente: null,
    lineas: [
      { cant: 4, busca: ['nvr'], modelo: 'DS-7632NXI' },
      { cant: 2, busca: ['gabinete'], modelo: 'SR-1906' },
      { cant: 50, busca: ['patch'], modelo: 'LP-STP-6A' },
      { cant: 1, busca: ['configuracion'], modelo: 'NEX-CONF' },
    ],
    sinIa: true,
  },
  {
    id: 'c19',
    frase: 'Propuesta para Colegio Bosques de Zavaleta\n- 10 cámaras domo\n- 1 NVR 32 canales\n- 2 discos 6 TB $3,720.00\n- instalación x10',
    cliente: 'Colegio Bosques de Zavaleta',
    lineas: [
      { cant: 10, busca: ['camara', 'domo'], modelo: 'DS-2CD1143G2' },
      { cant: 1, busca: ['nvr', '32'], modelo: 'DS-7632NXI' },
      { cant: 2, busca: ['disco', '6tb'], modelo: 'HDWT860' },
      { cant: 10, busca: ['instalacion'] },
    ],
    sinIa: true,
  },
  {
    id: 'c20',
    frase: 'Cantidad\tUnidad\tDescripción\tPrecio\n6\tPieza\tLaptop Lenovo V14 G4\t23,600.00\n1\tServicio\tEnvío a domicilio\t275.00\nSubtotal\t\t\t141,875.00',
    cliente: null,
    lineas: [
      { cant: 6, busca: ['laptop'] },
      { cant: 1, busca: ['envio'] },
    ],
    sinIa: true,
  },
  {
    id: 'c21',
    frase: 'quiero 2 pantallas de 55 para sala de juntas de Lácteos San Andrés, con su soporte de pared y la instalación',
    cliente: 'Lácteos San Andrés',
    lineas: [
      { cant: 2, busca: ['monitor', '55'] },
      { cant: 2, busca: ['soporte'] },
      { cant: 2, busca: ['instalacion'] },
    ],
  },
  {
    id: 'c22',
    frase: 'body cam hikvision 64 gigas, una pieza de muestra',
    cliente: null,
    lineas: [{ cant: 1, busca: ['body', 'cam'] }],
  },
  {
    id: 'c23',
    frase: '35 routers 4G LTE para CEMEX con margen de 22',
    cliente: 'CEMEX',
    lineas: [{ cant: 35, busca: ['router', '4g'] }],
  },
  {
    id: 'c24',
    frase: '10 cámaras domo sin factura',
    cliente: null,
    lineas: [{ cant: 10, busca: ['camara', 'domo'], modelo: 'DS-2CD1143G2' }],
    sinIa: true,
  },
];
