/**
 * Casos de «Redactar con IA». Son inventados: el repo es público. Las cotizaciones reales se pasan con
 * `--real` desde un archivo que no se versiona.
 */
import type { PartidaParaRedactar } from '../cotizar/redactar-ia.js';

export type CasoRedactar = {
  id: string;
  segmento?: string;
  indicacion?: string;
  partidas: PartidaParaRedactar[];
};

const pieza = (name: string, qty: number, extra: Partial<PartidaParaRedactar> = {}): PartidaParaRedactar => ({ name, qty, unit: 'Pieza', ...extra });
const servicio = (name: string, description?: string): PartidaParaRedactar => ({ name, description, qty: 1, unit: 'Servicio' });

export const CASOS_REDACTAR: CasoRedactar[] = [
  {
    id: 'cctv-con-obra',
    segmento: 'OBRA',
    partidas: [
      pieza('Cámara domo IP 4 MP', 10, { brand: 'Hikvision', model: 'DS-2CD1143G2', description: 'Lente de 2.8 mm, IR 30 m, IP67, PoE.' }),
      pieza('Cámara bala IP 4 MP', 4, { brand: 'Hikvision', model: 'DS-2CD1T47G3', description: 'ColorVu, luz blanca 50 m, audio integrado.' }),
      pieza('Grabador NVR de 32 canales', 1, { brand: 'Hikvision', model: 'DS-7632NXI-K2', description: '16 puertos PoE, 2 bahías SATA, H.265+.' }),
      pieza('UPS 1000 VA en línea', 1, { model: 'LP1KRT', description: 'Doble conversión, onda senoidal pura.' }),
      pieza('Tubo conduit de 1 pulgada', 56, { model: 'JU-PD-100', unit: 'Metro' }),
      servicio('Instalación y puesta en marcha de cámaras', 'Tendido de cable, montaje de 14 cámaras y configuración del grabador.'),
    ],
  },
  {
    id: 'lectores-suministro',
    segmento: 'COMERCIAL',
    partidas: [
      pieza('Lector de códigos de barras', 25, { brand: 'Honeywell', model: 'HW-1400G', description: 'Lee 1D y 2D, USB, IP41.' }),
      pieza('Impresora de etiquetas térmica', 5, { brand: 'Zebra', model: 'ZD421D', description: 'Térmica directa, 203 dpi, Ethernet y USB, ZPL y EPL.' }),
    ],
  },
  {
    id: 'licencias',
    segmento: 'COMERCIAL',
    partidas: [{ name: 'Licencia anual de software de asistencia', qty: 50, unit: 'Licencia', model: 'BIO-TA-50', description: 'Hasta 500 empleados y 5 dispositivos.' }],
  },
  {
    id: 'mantenimiento',
    segmento: 'SERVICIO',
    partidas: [
      servicio('Mantenimiento preventivo a sistema de videovigilancia', 'Tres visitas al año a 40 cámaras: limpieza, ajuste y revisión de grabación.'),
      servicio('Mesa de ayuda 24/7', 'Atención remota con respuesta en 24 horas durante 12 meses.'),
    ],
  },
  {
    id: 'materiales',
    segmento: 'COMERCIAL',
    partidas: [
      pieza('Bobina de cable UTP Cat 6', 3, { model: 'PRO-CAT-6', unit: 'Rollo', description: '305 metros, 24 AWG.' }),
      pieza('Conector RJ45 Cat 6', 200, { model: 'RJ45-C6' }),
      pieza('Canaleta de 40 x 25 mm', 60, { unit: 'Metro', model: 'CAN-40' }),
    ],
  },
  {
    id: 'acceso',
    segmento: 'COMERCIAL',
    indicacion: 'es para el acceso principal de la planta 2',
    partidas: [
      pieza('Terminal de reconocimiento facial', 2, { brand: 'ZKTeco', model: 'SpeedFace-V5L', description: 'Rostro, palma y tarjeta; 6,000 rostros.' }),
      pieza('Torniquete de media altura', 2, { model: 'TS-1000' }),
      servicio('Instalación y alta de usuarios', 'Montaje, cableado y alta de hasta 300 usuarios.'),
    ],
  },
  {
    id: 'una-sola-partida',
    segmento: 'COMERCIAL',
    partidas: [pieza('Switch administrable de 24 puertos PoE', 1, { brand: 'Cisco', model: 'CBS350-24P', description: '24 puertos Gigabit PoE+, 4 SFP.' })],
  },
  {
    id: 'sin-ficha',
    segmento: 'COMERCIAL',
    partidas: [pieza('Pantalla LED para interior', 18), pieza('Envío a la ciudad de Puebla', 1)],
  },
];
