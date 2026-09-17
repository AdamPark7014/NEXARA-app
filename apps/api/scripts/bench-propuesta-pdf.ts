/**
 * Banco de pruebas del PDF «Propuesta técnica».
 *
 * Mide lo que Adam reclama: cuánto pesa y cuánto tarda el documento que ve el cliente.
 * Genera una propuesta de 25 partidas (con y sin plano anexo) y reporta bytes y milisegundos.
 *
 *   cd apps/api
 *   node -r ./scripts/ts-node-js-ext.js -r ts-node/register/transpile-only ./scripts/bench-propuesta-pdf.ts
 *
 * Opcional: `BENCH_OUT=C:\ruta\salida` escribe los PDFs para revisarlos a ojo.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generarPropuestaTecnicaPdf, type PropuestaPayload } from '../src/cotizaciones/propuesta-tecnica-pdf';
import { agruparPartidas } from '../src/cotizaciones/partidas-grupos';
import { objetivoDePropuesta } from '../src/cotizaciones/objetivo-plantilla';
import { terminosDeCotizacion } from '../src/cotizaciones/terminos-segmento';

const CONCEPTOS: Array<[string, string, number, number]> = [
  ['Bala TURBOHD 2 Megapixel (1080p) / Lente 3.6 mm / 40 mts IR EXIR / Exterior IP67', 'Pieza', 8, 592.42],
  ['DVR 32 Canales TurboHD + 8 Canales IP / 5 Megapixel Lite / 2 Bahías de Disco Duro', 'Pieza', 1, 7532.55],
  ['Instalación de cámara de seguridad puesta a punto bajo normas estándares', 'Servicio', 15, 1000],
  ['Reinstalación de cable y habilitación de cámara de seguridad', 'Servicio', 14, 500],
  ['Instalación de rack puesta a punto', 'Servicio', 1, 3000],
  ['Insumos materiales para puesta a punto de CCTV bajo normas estándares', 'Insumo', 1, 5000],
  ['Domo TURBOHD 2 Megapixel (1080p) / Lente 2.8 mm / 30 mts IR EXIR / IK10 / IP67', 'Pieza', 7, 606.91],
  ['Fuente de Poder Regulada 12 Vcc / 13.5 Vcc para 16 Cámaras / 16 Amp', 'Pieza', 2, 875.85],
  ['Kit de Transceptores (Baluns) con Terminal PUSH SUPERIOR, Resolución 4K', 'Pieza', 29, 47],
  ['Caja de Conexiones de Metal / Compatible con DS-2CD20XX, B8-TURBOGXX', 'Pieza', 8, 215.73],
  ['Caja de Conexiones de Exterior para Cámaras Tipo Mini Domo / IP66', 'Pieza', 7, 172.5],
  ['Caja Derivación-Conexión de Plástico (100 X 100 X 54 mm) con 7 Glándulas de Goma', 'Pieza', 14, 67.53],
  ['Adaptador Macho Tipo Jack de 3.5 mm Polarizado de 12 Vcc / Terminales Tipo Tornillo', 'Pieza', 29, 6.07],
  ['Bobina de Cable de 305 Metros (1000 Pies) Cat5e, Aleación de Cobre y Aluminio', 'Pieza', 3, 753.92],
  ['Bobina de Cable de 152 Metros (499 Pies), Cat5e, FTP, Blindado, para Intemperie', 'Pieza', 2, 1554.53],
  ['Kit de 20 grapas, 20 taquetes y 20 tornillos para sujetar conductores redondos', 'Pieza', 10, 19.55],
  ['Gabinete para Montaje en Pared - Piso / Puerta de Cristal Templado / 6 UR / 19"', 'Pieza', 1, 2046.61],
  ['Grapa reforzada para cable redondo de 7mm color negro (100pzs)', 'Pieza', 5, 43.62],
  ['Taquete de 1/4 plástico paquete de 100 piezas para fijar objetos con tornillo', 'Pieza', 2, 22.01],
  ['Multicontacto Horizontal (PDU) de 10 Contactos (NEMA 5-15R) Rack 19" 1UR', 'Pieza', 1, 884.8],
  ['Tornillo para taquete TP2X 10 mm x 1 1/2', 'Pieza', 200, 0.7],
  ['Disco duro de 12 teras', 'Pieza', 1, 10594.51],
  ['Montaje para Poste / Compatible con PTZ HIKVISION / Acero Inoxidable', 'Pieza', 2, 517.1],
  ['Poste Seccionado de 3 Metros / Especializado para la Instalación de Videovigilancia', 'Pieza', 1, 2661.58],
  ['Configuración de analíticos de video y puesta en marcha con Hik-Connect', 'Servicio', 1, 4500],
];

function partidasDePrueba() {
  return CONCEPTOS.map(([name, unit, qty, unitPrice]) => ({
    name,
    description: 'Conforme a la especificación técnica acordada; incluye accesorios de montaje.',
    unit,
    qty,
    unitPrice,
    lineTotal: Math.round(qty * unitPrice * 100) / 100,
  }));
}

function payload(planos: PropuestaPayload['planos']): PropuestaPayload {
  const partidas = partidasDePrueba();
  const subtotal = Math.round(partidas.reduce((acc, p) => acc + p.lineTotal, 0) * 100) / 100;
  const iva = Math.round(subtotal * 0.16 * 100) / 100;

  return {
    folio: 'NEX-LJ75100126-0007-JA.CE',
    revision: 1,
    issueDate: '2026-09-17',
    validUntil: '2026-10-02',
    segmentoEtiqueta: 'Comercial',
    cliente: {
      nombre: 'Ing. Carlos Mendoza',
      empresa: 'Grupo Industrial del Norte S.A. de C.V.',
      telefono: '(222) 123 4567',
      correo: 'compras@ginorte.mx',
      direccion: 'Av. Constitución 1200, Col. Centro, Puebla, Pue.',
    },
    proyecto: 'Renovación, mantenimiento y ampliación del sistema de CCTV',
    objetivo: objetivoDePropuesta({ segmento: 'COMERCIAL', partidas, vigenciaDias: 15 }),
    alcance: [
      {
        titulo: 'Modernización del sistema de grabación',
        texto:
          'Se realizará la reubicación del área de monitoreo al sitio definido por el cliente, incluyendo el desmontaje del equipo existente y la instalación de un nuevo grabador con capacidad para 32 canales analógicos y 8 canales IP.',
        vinetas: ['Recableado de las 14 cámaras analógicas existentes.', 'Sustitución de balunes de video.'],
      },
      {
        titulo: 'Mantenimiento de la infraestructura existente',
        texto: 'Como parte del mantenimiento integral del sistema se realizarán las siguientes actividades:',
        vinetas: [
          'Reemplazo de conectores de video y alimentación.',
          'Revisión y adecuación del sistema de alimentación eléctrica de las cámaras.',
          'Suministro e instalación de dos fuentes de alimentación reguladas.',
        ],
      },
    ],
    planos,
    grupos: agruparPartidas(partidas).map((g) => ({
      grupo: g.grupo,
      etiqueta: g.etiqueta,
      subtotal: g.subtotal,
      partidas: g.partidas.map((p) => ({
        name: p.name,
        description: p.description ?? null,
        unit: p.unit ?? null,
        qty: Number(p.qty),
        unitPrice: Number(p.unitPrice),
        lineTotal: Number(p.lineTotal ?? 0),
      })),
    })),
    subtotal,
    iva,
    total: Math.round((subtotal + iva) * 100) / 100,
    currency: 'MXN',
    terminos: terminosDeCotizacion({ segmento: 'COMERCIAL', incluyeInstalacion: true, anticipoPct: 50 }),
    participantes: [{ nombre: 'Luis Joel Aguilar', rolEtiqueta: 'Elaboró', siglas: 'LJ' }],
    empresa: null,
  };
}

/** Copia un PNG grande a `UPLOADS_ROOT` para medir el costo real de un plano anexo. */
function prepararPlano(): { url: string; bytes: number } | null {
  const origen = [
    path.resolve(process.cwd(), '../web/public/mapa-operaciones.png'),
    path.resolve(process.cwd(), '../../apps/web/public/mapa-operaciones.png'),
  ].find((p) => fs.existsSync(p));
  if (!origen) return null;

  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'nexara-bench-'));
  process.env['UPLOADS_ROOT'] = raiz;
  const destino = path.join(raiz, 'plano-demo.png');
  fs.copyFileSync(origen, destino);
  return { url: '/uploads/plano-demo.png', bytes: fs.statSync(destino).size };
}

async function medir(nombre: string, datos: PropuestaPayload, vueltas = 5) {
  // Vuelta en frío aparte: la primera paga la lectura del logo desde disco.
  const frio = process.hrtime.bigint();
  const primero = await generarPropuestaTecnicaPdf(datos);
  const msFrio = Number(process.hrtime.bigint() - frio) / 1e6;

  const tiempos: number[] = [];
  let pdf = primero;
  for (let i = 0; i < vueltas; i += 1) {
    const t0 = process.hrtime.bigint();
    pdf = await generarPropuestaTecnicaPdf(datos);
    tiempos.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  tiempos.sort((a, b) => a - b);
  const mediana = tiempos[Math.floor(tiempos.length / 2)]!;

  const salida = process.env['BENCH_OUT'];
  if (salida) {
    fs.mkdirSync(salida, { recursive: true });
    fs.writeFileSync(path.join(salida, `${nombre.replace(/\W+/g, '-')}.pdf`), pdf);
  }

  console.log(
    `${nombre.padEnd(34)} ${String(pdf.length).padStart(9)} bytes  ` +
      `${(pdf.length / 1024).toFixed(1).padStart(8)} KB  ` +
      `frío ${msFrio.toFixed(1).padStart(7)} ms  mediana ${mediana.toFixed(1).padStart(7)} ms`,
  );
  return { bytes: pdf.length, msFrio, mediana };
}

async function main() {
  const plano = prepararPlano();
  console.log(`Propuesta de ${CONCEPTOS.length} partidas — node ${process.version}`);
  if (plano) console.log(`Plano anexo de prueba: ${(plano.bytes / 1024).toFixed(0)} KB en disco`);
  console.log('');

  await medir('25 partidas, sin planos', payload([]));
  if (plano) {
    await medir('25 partidas + plano grande', payload([{ url: plano.url, nombre: 'Plano CCTV-01', tipo: 'imagen' }]));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
